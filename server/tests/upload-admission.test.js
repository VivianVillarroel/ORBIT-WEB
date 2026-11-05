import test from "node:test";
import assert from "node:assert/strict";
import { createUploadAdmission } from "../routes/upload-admission.js";

test("multipart admission bounds process memory and releases abandoned requests exactly once", () => {
  const enter = createUploadAdmission();
  const first = enter(1);
  assert.throws(
    () => enter(1),
    (error) => error.status === 429,
  );
  const second = enter(2);
  assert.throws(
    () => enter(3),
    (error) => error.status === 429,
  );
  first(); // request completed or aborted
  first(); // both close and finally must not release another user's slot
  const third = enter(3);
  assert.throws(
    () => enter(4),
    (error) => error.status === 429,
  );
  second();
  third();
  const retry = enter(1);
  retry();
});
