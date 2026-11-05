import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { chromiumLaunchOptions } from "./browser-helper.js";
import { pool, insert, query, hashPassword, val } from "../core.js";
import { migrate } from "../scripts/migrate.js";
import { createApp } from "../app.js";
if (!/test/.test(process.env.DB_NAME || ""))
  throw Error("A dedicated test database is required.");
test("real browser: registration, email code, login, account and password recovery", async () => {
  await migrate();
  await query("DELETE FROM orbit_limits");
  process.env.APP_ORIGIN = "http://127.0.0.1:3138";
  const tag = randomBytes(5).toString("hex"),
    address = tag + "-browser@example.invalid",
    password = "browser strong password " + tag,
    messages = [];
  const server = createApp({
    sendMail: async (to, subject, body) => {
      messages.push({ to, body });
    },
  }).listen(3138, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch(chromiumLaunchOptions());
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.APP_ORIGIN + "/registro.html");
    await page.locator("#r-nom").fill("Registro");
    await page.locator("#r-ape").fill(tag);
    await page.locator("#r-mail").fill(address);
    await page.locator("#r-pass").fill(password);
    await page.locator("#rgSubmit").click();
    await page.locator("#verificationCode").waitFor({ state: "visible" });
    assert.equal(messages.length, 1);
    await page
      .locator("#verificationCode")
      .fill(messages.at(-1).body.match(/\b\d{6}\b/)[0]);
    await page.locator("#rgSubmit").click();
    await page.waitForURL("**/panel.html");
    await page.locator("#page h1").waitFor({ state: "visible" });
    await page.goto(process.env.APP_ORIGIN + "/panel.html#/cuenta");
    await page.locator("#fMe").waitFor({ state: "visible" });
    await page.locator("#mNom").fill("Nombre actualizado");
    await page.locator("#fMe button[type=submit]").click();
    await page.waitForFunction(() =>
      document.querySelector("#toast")?.textContent.includes("Datos guardados"),
    );
    await page.locator("#nextEmail").fill(tag + "-changed@example.invalid");
    await page.locator("#emailPassword").fill(password);
    await page.locator("#emailForm button").click();
    await page.locator("#emailCode").waitFor({ state: "visible" });
    await page
      .locator("#emailCode")
      .fill(messages.at(-1).body.match(/\b\d{6}\b/)[0]);
    await page.locator("#emailForm button").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#toast")
        ?.textContent.includes("Correo confirmado"),
    );
    await page.goto(process.env.APP_ORIGIN + "/recuperar.html");
    await page.locator("#resetEmail").fill(tag + "-changed@example.invalid");
    await page.locator("#resetForm button[type=submit]").click();
    await page.locator("#resetPassword").waitFor({ state: "visible" });
    await page.locator("#resetPassword").fill(password + " NEW");
    await page.locator("#resetConfirm").fill(password + " NEW");
    await page
      .locator("#verificationCode")
      .fill(messages.at(-1).body.match(/\b\d{6}\b/)[0]);
    await page.locator("#resetForm button[type=submit]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#resetMessage")
        ?.textContent.includes("Contraseña actualizada"),
    );
    await page.goto(process.env.APP_ORIGIN + "/login.html");
    await page.locator("#l-mail").fill(tag + "-changed@example.invalid");
    await page.locator("#l-pass").fill(password + " NEW");
    await page.locator("#lgSubmit").click();
    await page.waitForURL("**/panel.html");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(process.env.APP_ORIGIN + "/panel.html#/cuenta");
    await page.locator("#fMe").waitFor({ state: "visible" });
    assert.ok(await page.locator("#emailForm").isVisible());
    assert.deepEqual(errors, []);
    console.log(
      "ORBIT_BROWSER_OK: register, code, profile, email change, recovery, login and mobile account.",
    );
  } finally {
    if (browser) await browser.close();
    await query("DELETE FROM usuarios WHERE email LIKE ?", [tag + "-%"]);
    await query("DELETE FROM orbit_codes WHERE email LIKE ?", [tag + "-%"]);
    await new Promise((r) => server.close(r));
    await pool.end();
  }
});
