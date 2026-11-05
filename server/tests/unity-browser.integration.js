import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { chromiumLaunchOptions } from "./browser-helper.js";
import { pool, insert, query, hashPassword, val } from "../core.js";
import { migrate } from "../scripts/migrate.js";
import { createApp } from "../app.js";

if (!/test/.test(process.env.DB_NAME || ""))
  throw Error("A dedicated test database is required.");

test("browser: teacher preview, empty Unity space and administrator audit access", async () => {
  process.env.UNITY_WEBGL_ENABLED = "false";
  process.env.APP_ORIGIN = "http://127.0.0.1:3139";
  await migrate();
  const tag = randomBytes(5).toString("hex"),
    password = "unity browser password " + tag,
    userIds = [],
    labIds = [],
    errors = [];
  let institution, browser, server, auditId;
  try {
    institution = await insert("universidades", {
      nombre: "Unity test " + tag,
    });
    const career = await insert("carreras", {
      universidad_id: institution,
      nombre: "Ingeniería " + tag,
    });
    for (const role of ["docente", "estudiante"]) {
      const user = await insert("usuarios", {
        nombre: role,
        apellido: tag,
        email: `${tag}-${role}@example.invalid`,
        password_hash: await hashPassword(password),
        universidad_id: institution,
        rol: role,
      });
      userIds.push(user);
      if (role === "docente") {
        const teacher = await insert("docentes", { usuario_id: user });
        await query(
          "INSERT INTO docente_carrera(docente_id,carrera_id) VALUES(?,?)",
          [teacher, career],
        );
      } else
        await insert("estudiantes", {
          usuario_id: user,
          carrera_id: career,
          codigo: "unity-" + tag,
          tipo: "institucional",
        });
    }
    for (const [name, url, state] of [
      ["Unity pendiente", "simuladores/m2/index.html", "publicado"],
      [
        "Vista docente",
        "uploads/modelos/preview-" + tag + ".glb",
        "en_desarrollo",
      ],
      [
        "Modelo publicado",
        "uploads/modelos/student-" + tag + ".glb",
        "publicado",
      ],
    ]) {
      const lab = await insert("laboratorios", {
        nombre: name + " " + tag,
        area: "Ingeniería y técnica",
        modelo_url: url,
        estado: state,
      });
      labIds.push(lab);
      await query(
        "INSERT INTO laboratorio_carrera(laboratorio_id,carrera_id) VALUES(?,?)",
        [lab, career],
      );
    }
    const adminUser = await insert("usuarios", {
      nombre: "Admin",
      apellido: tag,
      email: `${tag}-admin@example.invalid`,
      password_hash: await hashPassword(password),
      rol: "admin",
    });
    userIds.push(adminUser);
    const independent = await insert("usuarios", {
      nombre: "Independiente",
      apellido: tag,
      email: `${tag}-independiente@example.invalid`,
      password_hash: await hashPassword(password),
      rol: "estudiante",
    });
    userIds.push(independent);
    await insert("estudiantes", {
      usuario_id: independent,
      tipo: "independiente",
      codigo: "ind-" + tag,
    });
    auditId = await insert("orbit_audit", {
      actor_id: adminUser,
      actor_role: "admin",
      action: "review",
      entity: "review-" + tag,
      entity_id: labIds[0],
      request_id: tag,
      data: JSON.stringify({
        after: {
          nombre: "<img src=x onerror=alert(1)>",
          password: "test-sensitive-password",
        },
      }),
    });
    server = createApp().listen(3139, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    browser = await chromium.launch(chromiumLaunchOptions());
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (error) => errors.push(error.message));
    // The renderer itself belongs to model-viewer; this test covers ORBIT's preview controls.
    await page.route("https://cdn.jsdelivr.net/**", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'customElements.define("model-viewer", class extends HTMLElement { connectedCallback() { setTimeout(() => { this.loaded = true; this.dispatchEvent(new Event("load")); }, 50); } });',
      }),
    );
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    async function login(role) {
      await page.goto(process.env.APP_ORIGIN + "/login.html");
      await page.locator("#l-mail").fill(`${tag}-${role}@example.invalid`);
      await page.locator("#l-pass").fill(password);
      await page.locator("#lgSubmit").click();
      await page.waitForURL("**/panel.html");
    }
    await login("docente");
    assert.equal(await page.locator('[data-nav="auditoria"]').count(), 0);
    await page.goto(process.env.APP_ORIGIN + "/panel.html#/auditoria");
    await page.waitForFunction(() => location.hash === "#/");
    let courseItems = [900001, 900002].map((id) => ({
      id,
      nombre: "Confirmación " + id,
      carrera: "Carrera",
      periodo: "2026",
      estado: "activa",
    }));
    const deletions = [];
    await page.route("**/api/clases", (route) =>
      route.fulfill({ json: { items: courseItems } }),
    );
    await page.route(/\/api\/clases\/90000[12]$/, (route) => {
      const id = Number(route.request().url().split("/").at(-1));
      deletions.push(id);
      courseItems = courseItems.filter((course) => course.id !== id);
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(process.env.APP_ORIGIN + "/panel.html#/clases");
    await page.locator('[data-del="900001"]').click();
    await page.locator('#modal button[value="si"]').click();
    await page.locator('[data-del="900001"]').waitFor({ state: "detached" });
    await page.locator('[data-del="900002"]').click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    await page.locator('[data-del="900002"]').waitFor({ state: "visible" });
    assert.deepEqual(
      deletions,
      [900001],
      "Escape must not repeat the previous affirmative dialog result",
    );
    await page.unroute("**/api/clases");
    await page.unroute(/\/api\/clases\/90000[12]$/);
    await page.goto(process.env.APP_ORIGIN + "/panel.html#/laboratorios");
    const previewLink = page.locator(
      `a.btn[href="#/laboratorios/${labIds[1]}"]`,
    );
    await previewLink.waitFor({ state: "visible" });
    assert.equal(await previewLink.textContent(), "Probar práctica");
    await previewLink.click();
    await page.locator("#resetPreview").waitFor({ state: "visible" });
    assert.equal(await page.locator("#prForm").count(), 0);
    await page.waitForFunction(
      () => document.querySelector("#timer")?.textContent !== "0:00",
    );
    await page.locator("#resetPreview").click();
    assert.equal(await page.locator("#timer").textContent(), "0:00");
    await page.goto(
      process.env.APP_ORIGIN + "/panel.html#/laboratorios/" + labIds[0],
    );
    await page.locator(".unity-empty").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#practiceStatus").textContent(),
      "Prueba docente",
    );
    assert.equal(
      await page.locator("#prForm, .unity-stage iframe, canvas").count(),
      0,
    );
    assert.equal(await page.locator(".unity-empty").textContent(), "");
    await mkdir(".private/review", { recursive: true });
    await page.screenshot({
      path: ".private/review/unity-desktop.png",
      fullPage: true,
    });
    await page.locator("#logout").click();
    await page.waitForURL("**/login.html");
    await login("estudiante");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      process.env.APP_ORIGIN + "/panel.html#/laboratorios/" + labIds[0],
    );
    await page.locator(".unity-empty").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#practiceStatus").textContent(),
      "Práctica en preparación",
    );
    assert.equal(
      await page
        .locator("#prForm, #timer, .unity-stage iframe, canvas")
        .count(),
      0,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: ".private/review/unity-mobile.png",
      fullPage: true,
    });
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
    await page.goto(
      process.env.APP_ORIGIN + "/panel.html#/laboratorios/" + labIds[2],
    );
    await page
      .getByRole("button", { name: "Volver a cargar" })
      .waitFor({ state: "visible" });
    assert.equal(
      await page.locator('#prForm [type="submit"]').isDisabled(),
      true,
    );
    assert.equal(await page.locator("#timer").textContent(), "0:00");
    assert.equal(
      requests.some((url) => /\/simuladores\/.*\/Build\//.test(url)),
      false,
    );
    assert.equal(
      Number(
        await val(
          "SELECT COUNT(*) FROM practicas WHERE laboratorio_id IN (?,?,?)",
          labIds,
        ),
      ),
      0,
    );
    await page.locator("#menuBtn").click();
    await page.locator("#logout").click();
    await page.waitForURL("**/login.html");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login("admin");
    await page.locator('[data-nav="auditoria"]').click();
    await page.locator("#auditEntity").fill("review-" + tag);
    await page.locator('#auditFilters [type="submit"]').click();
    await page
      .locator(`#auditRows [data-audit="${auditId}"]`)
      .waitFor({ state: "visible" });
    await page.locator(`#auditRows [data-audit="${auditId}"]`).click();
    assert.match(
      await page.locator(".audit-data").textContent(),
      /<img src=x onerror=alert\(1\)>/,
    );
    assert.equal(await page.locator(".audit-data img").count(), 0);
    assert.equal(
      (await page.locator(".audit-data").textContent()).includes(
        "test-sensitive-password",
      ),
      false,
    );
    await page.screenshot({
      path: ".private/review/audit-desktop.png",
      fullPage: true,
    });
    await page.locator("#modal [data-x]").click();
    await page.locator("#logout").click();
    await page.waitForURL("**/login.html");
    await login("independiente");
    await page.locator('[data-nav="plan"]').click();
    await page
      .getByText(
        "Los datos de pago aún no están disponibles. Contacta a ORBIT.",
      )
      .waitFor({ state: "visible" });
    assert.equal(await page.locator("#payForm").count(), 0);
    assert.equal(
      (await page.locator("#page").textContent()).includes(
        "configura en js/panel.js",
      ),
      false,
    );
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (auditId) await query("DELETE FROM orbit_audit WHERE id=?", [auditId]);
    for (const lab of labIds)
      await query("DELETE FROM laboratorios WHERE id=?", [lab]);
    for (const user of userIds)
      await query("DELETE FROM usuarios WHERE id=?", [user]);
    if (institution) {
      await query("DELETE FROM carreras WHERE universidad_id=?", [institution]);
      await query("DELETE FROM universidades WHERE id=?", [institution]);
    }
    await pool.end();
  }
});
