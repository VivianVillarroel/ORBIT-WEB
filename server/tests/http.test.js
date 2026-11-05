import test from "node:test";
import assert from "node:assert/strict";
import session from "express-session";
import { randomBytes } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { gzipSync, brotliCompressSync } from "node:zlib";
process.env.SESSION_SECRET = randomBytes(48).toString("hex");
process.env.APP_ORIGIN = "http://localhost:3000";
const { createApp } = await import("../app.js");
test("precompressed WebGL assets declare their encoding and original media type", async () => {
  const server = createApp({
    store: new session.MemoryStore(),
    auditWriter: async () => {},
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const paths = [];
  try {
    const source = Buffer.from("ORBIT compression fixture");
    for (const [suffix, encoding, mime] of [
      ["wasm.gz", "gzip", "application/wasm"],
      ["framework.js.gz", "gzip", "application/javascript"],
      ["data.br", "br", "application/octet-stream"],
      ["framework.js.unityweb", null, "application/octet-stream"],
    ]) {
      const name = "verify-" + randomBytes(8).toString("hex") + "." + suffix;
      const target = new URL("../../orbit-web/js/" + name, import.meta.url);
      await writeFile(
        target,
        encoding === "gzip"
          ? gzipSync(source)
          : encoding === "br"
            ? brotliCompressSync(source)
            : source,
        { flag: "wx" },
      );
      paths.push(target);
      const response = await fetch(
        "http://127.0.0.1:" + server.address().port + "/js/" + name,
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-encoding"), encoding);
      assert.ok(response.headers.get("content-type").startsWith(mime));
      assert.equal(await response.text(), source.toString());
    }
  } finally {
    for (const target of paths) await unlink(target);
    await new Promise((resolve) => server.close(resolve));
  }
});
test("HTTP boundaries protect source, configuration, CSRF and security headers", async () => {
  const server = createApp({
    store: new session.MemoryStore(),
    auditWriter: async () => {},
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const live = await fetch(base + "/health/live");
    assert.equal(live.status, 200);
    assert.equal(live.headers.get("x-powered-by"), null);
    assert.equal(live.headers.get("x-content-type-options"), "nosniff");
    for (const p of [
      "/.env",
      "/server/core.js",
      "/database/schema.sql",
      "/api/index.php",
      "/node_modules/express/package.json",
      "/css/%2e%2e%2fsimuladores/m2/Build/m2.loader.js",
      "/%75ploads/file.glb",
      "/simuladores%2fm2%2fBuild/m2.loader.js",
    ])
      assert.equal((await fetch(base + p)).status, 404, p);
    // WHATWG fetch canonicalizes a standalone encoded '..' before transmission;
    // the resulting protected upload must still require authentication.
    assert.equal(
      (await fetch(base + "/css/%2e%2e/uploads/file.glb")).status,
      401,
    );
    const index = await fetch(base + "/");
    const missingAsset = await fetch(base + "/css/no-such-private-path.css");
    assert.equal(missingAsset.status, 404);
    const missingError = await missingAsset.json();
    assert.equal(missingError.error, "Ruta no encontrada.");
    assert.doesNotMatch(
      JSON.stringify(missingError),
      /ENOENT|ORBIT-WEB|node_modules|stack|[A-Z]:\\/,
    );
    const html = await index.text();
    assert.equal(index.status, 200);
    assert.equal(index.headers.get("cache-control"), "no-store");
    assert.match(index.headers.get("content-security-policy"), /nonce-/);
    assert.match(html, /<script nonce=/);
    const csrf = await fetch(base + "/api/auth/csrf");
    assert.equal(csrf.status, 200);
    assert.match(csrf.headers.get("cache-control"), /no-store/);
    assert.match(csrf.headers.get("set-cookie"), /HttpOnly/);
    for (const method of ["POST", "PUT", "DELETE"])
      assert.equal(
        (
          await fetch(base + "/api/universidades", {
            method,
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
        419,
      );
    const cross = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "https://attacker.invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(cross.status, 403);
    const malformed = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{broken",
    });
    assert.equal(malformed.status, 400);
    const array = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    });
    assert.equal(array.status, 400);
    assert.equal((await fetch(base + "/api/auth/me")).status, 401);
    assert.equal((await fetch(base + "/api/auth/csrf/extra")).status, 404);
    assert.equal(
      (await fetch(base + "/simuladores/m2/index.html")).status,
      401,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("production validates the public origin and requires trusted HTTPS for secure sessions", async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
    TRUST_PROXY: process.env.TRUST_PROXY,
  };
  let server;
  try {
    process.env.NODE_ENV = "production";
    for (const origin of [
      "http://example.invalid",
      "https://example.invalid/path",
      "https://user:secret@example.invalid",
      "file:///tmp",
    ]) {
      process.env.APP_ORIGIN = origin;
      assert.throws(() => createApp());
    }
    process.env.APP_ORIGIN = "https://example.invalid";
    process.env.TRUST_PROXY = "1";
    server = createApp({
      store: new session.MemoryStore(),
      auditWriter: async () => {},
    }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    assert.equal((await fetch(base + "/health/live")).status, 200);
    assert.equal((await fetch(base + "/")).status, 400);
    const secured = await fetch(base + "/api/auth/csrf", {
      headers: { "X-Forwarded-Proto": "https" },
    });
    assert.equal(secured.status, 200);
    assert.match(secured.headers.get("set-cookie"), /Secure/);
    assert.match(secured.headers.get("set-cookie"), /HttpOnly/);
    assert.match(secured.headers.get("strict-transport-security"), /max-age=/);
    assert.equal(secured.headers.get("access-control-allow-origin"), null);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
