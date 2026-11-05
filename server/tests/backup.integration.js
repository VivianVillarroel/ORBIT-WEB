import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  unlink,
  rmdir,
} from "node:fs/promises";
import path from "node:path";
import { createBackup } from "../scripts/backup.js";
import { pool, query, ident } from "../core.js";

if (!/test/.test(process.env.DB_NAME || ""))
  throw new Error(
    "Integration tests require a dedicated DB_NAME containing test.",
  );

test("backup restores all pages, JSON types, exact numbers and escaped/binary data without admin access", async () => {
  const suffix = randomBytes(8)
    .toString("hex")
    .replace(/[0-9]/g, (n) => String.fromCharCode(103 + Number(n)));
  const original = `backup_fixture_${suffix}`;
  const restored = `backup_restored_${suffix}`;
  let directory, target, restoreConnection;
  try {
    await query(
      `CREATE TABLE ${ident(original)}(id BIGINT UNSIGNED PRIMARY KEY,json_value JSON NULL,decimal_value DECIMAL(30,12) NOT NULL,binary_value VARBINARY(64),text_value TEXT,created_at DATETIME(6),observed_at TIMESTAMP(6)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
    const jsonSamples = [
      '{"large":9007199254740993,"nested":[true,null,"Órbita 🪐"]}',
      '[1,"dos",true,null]',
      JSON.stringify('A; "quoted" \\ path\nline\u0000 🛰️'),
      "true",
      "false",
      "null",
      null,
    ];
    const totalRows = 2010;
    for (let start = 0; start < totalRows; start += 500) {
      const values = [];
      const rows = [];
      for (
        let index = start;
        index < Math.min(start + 500, totalRows);
        index++
      ) {
        rows.push("(?,?,?,?,?,?,FROM_UNIXTIME(?))");
        values.push(
          index < 1005
            ? String(index)
            : (9007199254740993n + BigInt(index - 1005)).toString(),
          jsonSamples[index % jsonSamples.length],
          "123456789012345678.123456789012",
          Buffer.from([0, 1, 39, 92, 255]),
          "Línea; 'quote' \\ path\nsecond line\u0000 Ω",
          "2026-11-05 01:02:03.123456",
          "1700000000.123456",
        );
      }
      await query(
        `INSERT INTO ${ident(original)} VALUES ${rows.join(",")}`,
        values,
      );
    }
    const base = path.resolve("server/test-output");
    await mkdir(base, { recursive: true });
    directory = await mkdtemp(path.join(base, "backup-roundtrip-"));
    target = await createBackup(directory);
    const files = await readdir(directory);
    assert.deepEqual(
      files,
      [path.basename(target)],
      "only the complete SQL file may be published",
    );
    const dump = await readFile(target, "utf8");
    const statements = dump
      .split("\n")
      .filter((line) => line.startsWith(`INSERT INTO ${ident(original)} `));
    assert.equal(
      statements.length,
      totalRows,
      "every page including adjacent BIGINT IDs beyond 2^53 must be included",
    );
    await query(`CREATE TABLE ${ident(restored)} LIKE ${ident(original)}`);
    restoreConnection = await pool.getConnection();
    await restoreConnection.query(
      "SET SESSION sql_mode='STRICT_TRANS_TABLES,ANSI_QUOTES,NO_BACKSLASH_ESCAPES'",
    );
    await restoreConnection.query("SET SESSION time_zone='+09:00'");
    const prelude = dump
      .slice(0, dump.indexOf("CREATE TABLE "))
      .split("\n")
      .filter((line) => line.startsWith("SET "));
    for (const statement of prelude) await restoreConnection.query(statement);
    for (const statement of statements)
      await restoreConnection.query(
        statement.replace(
          `INSERT INTO ${ident(original)} `,
          `INSERT INTO ${ident(restored)} `,
        ),
      );
    await restoreConnection.query("SET FOREIGN_KEY_CHECKS=1");
    await restoreConnection.query(
      "SET SESSION sql_mode=@ORBIT_BACKUP_OLD_SQL_MODE",
    );
    await restoreConnection.query(
      "SET SESSION time_zone=@ORBIT_BACKUP_OLD_TIME_ZONE",
    );
    const [[mode]] = await restoreConnection.query(
      "SELECT @@SESSION.sql_mode AS current_mode",
    );
    assert.match(mode.current_mode, /NO_BACKSLASH_ESCAPES/);
    const [[zone]] = await restoreConnection.query(
      "SELECT @@SESSION.time_zone AS current_zone",
    );
    assert.equal(zone.current_zone, "+09:00");
    await restoreConnection.query("SET SESSION sql_mode=DEFAULT");
    await restoreConnection.query("SET SESSION time_zone=DEFAULT");
    restoreConnection.release();
    restoreConnection = null;
    const select = (table) =>
      `SELECT CAST(id AS CHAR) AS id,CAST(json_value AS CHAR) AS json_text,CAST(decimal_value AS CHAR) AS decimal_text,HEX(binary_value) AS binary_hex,text_value,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s.%f') AS time_text,CAST(UNIX_TIMESTAMP(observed_at) AS CHAR) AS observed_unix FROM ${ident(table)} ORDER BY id`;
    assert.deepEqual(
      await query(select(restored)),
      await query(select(original)),
    );
  } finally {
    if (restoreConnection) {
      await restoreConnection.query("SET FOREIGN_KEY_CHECKS=1").catch(() => {});
      await restoreConnection
        .query("SET SESSION sql_mode=DEFAULT")
        .catch(() => {});
      await restoreConnection
        .query("SET SESSION time_zone=DEFAULT")
        .catch(() => {});
      restoreConnection.release();
    }
    await query(`DROP TABLE IF EXISTS ${ident(restored)}`);
    await query(`DROP TABLE IF EXISTS ${ident(original)}`);
    if (target) await unlink(target);
    if (directory) await rmdir(directory);
    await pool.end();
  }
});
