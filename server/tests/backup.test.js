import test from "node:test";
import assert from "node:assert/strict";
import { backupValue } from "../scripts/backup.js";

test("backup serializes objects as JSON literals and preserves SQL NULL/binary escaping", () => {
  assert.equal(backupValue({ approved: true }), "'{\\\"approved\\\":true}'");
  assert.equal(backupValue(null), "NULL");
  assert.equal(backupValue(Buffer.from([0, 255])), "X'00ff'");
  assert.equal(backupValue("a'b\\c\n"), "'a\\'b\\\\c\\n'");
});
