import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import { chromium } from "playwright";
import { chromiumLaunchOptions } from "./browser-helper.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("browser: account/import requests stay in their view, credentials remain exact and payments use server configuration", async () => {
  const app = express();
  app.use(
    express.static(fileURLToPath(new URL("../../orbit-web/", import.meta.url))),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  let browser;
  try {
    browser = await chromium.launch(chromiumLaunchOptions());
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let role = "admin",
      teacherPayload,
      importRequests = 0,
      paymentRequests = 0;
    let payment = { enabled: false, methods: [] };
    const emailArrived = deferred(),
      emailRelease = deferred();
    const importArrived = deferred(),
      importRelease = deferred();
    const paymentArrived = deferred(),
      paymentRelease = deferred();
    const user = () => ({
      id: 1,
      nombre: "Revisión",
      apellido: "UI",
      email: "ui@example.invalid",
      rol: role,
      tipo_estudiante: "independiente",
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const endpoint = url.pathname.slice(5),
        method = request.method();
      let result = { items: [] };
      if (endpoint === "auth/me")
        result = { user: user(), csrf: "c".repeat(64) };
      else if (endpoint === "auth/google/status")
        result = { enabled: false, linked: false };
      else if (endpoint === "dashboard") result = { stats: {} };
      else if (endpoint === "opciones")
        result = {
          universidades: [{ id: 1, nombre: "Institución" }],
          carreras: [{ id: 1, nombre: "Carrera", universidad_id: 1 }],
        };
      else if (endpoint === "auth/email-request") {
        emailArrived.resolve();
        await emailRelease.promise;
        result = { challenge: "example-challenge", message: "Código enviado" };
      } else if (endpoint === "docentes" && method === "POST") {
        teacherPayload = request.postDataJSON();
        result = { id: 2 };
      } else if (endpoint === "importar/estudiantes") {
        importRequests++;
        importArrived.resolve();
        await importRelease.promise;
        result = {
          creados: 1,
          omitidas: [],
          credenciales: [
            {
              nombre: '=HYPERLINK("https://example.invalid")',
              email: "example@example.invalid",
              codigo: "@student",
              carrera: "＋SUM(1;2)",
              password: "-random-initial-password",
            },
          ],
        };
      } else if (endpoint === "suscripcion")
        result = {
          planes: [
            { codigo: "gratis", nombre: "Gratis", precio_mes: 0 },
            { codigo: "premium", nombre: "Premium", precio_mes: 35 },
          ],
          actual: null,
          pendiente: null,
          pagos: [],
          payment,
        };
      else if (endpoint === "suscripcion/pago") {
        paymentRequests++;
        paymentArrived.resolve();
        await paymentRelease.promise;
        result = { id: 3 };
      } else if (endpoint === "auth/logout")
        return route.fulfill({
          status: 503,
          json: { error: "No pudimos cerrar la sesión. Inténtalo de nuevo." },
        });
      return route.fulfill({ json: result });
    });

    await page.goto(base + "/panel.html#/cuenta");
    await page.locator("#nextEmail").fill("changed@example.invalid");
    await page.locator("#emailPassword").fill("current password");
    await page.locator("#emailForm button").click();
    await emailArrived.promise;
    await page.locator('[data-nav="docentes"]').click();
    await page.locator("#newBtn").waitFor({ state: "visible" });
    const emailResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/email-request"),
    );
    emailRelease.resolve();
    await emailResponse;
    // The previous document can be discarded while the request completes. A
    // response must never overwrite or dereference elements in the new view.
    await page.locator("#newBtn").click();
    await page.locator("#fld-nombre").fill("Docente");
    await page.locator("#fld-apellido").fill("Prueba");
    await page.locator("#fld-email").fill("teacher@example.invalid");
    const exactPassword = " leading and trailing password ";
    await page.locator("#fld-password").fill(exactPassword);
    await page.locator("#fld-universidad_id").selectOption("1");
    await page.locator('#modal [type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    assert.equal(
      teacherPayload.password,
      exactPassword,
      "password input must retain intentional whitespace",
    );

    await page.goto(base + "/panel.html#/cuenta");
    await page.locator("#pN").fill("short pass");
    await page.locator("#pC").fill("short pass");
    await page.locator('#fPw [type="submit"]').click();
    assert.match(
      await page.locator("#fPw .err:not([hidden])").textContent(),
      /12 caracteres/,
    );

    await page.goto(base + "/panel.html#/importar");
    await page.locator("#impUni").selectOption("1");
    await page.locator("#impFile").setInputFiles({
      name: "students.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "nombre;apellido;email;codigo;carrera\nName;Last;example@example.invalid;1;Carrera",
      ),
    });
    await page.locator("#impGo").click();
    await importArrived.promise;
    assert.equal(await page.locator("#impGo").isDisabled(), true);
    assert.equal(await page.locator("#impTipo").isDisabled(), true);
    await page.locator("#impGo").evaluate((button) => button.click());
    assert.equal(importRequests, 1);
    importRelease.resolve();
    await page.locator("#credBtn").waitFor({ state: "visible" });
    const downloaded = page.waitForEvent("download");
    await page.locator("#credBtn").click();
    const download = await downloaded;
    const csv = await readFile(await download.path(), "utf8");
    assert.match(csv, /"'=HYPERLINK/);
    assert.match(csv, /"'@student"/);
    assert.match(csv, /"'＋SUM\(1;2\)"/);
    assert.match(csv, /"'-random-initial-password"/);
    assert.equal(importRequests, 1);

    await page.locator("#impFile").setInputFiles({
      name: "malformed.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        'nombre;apellido;email;codigo;carrera\n"Unclosed;Last;example@example.invalid;1;Carrera',
      ),
    });
    await page
      .getByText("El archivo CSV tiene comillas sin cerrar.")
      .waitFor({ state: "visible" });
    assert.equal(await page.locator("#impGo").count(), 0);

    role = "estudiante";
    await page.goto(base + "/panel.html?account=independent#/plan");
    await page.locator("#page h1").waitFor({ state: "visible" });
    await page
      .getByText(
        "Los datos de pago aún no están disponibles. Contacta a ORBIT.",
      )
      .waitFor({ state: "visible" });
    assert.equal(await page.locator("#payForm").count(), 0);
    payment = {
      enabled: true,
      holder: "ORBIT <literal>",
      bank: "Banco de prueba",
      account: "123",
      qr_url: null,
      methods: ["transferencia"],
    };
    await page.reload();
    await page.locator("#payForm").waitFor({ state: "visible" });
    assert.deepEqual(
      await page
        .locator("#pMetodo option")
        .evaluateAll((options) => options.map((option) => option.value)),
      ["transferencia"],
    );
    assert.match(await page.locator("#page").textContent(), /ORBIT <literal>/);
    assert.equal(await page.locator("#page literal").count(), 0);
    await page.locator("#pRef").fill("reference");
    await page.locator('#payForm [type="submit"]').click();
    await paymentArrived.promise;
    await page
      .locator('#payForm [type="submit"]')
      .evaluate((button) => button.click());
    assert.equal(paymentRequests, 1);
    await page.locator('[data-nav="cuenta"]').click();
    await page.locator("#fMe").waitFor({ state: "visible" });
    const paymentResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/suscripcion/pago"),
    );
    paymentRelease.resolve();
    await paymentResponse;
    assert.equal(await page.locator("#fMe").isVisible(), true);
    assert.equal(await page.locator("#payForm").count(), 0);
    await page.locator("#logout").click();
    await page
      .getByText("No pudimos cerrar la sesión. Inténtalo de nuevo.")
      .waitFor({ state: "visible" });
    assert.equal(new URL(page.url()).pathname, "/panel.html");
    assert.equal(await page.locator("#logout").isDisabled(), false);
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
