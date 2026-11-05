import mysql from "mysql2/promise";
import { pathToFileURL } from "node:url";

const technicalTables = new Set([
  "orbit_sessions",
  "orbit_codes",
  "orbit_limits",
  "orbit_google_flows",
]);
const immutableTables = new Set([
  "orbit_audit",
  "notas_historial",
  "certificados",
]);
const businessTables = [
  "universidades",
  "carreras",
  "usuarios",
  "docentes",
  "estudiantes",
  "directores",
  "docente_carrera",
  "clases",
  "inscripciones",
  "laboratorios",
  "laboratorio_carrera",
  "libros",
  "libro_carrera",
  "libro_resultados",
  "clase_laboratorio",
  "practicas",
  "licencias",
  "planes",
  "suscripciones",
  "pagos",
  "solicitudes",
  "orbit_google_identities",
];
const error = (code, message) => ({ level: "error", code, message });
const warning = (code, message) => ({ level: "warning", code, message });

export function inspectEnvironment(env) {
  const findings = [];
  if (env.NODE_ENV !== "production")
    findings.push(
      error(
        "NODE_ENV",
        "Configura NODE_ENV=production en el entorno de destino.",
      ),
    );
  try {
    const origin = new URL(env.APP_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error("Invalid origin");
  } catch {
    findings.push(
      error(
        "APP_ORIGIN",
        "Configura APP_ORIGIN como un origen HTTPS sin credenciales, ruta ni parámetros.",
      ),
    );
  }
  if (
    !env.SESSION_SECRET ||
    env.SESSION_SECRET.length < 48 ||
    /^(.)\1+$/.test(env.SESSION_SECRET)
  )
    findings.push(
      error(
        "SESSION_SECRET",
        "Se requiere un secreto de sesión aleatorio de al menos 48 caracteres.",
      ),
    );
  if (env.TRUST_PROXY !== undefined && !["0", "1"].includes(env.TRUST_PROXY))
    findings.push(
      error(
        "TRUST_PROXY",
        "TRUST_PROXY admite 0 o 1; confirma la topología del proxy antes de usar 1.",
      ),
    );
  for (const [key, fallback] of [
    ["PORT", "3000"],
    ["DB_PORT", "3306"],
    ["SMTP_PORT", "587"],
  ]) {
    const value = env[key] ?? fallback;
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
      findings.push(
        error(key, `Configura ${key} con un puerto entre 1 y 65535.`),
      );
  }
  if (
    !env.DB_NAME ||
    !/^[a-zA-Z0-9_]{1,64}$/.test(env.DB_NAME) ||
    /(^|_)(test|demo)(_|$)/i.test(env.DB_NAME)
  )
    findings.push(
      error(
        "DB_NAME",
        "Selecciona una base de producción con nombre explícito, sin datos de prueba.",
      ),
    );
  if (!env.DB_USER || /^(root|mysql\.|admin$)/i.test(env.DB_USER))
    findings.push(
      error(
        "DB_USER",
        "Usa una cuenta de ejecución dedicada, separada de las credenciales administrativas.",
      ),
    );
  if (!env.DB_PASSWORD)
    findings.push(
      error(
        "DB_PASSWORD",
        "La cuenta de base de datos debe tener una contraseña configurada.",
      ),
    );
  for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"])
    if (!env[key]?.trim())
      findings.push(
        error(
          key,
          `Falta ${key}; el registro y la recuperación requieren correo configurado.`,
        ),
      );
  if (
    env.SMTP_SECURE !== undefined &&
    !["true", "false"].includes(env.SMTP_SECURE)
  )
    findings.push(error("SMTP_SECURE", "SMTP_SECURE debe ser true o false."));
  if (!!env.GOOGLE_CLIENT_ID?.trim() !== !!env.GOOGLE_CLIENT_SECRET?.trim())
    findings.push(
      error(
        "GOOGLE_OAUTH",
        "Configura ambas credenciales Google o deja ambas vacías.",
      ),
    );
  if (!env.GOOGLE_CLIENT_ID?.trim())
    findings.push(
      warning(
        "GOOGLE_DISABLED",
        "El acceso con Google seguirá desactivado hasta configurar su cliente y callback.",
      ),
    );
  if (env.UNITY_WEBGL_ENABLED === "true")
    findings.push(
      warning(
        "UNITY_ENABLED",
        "La compilación Unity habilitada requiere una prueba de docente y estudiante en el dominio definitivo.",
      ),
    );
  return findings;
}

export function productionDatabaseSupported(version) {
  // Compatibility with older versions does not mean they receive new security fixes.
  // MySQL 8.0 entered Sustaining Support in April 2026. New production targets
  // use an active LTS line; never upgrade an existing data directory implicitly.
  return /^(8\.4|9\.7)\./.test(String(version)) && !/mariadb/i.test(version);
}

export function inspectGrants(lines, database) {
  const findings = [];
  const granted = new Map();
  for (const raw of lines) {
    const line = String(raw).replace(/`([^`]*)`/g, "$1");
    const match = line.match(/^GRANT (.+?) ON (.+?) TO /i);
    if (!match) {
      findings.push(
        error(
          "UNVERIFIED_GRANTS",
          "La cuenta tiene roles o permisos que no se pueden certificar mediante concesiones directas; revisa sus permisos efectivos.",
        ),
      );
      continue;
    }
    const privileges = match[1]
      .split(",")
      .map((value) => value.trim().toUpperCase());
    const target = match[2].trim();
    if (/WITH GRANT OPTION/i.test(line)) {
      findings.push(
        error(
          "GRANT_OPTION",
          "La cuenta de ejecución no debe conceder permisos a terceros.",
        ),
      );
      continue;
    }
    if (target === "*.*" && privileges.every((value) => value === "USAGE"))
      continue;
    if (!target.startsWith(database + ".") || target.endsWith(".*")) {
      findings.push(
        error(
          "BROAD_GRANTS",
          "Retira privilegios globales, sobre toda la base, sobre otras bases o de concesión a terceros; otorga permisos por tabla.",
        ),
      );
      continue;
    }
    const table = target.slice(database.length + 1);
    const allowed =
      table === "orbit_schema_migrations"
        ? ["SELECT"]
        : immutableTables.has(table)
          ? ["SELECT", "INSERT"]
          : technicalTables.has(table)
            ? ["SELECT", "INSERT", "UPDATE", "DELETE"]
            : ["SELECT", "INSERT", "UPDATE"];
    if (privileges.some((privilege) => !allowed.includes(privilege)))
      findings.push(
        error(
          "EXCESS_TABLE_GRANTS",
          `La tabla ${table} tiene permisos que exceden la política de ejecución.`,
        ),
      );
    const collected = granted.get(table) || new Set();
    for (const privilege of privileges) collected.add(privilege);
    granted.set(table, collected);
  }
  const required = [
    ...businessTables.map((table) => [
      table,
      table === "libro_resultados" || table === "orbit_google_identities"
        ? ["SELECT", "INSERT"]
        : ["SELECT", "INSERT", "UPDATE"],
    ]),
    ...[...immutableTables].map((table) => [table, ["SELECT", "INSERT"]]),
    ...[...technicalTables].map((table) => [
      table,
      ["SELECT", "INSERT", "UPDATE", "DELETE"],
    ]),
    ["orbit_schema_migrations", ["SELECT"]],
  ];
  const missing = required
    .filter(([table, privileges]) =>
      privileges.some((privilege) => !granted.get(table)?.has(privilege)),
    )
    .map(([table]) => table);
  if (missing.length)
    findings.push(
      error(
        "MISSING_TABLE_GRANTS",
        `Faltan concesiones directas necesarias sobre: ${missing.join(", ")}.`,
      ),
    );
  return findings;
}

export async function checkProduction(env = process.env) {
  const findings = inspectEnvironment(env);
  if (findings.some((finding) => finding.level === "error")) return findings;
  let connection;
  try {
    connection = await mysql.createConnection({
      host: env.DB_HOST || "127.0.0.1",
      port: Number(env.DB_PORT || 3306),
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      connectTimeout: 5000,
      multipleStatements: false,
    });
    const [[database]] = await connection.execute(
      "SELECT VERSION() AS version",
    );
    if (!productionDatabaseSupported(database.version))
      findings.push(
        error(
          "DATABASE_SUPPORT",
          "El destino de producción debe usar MySQL 8.4 LTS o 9.7 LTS con sus actualizaciones de seguridad. La compatibilidad con 8.0 no constituye soporte de producción vigente.",
        ),
      );
    const [migrations] = await connection.execute(
      "SELECT version FROM orbit_schema_migrations WHERE version='20261105_soft_delete'",
    );
    if (!migrations.length)
      findings.push(
        error(
          "SCHEMA_VERSION",
          "Ejecuta db:migrate con credenciales DDL separadas antes de arrancar.",
        ),
      );
    await connection.execute(
      "SELECT id,actor_id,action,entity,data FROM orbit_audit LIMIT 0",
    );
    const [disabled] = await connection.execute(
      "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='CHECK' AND ENFORCED='NO'",
    );
    if (disabled.length)
      findings.push(
        error(
          "DISABLED_CHECKS",
          "Hay restricciones CHECK desactivadas en la base de datos.",
        ),
      );
    const [grants] = await connection.query("SHOW GRANTS FOR CURRENT_USER()");
    findings.push(
      ...inspectGrants(
        grants.map((row) => Object.values(row)[0]),
        env.DB_NAME,
      ),
    );
  } catch (exception) {
    findings.push(
      error(
        "DATABASE_CHECK",
        "No se pudieron verificar conexión, esquema o permisos con la cuenta de ejecución. Revisa la configuración y las migraciones sin publicar credenciales.",
      ),
    );
  } finally {
    await connection?.end();
  }
  return findings;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const findings = await checkProduction();
  for (const finding of findings)
    console.log(
      `${finding.level.toUpperCase()} ${finding.code}: ${finding.message}`,
    );
  if (findings.some((finding) => finding.level === "error"))
    process.exitCode = 1;
  else
    console.log(
      "Configuración y permisos comprobados. Aún se requiere validar HTTPS, correo real, restauración y carga en el alojamiento definitivo.",
    );
}
