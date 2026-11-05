import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { query, insert, hashPassword, pool, val } from "../core.js";
import { migrate } from "../scripts/migrate.js";
import { createApp } from "../app.js";
if (!/test/.test(process.env.DB_NAME || ""))
  throw Error("A dedicated test database is required.");
test("Google signup, returning identity, collisions, explicit linking and replay protection", async () => {
  await migrate();
  await query("DELETE FROM orbit_limits");
  const tag = randomBytes(5).toString("hex"),
    address = tag + "@example.invalid",
    sub = "google_" + tag;
  let profile = {
    sub,
    email: address,
    email_verified: true,
    given_name: "Google",
    family_name: tag,
  };
  let exchanges = 0;
  const provider = {
    enabled: () => true,
    authorize: (flow) => "https://accounts.google.com/mock?state=" + flow.state,
    profile: async (code, flow) => {
      exchanges++;
      if (code === "bad-token") throw Error("Invalid signed token");
      return { ...profile, nonce: code === "bad-nonce" ? "wrong" : flow.nonce };
    },
  };
  const server = createApp({ googleProvider: provider }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const c = () => ({ cookie: "", csrf: "" });
  async function request(client, method, path, body) {
    const headers = {};
    if (client.cookie) headers.Cookie = client.cookie;
    if (client.csrf) headers["X-CSRF-Token"] = client.csrf;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(base + path, {
      method,
      headers,
      redirect: "manual",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) client.cookie = set.split(";")[0];
    return res;
  }
  async function start(client, query = "") {
    const res = await request(client, "GET", "/api/auth/google/start" + query);
    assert.equal(res.status, 303);
    return new URL(res.headers.get("location")).searchParams.get("state");
  }
  const callback = (client, state, code = "ok") =>
    request(
      client,
      "GET",
      "/api/auth/google/callback?state=" +
        encodeURIComponent(state) +
        "&code=" +
        code,
    );
  const created = [];
  try {
    const a = c();
    let state = await start(a, "?plan=premium&next=https://evil.invalid");
    let res = await callback(a, state);
    assert.equal(res.headers.get("location"), "/panel.html#/plan");
    let me = await (await request(a, "GET", "/api/auth/me")).json();
    created.push(me.user.id);
    assert.equal(me.user.rol, "estudiante");
    assert.equal(me.user.tipo_estudiante, "independiente");
    assert.ok(me.user.email_verified_at);
    assert.equal(
      await val(
        "SELECT COUNT(*) FROM orbit_google_identities WHERE google_sub=?",
        [sub],
      ),
      1,
    );
    const before = exchanges;
    res = await callback(a, state);
    assert.equal(
      res.headers.get("location"),
      "/login.html?google_error=invalid_flow",
    );
    assert.equal(exchanges, before);
    const b = c();
    state = await start(b);
    await callback(b, state);
    const returning = await (await request(b, "GET", "/api/auth/me")).json();
    assert.equal(returning.user.id, me.user.id);
    // Email changes at Google do not create another account or replace ORBIT's email.
    profile = { ...profile, email: tag + "-changed@example.invalid" };
    const same = c();
    await callback(same, await start(same));
    assert.equal(
      (await (await request(same, "GET", "/api/auth/me")).json()).user.id,
      me.user.id,
    );
    const invalid = c();
    state = await start(invalid);
    await callback(invalid, "wrong");
    assert.equal(exchanges, before + 2);
    res = await callback(invalid, state, "bad-nonce");
    assert.equal(
      res.headers.get("location"),
      "/login.html?google_error=failed",
    );
    assert.equal((await request(invalid, "GET", "/api/auth/me")).status, 401);
    const expired = c();
    state = await start(expired);
    await query(
      "UPDATE orbit_google_flows SET expires_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE state_hash=?",
      [createHash("sha256").update(state).digest("hex")],
    );
    assert.equal(
      (await callback(expired, state)).headers.get("location"),
      "/login.html?google_error=invalid_flow",
    );
    const unverified = c();
    profile = { ...profile, email_verified: false };
    assert.equal(
      (await callback(unverified, await start(unverified))).headers.get(
        "location",
      ),
      "/login.html?google_error=failed",
    );
    profile.email_verified = true;
    const password = "test linking password " + tag,
      existingEmail = tag + "-existing@example.invalid";
    const uid = await insert("usuarios", {
      nombre: "Admin",
      apellido: tag,
      email: existingEmail,
      password_hash: await hashPassword(password),
      rol: "admin",
      activo: 1,
    });
    created.push(uid);
    profile = { ...profile, sub: "existing_" + tag, email: existingEmail };
    const conflict = c();
    res = await callback(conflict, await start(conflict));
    assert.equal(
      res.headers.get("location"),
      "/login.html?google_error=existing_account",
    );
    assert.equal(
      await val(
        "SELECT COUNT(*) FROM orbit_google_identities WHERE user_id=?",
        [uid],
      ),
      0,
    );
    const local = c();
    res = await request(local, "POST", "/api/auth/login", {
      email: existingEmail,
      password,
    });
    const login = await res.json();
    local.csrf = login.csrf;
    assert.equal(
      (
        await request(c(), "POST", "/api/auth/google/link", {
          actual: password,
        })
      ).status,
      419,
    );
    assert.equal(
      (
        await request(local, "POST", "/api/auth/google/link", {
          actual: "wrong",
        })
      ).status,
      422,
    );
    res = await request(local, "POST", "/api/auth/google/link", {
      actual: password,
    });
    assert.equal(res.status, 200);
    state = new URL((await res.json()).url).searchParams.get("state");
    res = await callback(local, state);
    assert.equal(res.headers.get("location"), "/panel.html#/cuenta");
    const linked = c();
    await callback(linked, await start(linked));
    me = await (await request(linked, "GET", "/api/auth/me")).json();
    assert.equal(me.user.id, uid);
    assert.equal(me.user.rol, "admin");
    await query("UPDATE usuarios SET activo=0 WHERE id=?", [uid]);
    const inactive = c();
    res = await callback(inactive, await start(inactive));
    assert.equal(
      res.headers.get("location"),
      "/login.html?google_error=account_unavailable",
    );
    const cancelled = c();
    state = await start(cancelled);
    res = await request(
      cancelled,
      "GET",
      "/api/auth/google/callback?state=" +
        state +
        "&error=access_denied&error_description=unsafe-text",
    );
    assert.equal(
      res.headers.get("location"),
      "/login.html?google_error=cancelled",
    );
    console.log(
      "GOOGLE_INTEGRATION_OK signup, stable identity, explicit linking, unchanged roles, state, nonce, replay, expiry, verified email, cancellation and disabled accounts.",
    );
  } finally {
    for (const uid of created)
      await query("DELETE FROM usuarios WHERE id=?", [uid]);
    await query("DELETE FROM orbit_google_flows");
    await new Promise((r) => server.close(r));
    await pool.end();
  }
});
