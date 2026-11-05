import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../core.js";

const softDeleteEntities = [
  "universidades",
  "carreras",
  "usuarios",
  "clases",
  "laboratorios",
  "libros",
  "licencias",
  "planes",
  "solicitudes",
  "practicas",
];
const softDeleteTables = [
  ...softDeleteEntities,
  "docente_carrera",
  "laboratorio_carrera",
  "libro_carrera",
  "clase_laboratorio",
];
const checks = [
  ["usuarios", "ck_usuarios_activo", "activo IN (0,1)"],
  ["usuarios", "ck_usuarios_auth_version", "auth_version >= 1"],
  [
    "inscripciones",
    "ck_inscripciones_nota",
    "nota_final IS NULL OR nota_final BETWEEN 0 AND 100",
  ],
  [
    "practicas",
    "ck_practicas_puntaje",
    "puntaje IS NULL OR puntaje BETWEEN 0 AND 100",
  ],
  ["practicas", "ck_practicas_completada", "completada IN (0,1)"],
  [
    "libro_resultados",
    "ck_libro_resultados_puntaje",
    "puntaje IS NULL OR puntaje BETWEEN 0 AND 100",
  ],
  ["planes", "ck_planes_precio", "precio_mes >= 0"],
  ["licencias", "ck_licencias_precio", "precio_estudiante_mes >= 0"],
  [
    "licencias",
    "ck_licencias_fechas",
    "fecha_fin IS NULL OR fecha_fin >= fecha_inicio",
  ],
  [
    "suscripciones",
    "ck_suscripciones_fechas",
    "fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio",
  ],
  ["pagos", "ck_pagos_monto", "monto >= 0"],
  ["pagos", "ck_pagos_meses", "meses BETWEEN 1 AND 12"],
  ["certificados", "ck_certificados_nota", "nota BETWEEN 51 AND 100"],
];
const indexes = [
  ...softDeleteEntities.map((table) => [
    table,
    `ix_${table}_deleted`,
    "deleted_at",
  ]),
  [
    "practicas",
    "ix_practicas_progreso",
    "clase_id,estudiante_id,laboratorio_id,completada",
  ],
  ["practicas", "ix_practicas_estudiante_fecha", "estudiante_id,realizada_en"],
  [
    "suscripciones",
    "ix_suscripciones_usuario_estado_fin",
    "usuario_id,estado,fecha_fin",
  ],
  ["notas_historial", "ix_notas_inscripcion_fecha", "inscripcion_id,creado_en"],
];

// Older MySQL versions parse CHECK clauses but do not enforce them.
export function supportedDatabaseVersion(version) {
  const parts = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!parts) return false;
  const [, major, minor, patch] = parts.map(Number);
  return /mariadb/i.test(version)
    ? major > 10 || (major === 10 && minor >= 4)
    : major > 8 || (major === 8 && (minor > 0 || patch >= 16));
}

