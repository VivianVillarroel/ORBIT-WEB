import { createApp } from "./app.js";
import { pool, query } from "./core.js";
if (process.env.NODE_ENV === "production") {
  const missing = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter(
    (key) => !process.env[key]?.trim(),
  );
  if (missing.length)
    throw new Error(
      "Configura explícitamente la base de producción: " + missing.join(", "),
    );
}
const app = createApp();
await query("SELECT auth_version,email_verified_at FROM usuarios LIMIT 0");
await query("SELECT sid FROM orbit_sessions LIMIT 0");
await query("SELECT id,action,data FROM orbit_audit LIMIT 0");
const [schema] = await query(
  "SELECT version FROM orbit_schema_migrations WHERE version='20261105_soft_delete'",
);
if (!schema) throw new Error("Ejecuta db:migrate antes de iniciar ORBIT.");
const server = app.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log("ORBIT Node.js listo en puerto " + (process.env.PORT || 3000)),
);
server.requestTimeout = 120000;
server.headersTimeout = 15000;
const cleanup = setInterval(() => {
  Promise.all([
    query("DELETE FROM orbit_sessions WHERE expires_at<NOW()"),
    query(
      "DELETE FROM orbit_codes WHERE expires_at<DATE_SUB(NOW(),INTERVAL 1 DAY)",
    ),
    query("DELETE FROM orbit_limits WHERE expires_at<NOW()"),
    query("DELETE FROM orbit_google_flows WHERE expires_at<NOW()"),
  ]).catch(() => console.error("Maintenance failed"));
}, 3600000);
cleanup.unref();
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    clearInterval(cleanup);
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
