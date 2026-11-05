import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import { chromium } from "playwright";
import { chromiumLaunchOptions } from "./browser-helper.js";

test("browser: catalog only shows published API content and handles empty or unavailable catalog", async () => {
  const webRoot = fileURLToPath(new URL("../../orbit-web/", import.meta.url));
  const app = express();
  app.use(express.static(webRoot));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  let browser;
  try {
    browser = await chromium.launch(chromiumLaunchOptions());
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Inicia sesión" } }),
    );
    let response = { laboratorios: [], libros: [], planes: [] };
    let unavailable = false;
    await page.route("**/api/catalogo", (route) =>
      unavailable ? route.abort() : route.fulfill({ json: response }),
    );
    await page.goto(base);
    await page
      .locator("#catStatus")
      .filter({ hasText: "Los nuevos laboratorios están en preparación." })
      .waitFor({ state: "visible" });
    assert.equal(await page.locator("#catGrid li").count(), 0);
    assert.equal(await page.locator("#catGrid").isVisible(), false);
    assert.doesNotMatch(
      await page.locator("#estudiantes").textContent(),
      /VentLab|CT Virtual Lab|Freud, Jung y Vygotsky/,
    );
    assert.match(await page.locator("#proyectos").textContent(), /VentLab/);

    response = {
      laboratorios: [],
      libros: [{ titulo: "Libro publicado", materia: "Lectura", gratis: 1 }],
      planes: [],
    };
    await page.reload();
    await page.locator("#catGrid li").waitFor({ state: "visible" });
    assert.equal(await page.locator("#catGrid li").count(), 1);
    assert.match(
      await page.locator("#catGrid").textContent(),
      /Libro publicado/,
    );
    assert.doesNotMatch(
      await page.locator("#catGrid").textContent(),
      /VentLab|CT Virtual Lab/,
    );
    assert.match(
      await page.locator("#catStatus").textContent(),
      /libros disponibles/,
    );

    unavailable = true;
    await page.reload();
    await page
      .locator("#catStatus")
      .filter({ hasText: "No pudimos cargar el catálogo." })
      .waitFor({ state: "visible" });
    assert.equal(await page.locator("#catGrid li").count(), 0);
    assert.equal(await page.locator("#catGrid").isVisible(), false);
    assert.doesNotMatch(
      await page.locator("#estudiantes").textContent(),
      /VentLab|CT Virtual Lab|Libro publicado/,
    );
    assert.deepEqual(errors, []);
    assert.equal(
      (
        await readFile(
          new URL(
            "../../orbit-web/plantillas/laboratorios.csv",
            import.meta.url,
          ),
          "utf8",
        )
      ).trim(),
      "nombre;carreras;equipo;descripcion;area",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