export async function migrate() {
  // GET_LOCK belongs to one connection, so all DDL and its release must use it.
  // DDL implicitly commits in MySQL; every step is resumable instead of claiming
  // that a transaction could undo a partially applied schema change.
  const connection = await pool.getConnection();
  const query = async (statement, parameters = []) =>
    (await connection.execute(statement, parameters))[0];
  let lockName;
  let locked = false;
  let usable = true;
  try {
    const [database] = await query(
      "SELECT DATABASE() AS name, VERSION() AS version",
    );
    if (!database.name || !supportedDatabaseVersion(database.version))
      throw new Error(
        "La migración requiere MySQL 8.0.16+ o MariaDB 10.4+ y una base seleccionada.",
      );
    lockName =
      "orbit:migrate:" +
      createHash("sha256").update(database.name).digest("hex").slice(0, 48);
    const [lock] = await query("SELECT GET_LOCK(?,30) AS acquired", [lockName]);
    if (Number(lock.acquired) !== 1)
      throw new Error(
        "Otra migración de ORBIT está en ejecución; inténtalo al terminar.",
      );
    locked = true;
    await query("SET SESSION lock_wait_timeout=30");
    const sql = await readFile(
      new URL("../../orbit-web/database/schema.sql", import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await query(statement);
    const columns = await query("SHOW COLUMNS FROM usuarios");
    if (!columns.some((c) => c.Field === "email_verified_at"))
      await query(
        "ALTER TABLE usuarios ADD COLUMN email_verified_at DATETIME NULL",
      );
    if (!columns.some((c) => c.Field === "auth_version"))
      await query(
        "ALTER TABLE usuarios ADD COLUMN auth_version INT NOT NULL DEFAULT 1",
      );
    const archiveColumns = await query(
      "SELECT TABLE_NAME AS table_name,COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('deleted_at','deleted_by')",
    );
    for (const table of softDeleteTables) {
      const additions = [
        ["deleted_at", "DATETIME NULL"],
        ["deleted_by", "INT UNSIGNED NULL"],
      ].filter(
        ([name]) =>
          !archiveColumns.some(
            (column) => column.table_name === table && column.name === name,
          ),
      );
      if (additions.length)
        await query(
          `ALTER TABLE \`${table}\` ${additions.map(([name, definition]) => `ADD COLUMN \`${name}\` ${definition}`).join(",")}`,
        );
    }
    await query(
      "CREATE TABLE IF NOT EXISTS orbit_schema_migrations(version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS orbit_sessions(sid VARCHAR(128) PRIMARY KEY,data MEDIUMTEXT NOT NULL,expires_at DATETIME NOT NULL,user_id INT UNSIGNED NULL,INDEX(expires_at),INDEX(user_id)) ENGINE=InnoDB",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS orbit_codes(id CHAR(32) PRIMARY KEY,email VARCHAR(160) NOT NULL,purpose VARCHAR(30) NOT NULL,code_hash CHAR(64) NOT NULL,payload JSON NOT NULL,attempts INT NOT NULL DEFAULT 0,expires_at DATETIME NOT NULL,used_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX(email,purpose,created_at),INDEX(expires_at)) ENGINE=InnoDB",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS orbit_limits(bucket CHAR(64) PRIMARY KEY,hits INT NOT NULL,expires_at DATETIME NOT NULL,INDEX(expires_at)) ENGINE=InnoDB",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS orbit_google_identities(google_sub VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,user_id INT UNSIGNED NOT NULL UNIQUE,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT fk_google_user FOREIGN KEY(user_id) REFERENCES usuarios(id) ON DELETE CASCADE) ENGINE=InnoDB",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS orbit_google_flows(state_hash CHAR(64) PRIMARY KEY,expires_at DATETIME NOT NULL,INDEX(expires_at)) ENGINE=InnoDB",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS orbit_audit(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,actor_id INT UNSIGNED NULL,actor_role VARCHAR(24) NULL,action VARCHAR(80) NOT NULL,entity VARCHAR(64) NOT NULL,entity_id BIGINT UNSIGNED NULL,request_id CHAR(24) NULL,ip_hash CHAR(64) NULL,data JSON NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX ix_audit_created(created_at),INDEX ix_audit_entity(entity,entity_id,created_at),INDEX ix_audit_actor(actor_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    const constraints = await query(
      "SELECT TABLE_NAME AS table_name,CONSTRAINT_NAME AS name" +
        (/mariadb/i.test(database.version) ? "" : ",ENFORCED AS enforced") +
        " FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='CHECK'",
    );
    const disabled = constraints.find(
      (c) =>
        c.enforced === "NO" &&
        checks.some(
          ([table, name]) => c.table_name === table && c.name === name,
        ),
    );
    if (disabled)
      throw new Error(
        `La restricción ${disabled.name} de ${disabled.table_name} está desactivada. Revisa los datos y actívala antes de continuar.`,
      );
    const missing = checks.filter(
      ([table, name]) =>
        !constraints.some((c) => c.table_name === table && c.name === name),
    );
    // Reject incompatible historical records; never silently alter grades, money,
    // certificates or dates in order to make a new constraint fit.
    for (const [table, name, expression] of missing) {
      const [invalid] = await query(
        `SELECT COUNT(*) AS total FROM \`${table}\` WHERE NOT (${expression})`,
      );
      if (Number(invalid.total))
        throw new Error(
          `No se puede aplicar ${name}: hay ${invalid.total} registros incompatibles en ${table}. Revisa los datos y vuelve a ejecutar la migración.`,
        );
    }
    for (const [table, name, expression] of missing)
      await query(
        `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` CHECK (${expression})`,
      );
    const existingIndexes = await query(
      "SELECT DISTINCT TABLE_NAME AS table_name,INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()",
    );
    for (const [table, name, columns] of indexes)
      if (
        !existingIndexes.some((i) => i.table_name === table && i.name === name)
      )
        await query(
          `ALTER TABLE \`${table}\` ADD INDEX \`${name}\` (${columns})`,
        );
    await query(
      "INSERT IGNORE INTO planes(codigo,nombre,precio_mes,descripcion,activo) VALUES('gratis','Gratis',0,'Laboratorios y libros de muestra',1),('premium','Premium',35,'Acceso al catálogo completo; precio editable por administración',1)",
    );
    await query(
      "INSERT IGNORE INTO orbit_schema_migrations(version) VALUES ('20261029_node'),('20261105_integrity_audit'),('20261105_soft_delete')",
    );
  } finally {
    if (locked) {
      try {
        await query("SELECT RELEASE_LOCK(?)", [lockName]);
      } catch (error) {
        usable = false;
        connection.destroy();
        throw error;
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
    await migrate();
    console.log("Esquema ORBIT actualizado sin borrar datos.");
  } finally {
    await pool.end();
  }
}
