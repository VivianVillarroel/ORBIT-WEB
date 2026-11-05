import test from "node:test";
import assert from "node:assert/strict";
import { supportedDatabaseVersion } from "../scripts/migrate.js";

test("migration refuses database versions that silently ignore CHECK constraints", () => {
  for (const version of ["5.7.44", "8.0.15", "10.3.39-MariaDB", "unknown"])
    assert.equal(supportedDatabaseVersion(version), false, version);
  for (const version of [
    "8.0.16",
    "8.4.0",
    "9.1.0",
    "10.4.0-MariaDB",
    "11.4.2-MariaDB",
  ])
    assert.equal(supportedDatabaseVersion(version), true, version);
});
