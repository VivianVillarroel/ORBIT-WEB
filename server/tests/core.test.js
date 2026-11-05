import test from "node:test";
import assert from "node:assert/strict";
import {
  validate,
  int,
  dec,
  bool,
  email,
  text,
  date,
  safeURL,
  ids,
  positiveId,
  hashPassword,
  verifyPassword,
  academicScope,
  auditData,
} from "../core.js";
test("rejects invalid numbers, dates, booleans and non-object input", () => {
  for (const value of ["1e100", true, {}, [], Infinity, -1])
    assert.throws(() => validate({ id: int(true) }, { id: value }));
  assert.throws(() => validate({ day: date }, { day: "2026-02-30" }));
  assert.throws(() => validate({ active: bool }, { active: "false" }));
  assert.throws(() => validate({}, []));
  assert.deepEqual(validate({ grade: dec() }, { grade: 0 }), { grade: 0 });
  assert.throws(() => validate({ grade: dec() }, { grade: 101 }));
});
test("requires fields and prevents mass assignment", () => {
  assert.throws(() => validate({ name: text(10, true) }, {}));
  assert.deepEqual(
    validate({ name: text(10, true) }, { name: " Alice ", rol: "admin" }),
    { name: "Alice" },
  );
  assert.equal(
    validate({ email }, { email: "HELLO@example.org" }).email,
    "hello@example.org",
  );
});
test("blocks malicious URLs and ids", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.org",
    "uploads/../database/file",
    "uploads/a\\b",
    'https://x.test/\"',
    "uploads/%2e%2e/database/file",
    "https://name:password@example.org/model.glb",
    "uploads/a.glb?redirect=x",
  ])
    assert.equal(safeURL(url), false);
  assert.equal(safeURL("simuladores/m2/index.html"), true);
  assert.equal(safeURL("https://example.org/model.glb"), true);
  for (const id of ["1 OR 1=1", "-1", "0", "1.1", {}, "9007199254740992"])
    assert.throws(() => positiveId(id));
  assert.deepEqual(ids([1, 1, 2]), [1, 2]);
});
test("audit snapshots redact nested credentials and bound untrusted values", () => {
  const result = auditData({
    password_hash: "private",
    email: "person@example.invalid",
    nested: { csrfToken: "private", actual: "private", nota_final: 85 },
    large: "x".repeat(10000),
    values: Array(120).fill(1),
  });
  assert.equal(result.password_hash, "[redacted]");
  assert.equal(result.nested.csrfToken, "[redacted]");
  assert.equal(result.nested.actual, "[redacted]");
  assert.equal(result.nested.nota_final, 85);
  assert.equal(result.email, "person@example.invalid");
  assert.equal(result.large.length, 3000);
  assert.equal(result.values.length, 100);
});
test("new passwords are strong, bcrypt hashes and legacy hashes remain compatible", async () => {
  await assert.rejects(hashPassword("short"));
  await assert.rejects(hashPassword("🔐".repeat(6)));
  await assert.rejects(hashPassword("🔐".repeat(30)));
  const hash = await hashPassword("a sufficiently long password");
  assert.ok(await verifyPassword("a sufficiently long password", hash));
  assert.ok(
    await verifyPassword(
      "a sufficiently long password",
      hash.replace("$2b$", "$2y$"),
    ),
  );
  assert.equal(await verifyPassword("wrong", hash), false);
});
test("academic scopes always constrain non-admin users", () => {
  assert.match(academicScope({ rol: "admin" })[0], /k\.deleted_at IS NULL/);
  assert.match(
    academicScope({ rol: "admin" })[0],
    /ac\.activo=1 AND au\.activo=1/,
  );
  assert.deepEqual(academicScope({ rol: "admin" })[1], []);
  assert.match(
    academicScope({ rol: "director", director_carrera_id: 2 })[0],
    /carrera_id=\?/,
  );
  assert.deepEqual(academicScope({ rol: "docente", docente_id: 3 })[1], [3]);
  assert.match(
    academicScope({ rol: "estudiante", estudiante_id: 4 })[0],
    /estudiante_id=\?/,
  );
});
