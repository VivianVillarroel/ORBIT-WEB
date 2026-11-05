import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { pool, ident } from "../core.js";
import mysql from "mysql2";

export function backupValue(value) {
  // mysql2 decodes JSON columns to objects; escaping an object directly emits
  // SQL assignments instead of a JSON literal and breaks the restored backup.
  if (
    value &&
    typeof value === "object" &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Date)
  )
    value = JSON.stringify(value);
  return mysql.escape(value);
}

export async function createBackup(directory = "backups") {
  const connection = await pool.getConnection();
  const target = path.resolve(
    directory,
    "orbit-backup-" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      randomBytes(6).toString("hex") +
      ".sql",
  );
  const partial = target + ".partial";
  let file;
  let ownsPartial = false;
  let usable = true;
  let previousTimeZone;
  try {
    await mkdir(directory, { recursive: true });
    file = await open(partial, "wx", 0o600);
    ownsPartial = true;
    const [[settings]] = await connection.query(
      "SELECT @@SESSION.time_zone AS time_zone",
    );
    previousTimeZone = settings.time_zone;
    await connection.query("SET SESSION time_zone='+00:00'");
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const [tables] = await connection.query(
      "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'",
    );
    await file.writeFile(
      "-- Private ORBIT backup. Contains personal data. Restore only into an empty database.\nSET NAMES utf8mb4;\nSET @ORBIT_BACKUP_OLD_SQL_MODE=@@SESSION.sql_mode;\nSET SESSION sql_mode='STRICT_TRANS_TABLES,NO_AUTO_VALUE_ON_ZERO,NO_ENGINE_SUBSTITUTION';\nSET @ORBIT_BACKUP_OLD_TIME_ZONE=@@SESSION.time_zone;\nSET SESSION time_zone='+00:00';\nSET FOREIGN_KEY_CHECKS=0;\n",
    );
    for (const table of tables) {
      const name = Object.values(table)[0];
      const [create] = await connection.query(
        "SHOW CREATE TABLE " + ident(name),
      );
      await file.writeFile(create[0]["Create Table"] + ";\n");
      const [keys] = await connection.query(
        "SHOW KEYS FROM " + ident(name) + " WHERE Key_name='PRIMARY'",
      );
      const keyNames = keys
        .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
        .map((key) => key.Column_name);
      const order = keyNames.map(ident).join(",");
      // Bound memory use for large audit/practice tables. Primary-key ordering
      // and the consistent snapshot keep pages stable during normal DML.
      let cursor;
      let cursorExpressions = keyNames.map(() => "?");
      for (let offset = 0; ; offset += 1000) {
        const [rows, fields] = await connection.query({
          sql:
            "SELECT * FROM " +
            ident(name) +
            (cursor
              ? " WHERE (" + order + ") > (" + cursorExpressions.join(",") + ")"
              : "") +
            (order ? " ORDER BY " + order : "") +
            " LIMIT 1000" +
            (order ? "" : " OFFSET ?"),
          values: order ? cursor || [] : [offset],
          // Preserve JSON primitives, JSON null versus SQL NULL, and exact
          // BIGINT/DECIMAL values instead of parsing them through JavaScript.
          typeCast(field, next) {
            if (field.type === "JSON" || field.extendedFormat === "json")
              return field.string("utf8");
            if (["LONGLONG", "DECIMAL", "NEWDECIMAL"].includes(field.type))
              return field.string("ascii");
            return next();
          },
        });
        if (!rows.length) break;
        if (order) {
          cursor = keyNames.map((key) => rows.at(-1)[key]);
          // Comparing an integer column with an escaped string can otherwise
          // use DOUBLE arithmetic and skip adjacent IDs beyond 2^53.
          cursorExpressions = keyNames.map((key) => {
            const field = fields.find((f) => f.name === key);
            if (field.columnType === mysql.Types.LONGLONG)
              return "CAST(? AS DECIMAL(20,0))";
            if (
              [mysql.Types.DECIMAL, mysql.Types.NEWDECIMAL].includes(
                field.columnType,
              )
            )
              return `CAST(? AS DECIMAL(65,${field.decimals}))`;
            return "?";
          });
        }
        await file.writeFile(
          rows
            .map(
              (row) =>
                "INSERT INTO " +
                ident(name) +
                " (" +
                Object.keys(row).map(ident).join(",") +
                ") VALUES (" +
                Object.values(row).map(backupValue).join(",") +
                ");\n",
            )
            .join(""),
        );
      }
    }
    await file.writeFile(
      "SET FOREIGN_KEY_CHECKS=1;\nSET SESSION sql_mode=@ORBIT_BACKUP_OLD_SQL_MODE;\nSET SESSION time_zone=@ORBIT_BACKUP_OLD_TIME_ZONE;\n",
    );
    await connection.commit();
    await file.sync();
    await file.close();
    file = null;
    await rename(partial, target);
    return target;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      usable = false;
      connection.destroy();
    }
    await file?.close().catch(() => {});
    if (ownsPartial) await unlink(partial).catch(() => {});
    throw error;
  } finally {
    if (usable && previousTimeZone !== undefined) {
      try {
        await connection.query("SET SESSION time_zone=?", [previousTimeZone]);
      } catch {
        usable = false;
        connection.destroy();
      }
    }
    if (usable) connection.release();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log("Respaldo privado creado: " + (await createBackup()));
  } finally {
    await pool.end();
  }
}
