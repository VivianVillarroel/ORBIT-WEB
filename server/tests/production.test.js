import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectEnvironment,
  inspectGrants,
  productionDatabaseSupported,
} from "../../deploy/node/preflight.mjs";

test("production preflight rejects development configuration without exposing credentials", () => {
  const findings = inspectEnvironment({
    NODE_ENV: "development",
    APP_ORIGIN: "http://localhost:3000",
    SESSION_SECRET: "do-not-output-secret",
    DB_NAME: "orbit_test",
    DB_USER: "root",
    DB_PASSWORD: "do-not-output-password",
  });
  for (const code of [
    "NODE_ENV",
    "APP_ORIGIN",
    "SESSION_SECRET",
    "DB_NAME",
    "DB_USER",
    "SMTP_HOST",
  ])
    assert.ok(
      findings.some(
        (finding) => finding.code === code && finding.level === "error",
      ),
    );
  assert.doesNotMatch(JSON.stringify(findings), /do-not-output/);
  const configured = inspectEnvironment({
    NODE_ENV: "production",
    APP_ORIGIN: "https://orbit.example",
    SESSION_SECRET: "0a1b2c3d4e5f".repeat(6),
    DB_NAME: "orbit",
    DB_USER: "orbit_app",
    DB_PASSWORD: "set-private",
    SMTP_HOST: "smtp.example",
    SMTP_USER: "mailer",
    SMTP_PASSWORD: "set-private",
    MAIL_FROM: "ORBIT <mail@orbit.example>",
  });
  assert.equal(
    configured.some((finding) => finding.level === "error"),
    false,
  );
});

test("production preflight separates compatibility from active MySQL LTS support", () => {
  assert.equal(productionDatabaseSupported("8.0.43"), false);
  assert.equal(productionDatabaseSupported("8.4.8"), true);
  assert.equal(productionDatabaseSupported("9.7.0"), true);
  assert.equal(productionDatabaseSupported("10.4.34-MariaDB"), false);
});

test("runtime grants reject broad privileges, business deletion and inherited roles", () => {
  const targets = [
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
  const lines = [
    "GRANT USAGE ON *.* TO 'runtime'@'%'",
    ...targets.map(
      (table) =>
        `GRANT SELECT, INSERT, UPDATE ON \`orbit\`.\`${table}\` TO 'runtime'@'%'`,
    ),
    ...["orbit_audit", "notas_historial", "certificados"].map(
      (table) =>
        `GRANT SELECT, INSERT ON \`orbit\`.\`${table}\` TO 'runtime'@'%'`,
    ),
    ...[
      "orbit_sessions",
      "orbit_codes",
      "orbit_limits",
      "orbit_google_flows",
    ].map(
      (table) =>
        `GRANT SELECT, INSERT, UPDATE, DELETE ON \`orbit\`.\`${table}\` TO 'runtime'@'%'`,
    ),
    "GRANT SELECT ON `orbit`.`orbit_schema_migrations` TO 'runtime'@'%'",
  ];
  assert.deepEqual(inspectGrants(lines, "orbit"), []);
  for (const grant of [
    "GRANT ALL PRIVILEGES ON `orbit`.* TO 'runtime'@'%'",
    "GRANT SELECT ON *.* TO 'runtime'@'%'",
    "GRANT DELETE ON `orbit`.`usuarios` TO 'runtime'@'%'",
    "GRANT UPDATE ON `orbit`.`orbit_audit` TO 'runtime'@'%'",
    "GRANT 'application_role'@'%' TO 'runtime'@'%'",
  ])
    assert.ok(
      inspectGrants([...lines, grant], "orbit").some(
        (finding) => finding.level === "error",
      ),
    );
});
