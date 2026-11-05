import test from "node:test";
import assert from "node:assert/strict";
import {
  createGoogleProvider,
  checkedGoogleProfile,
  sameSecret,
  googleRedirectURI,
} from "../google-auth.js";
test("Google authorization uses code flow, PKCE, nonce and minimal identity scopes", () => {
  const old = {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
    origin: process.env.APP_ORIGIN,
  };
  try {
    process.env.GOOGLE_CLIENT_ID = "test.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-only-secret";
    process.env.APP_ORIGIN = "http://localhost:3000";
    const provider = createGoogleProvider();
    assert.equal(provider.enabled(), true);
    const url = new URL(
      provider.authorize({
        state: "random-state",
        nonce: "random-nonce",
        verifier: "long-test-verifier",
      }),
    );
    assert.equal(url.origin, "https://accounts.google.com");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(url.searchParams.get("code_challenge"));
    assert.equal(url.searchParams.get("nonce"), "random-nonce");
    assert.equal(url.searchParams.get("state"), "random-state");
    assert.equal(url.searchParams.get("redirect_uri"), googleRedirectURI());
    assert.equal(url.searchParams.get("scope"), "openid email profile");
    assert.equal(url.searchParams.has("client_secret"), false);
    assert.equal(url.searchParams.has("access_type"), false);
  } finally {
    for (const [key, v] of Object.entries({
      GOOGLE_CLIENT_ID: old.id,
      GOOGLE_CLIENT_SECRET: old.secret,
      APP_ORIGIN: old.origin,
    })) {
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
});
test("verified identity requires matching nonce, a stable subject and a valid email", () => {
  const payload = {
    sub: "123456789",
    nonce: "abc",
    email: "Person@Gmail.com",
    email_verified: true,
    given_name: " Persona ",
    family_name: "Prueba",
  };
  assert.deepEqual(checkedGoogleProfile(payload, "abc"), {
    sub: "123456789",
    email: "person@gmail.com",
    nombre: "Persona",
    apellido: "Prueba",
  });
  for (const changes of [
    { email_verified: false },
    { email_verified: "true" },
    { nonce: "wrong" },
    { sub: "" },
    { sub: 123 },
    { email: "invalid" },
  ])
    assert.throws(() =>
      checkedGoogleProfile({ ...payload, ...changes }, "abc"),
    );
  assert.equal(sameSecret("é", "aa"), false);
  assert.equal(sameSecret(["x"], "x"), false);
  assert.equal(sameSecret("secret", "secret"), true);
});
