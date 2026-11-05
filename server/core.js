import mysql from "mysql2/promise";
import { AsyncLocalStorage } from "node:async_hooks";
import bcrypt from "bcryptjs";
import { createHmac } from "node:crypto";

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
export const fail = (status, message, fields) => {
  throw new HttpError(status, message, fields);
};
export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "orbit",
  user: process.env.DB_USER || "orbit_app",
  password: process.env.DB_PASSWORD || "",
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 100,
  charset: "utf8mb4",
  dateStrings: true,
  decimalNumbers: true,
  multipleStatements: false,
  connectTimeout: 10000,
});
const context = new AsyncLocalStorage();
export async function query(sql, params = []) {
  const [result] = await (context.getStore() || pool).execute(sql, params);
  return result;
}
export async function one(sql, params = []) {
  return (await query(sql, params))[0] || null;
}
export async function val(sql, params = []) {
  const r = await one(sql, params);
  return r ? Object.values(r)[0] : null;
}
export async function tx(fn) {
  if (context.getStore()) return fn();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await context.run(connection, fn);
    await connection.commit();
    return result;
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}
export function ident(s) {
  if (!/^[a-z_]+$/.test(s)) throw new Error("Invalid SQL identifier");
  return "`" + s + "`";
}
export const archiveTables = new Set([
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
]);
export async function insert(table, data) {
  const keys = Object.keys(data);
  if (!keys.length) fail(422, "Faltan datos.");
  return (
    await query(
      `INSERT INTO ${ident(table)} (${keys.map(ident)}) VALUES (${keys.map(() => "?")})`,
      Object.values(data),
    )
  ).insertId;
}
export async function update(table, id, data) {
  if (!Object.keys(data).length) return;
  await query(
    `UPDATE ${ident(table)} SET ${Object.keys(data).map((k) => ident(k) + "=?")} WHERE id=?`,
    [...Object.values(data), id],
  );
}
export async function exists(table, id) {
  return (
    (await one(
      `SELECT * FROM ${ident(table)} WHERE id=?${archiveTables.has(table) ? " AND deleted_at IS NULL" : ""}`,
      [id],
    )) || fail(404, "Registro no encontrado.")
  );
}
// Relationship changes also preserve their rows. Re-selecting an archived
// association restores the same composite key instead of creating duplicates.
export async function replaceLinks(
  table,
  ownerKey,
  ownerId,
  targetKey,
  targetIds,
  actorId,
) {
  const mappings = {
    docente_carrera: ["docente_id", "carrera_id"],
    laboratorio_carrera: ["laboratorio_id", "carrera_id"],
    libro_carrera: ["libro_id", "carrera_id"],
  };
  if (
    !mappings[table] ||
    mappings[table][0] !== ownerKey ||
    mappings[table][1] !== targetKey
  )
    throw new Error("Invalid relationship mapping");
  await query(
    `UPDATE ${ident(table)} SET deleted_at=NOW(),deleted_by=? WHERE ${ident(ownerKey)}=? AND deleted_at IS NULL`,
    [actorId, ownerId],
  );
  for (const targetId of targetIds)
    await query(
      `INSERT INTO ${ident(table)}(${ident(ownerKey)},${ident(targetKey)}) VALUES(?,?) ON DUPLICATE KEY UPDATE deleted_at=NULL,deleted_by=NULL`,
      [ownerId, targetId],
    );
}
export const positiveId = (v) => {
  if (!/^[1-9]\d*$/.test(String(v)) || !Number.isSafeInteger(Number(v)))
    fail(404, "Ruta no encontrada.");
  return Number(v);
};
export function requireUser(req, ...roles) {
  const u = req.user;
  if (!u) fail(401, "Inicia sesión para continuar.");
  if (roles.length && !roles.includes(u.rol))
    fail(403, "No tienes permiso para esta acción.");
  return u;
}
export async function loadUser(id) {
  return one(
    `SELECT u.id,u.nombre,u.apellido,u.email,u.rol,u.universidad_id,u.telefono,u.activo,u.email_verified_at,u.auth_version,(SELECT MAX(s.fecha_fin) FROM suscripciones s WHERE s.usuario_id=u.id AND s.estado='activa' AND s.fecha_inicio<=CURDATE() AND s.fecha_fin>=CURDATE()) AS premium_hasta,d.id AS docente_id,e.id AS estudiante_id,e.tipo AS tipo_estudiante,e.carrera_id,dr.carrera_id AS director_carrera_id,un.nombre AS universidad FROM usuarios u LEFT JOIN docentes d ON d.usuario_id=u.id LEFT JOIN estudiantes e ON e.usuario_id=u.id LEFT JOIN directores dr ON dr.usuario_id=u.id LEFT JOIN universidades un ON un.id=u.universidad_id WHERE u.id=? AND u.deleted_at IS NULL`,
    [id],
  );
}
export function publicUser(u) {
  const { auth_version, ...r } = u;
  return r;
}
export async function hashPassword(p) {
  checkPassword(p);
  return bcrypt.hash(p, 12);
}
export function checkPassword(p) {
  if (typeof p !== "string" || [...p].length < 12 || Buffer.byteLength(p) > 72)
    fail(
      422,
      "Usa una contraseña de al menos 12 caracteres y como máximo 72 bytes.",
      { password: "Se requieren al menos 12 caracteres." },
    );
}
export async function verifyPassword(p, hash) {
  if (typeof p !== "string" || Buffer.byteLength(p) > 72) return false;
  return bcrypt.compare(p, String(hash).replace(/^\$2y\$/, "$2b$"));
}
export function validate(spec, body, partial = false) {
  if (!body || Array.isArray(body) || typeof body !== "object")
    fail(400, "Se requiere un objeto JSON.");
  const out = {},
    errors = {};
  for (const [key, rule] of Object.entries(spec)) {
    let v = body[key];
    if (v === undefined) {
      if (rule.req && !partial) errors[key] = "Campo obligatorio.";
      continue;
    }
    if (typeof v === "string") v = v.trim();
    if (v === "" || v === null) {
      if (rule.req) errors[key] = "Campo obligatorio.";
      else out[key] = rule.type === "bool" ? 0 : null;
      continue;
    }
    let ok = true;
    if (rule.type === "int" || rule.type === "dec") {
      ok =
        (typeof v === "number" || typeof v === "string") &&
        String(v).trim() !== "" &&
        Number.isFinite(Number(v));
      v = Number(v);
      ok &&= rule.type !== "int" || Number.isSafeInteger(v);
      ok &&=
        (rule.min === undefined || v >= rule.min) &&
        (rule.max === undefined || v <= rule.max);
    } else if (rule.type === "bool") {
      ok = [true, false, 1, 0, "1", "0"].includes(v);
      v = [true, 1, "1"].includes(v) ? 1 : 0;
    } else if (rule.type === "enum") ok = rule.values.includes(v);
    else if (rule.type === "date")
      ok =
        typeof v === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v;
    else {
      ok =
        typeof v === "string" &&
        v.length <= (rule.max || 255) &&
        v.length >= (rule.min || 0);
      if (rule.type === "email") {
        ok &&= /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        if (ok) v = v.toLowerCase();
      }
      if (rule.url && ok) ok = safeURL(v);
    }
    if (!ok) errors[key] = "Valor no válido.";
    else out[key] = v;
  }
  if (Object.keys(errors).length)
    fail(422, "Revisa los campos marcados.", errors);
  return out;
}
export function safeURL(v) {
  if (typeof v !== "string" || /[\s<>"'\\]/.test(v)) return false;
  if (/^(uploads|img|simuladores)\//.test(v))
    return (
      !/[%?#]/.test(v) &&
      !v.split("/").some((s) => s === ".." || s === "." || s === "")
    );
  try {
    const url = new URL(v);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function ids(v = []) {
  if (!Array.isArray(v) || v.length > 1000)
    fail(422, "Lista de carreras no válida.");
  return [...new Set(v.map(positiveId))];
}
export const text = (max = 255, req = false) => ({ type: "str", max, req });
export const int = (req = false, min = 1, max = 2147483647) => ({
  type: "int",
  req,
  min,
  max,
});
export const dec = (max = 100) => ({ type: "dec", min: 0, max });
export const enumeration = (values, req = false) => ({
  type: "enum",
  values,
  req,
});
export const bool = { type: "bool" };
export const date = { type: "date" };
export const email = { type: "email", max: 160, req: true };
// Audit snapshots are bounded and never retain authentication credentials.
export function auditData(value, depth = 0) {
  if (value === undefined || value === null) return null;
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return value.slice(0, 3000);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => auditData(item, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 100);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, item]) => [
        key,
        /password|contrase|secret|token|hash|cookie|authorization|credential|challenge|verifier|nonce|^code$|^actual$|^nueva$/i.test(
          key,
        )
          ? "[redacted]"
          : auditData(item, depth + 1),
      ]),
  );
}
export async function audit(req, event) {
  const actor = req.user,
    entityId = event.entityId == null ? null : Number(event.entityId);
  if (
    !/^[a-zA-Z0-9_.-]{1,80}$/.test(event.action) ||
    !/^[a-zA-Z0-9_.-]{1,64}$/.test(event.entity) ||
    (entityId !== null && (!Number.isSafeInteger(entityId) || entityId < 1))
  )
    throw new Error("Invalid audit event");
  const row = {
    actor_id: event.actorId ?? actor?.id ?? null,
    actor_role: event.actorRole ?? actor?.rol ?? null,
    action: event.action,
    entity: event.entity,
    entity_id: entityId,
    request_id: req.id || null,
    ip_hash: req.ip
      ? createHmac("sha256", process.env.SESSION_SECRET)
          .update(req.ip)
          .digest("hex")
      : null,
    data: JSON.stringify(
      auditData({
        before: event.before,
        after: event.after,
        details: event.details,
      }),
    ),
  };
  // Tests can inject an isolated sink; HTTP clients cannot select or bypass it.
  if (req.app?.locals.auditWriter) return req.app.locals.auditWriter(row);
  return insert("orbit_audit", row);
}
export const areas = [
  "Salud",
  "Ingeniería y técnica",
  "Ciencias sociales",
  "Educación",
  "Otra",
];
export function search(cols, term, params) {
  if (!term) return "";
  if (typeof term !== "string" || term.length > 200)
    fail(422, "Búsqueda no válida.");
  params.push(...cols.map(() => "%" + term + "%"));
  return ` AND (${cols.map((c) => c + " LIKE ?").join(" OR ")})`;
}
export async function classAccess(id, u, write = false) {
  const k = await one(
    "SELECT k.* FROM clases k JOIN carreras c ON c.id=k.carrera_id AND c.deleted_at IS NULL AND c.activo=1 JOIN universidades un ON un.id=c.universidad_id AND un.deleted_at IS NULL AND un.activo=1 WHERE k.id=? AND k.deleted_at IS NULL",
    [id],
  );
  if (!k) fail(404, "Clase no disponible.");
  if (
    u.rol === "admin" ||
    (u.rol === "docente" && k.docente_id === u.docente_id) ||
    (!write &&
      u.rol === "director" &&
      k.carrera_id === u.director_carrera_id) ||
    (!write &&
      u.rol === "estudiante" &&
      (await val(
        "SELECT 1 FROM inscripciones WHERE clase_id=? AND estudiante_id=? AND estado<>'retirado'",
        [id, u.estudiante_id],
      )))
  )
    return k;
  fail(403, "No tienes permiso sobre esta clase.");
}
export function academicScope(u, alias = "k") {
  const visible = ` AND ${alias}.deleted_at IS NULL AND EXISTS(SELECT 1 FROM carreras ac JOIN universidades au ON au.id=ac.universidad_id WHERE ac.id=${alias}.carrera_id AND ac.deleted_at IS NULL AND au.deleted_at IS NULL AND ac.activo=1 AND au.activo=1)`;
  if (u.rol === "admin") return [visible, []];
  if (u.rol === "director")
    return [visible + ` AND ${alias}.carrera_id=?`, [u.director_carrera_id]];
  if (u.rol === "docente")
    return [visible + ` AND ${alias}.docente_id=?`, [u.docente_id]];
  return [
    visible +
      ` AND EXISTS(SELECT 1 FROM inscripciones ai WHERE ai.clase_id=${alias}.id AND ai.estudiante_id=? AND ai.estado<>'retirado')`,
    [u.estudiante_id],
  ];
}
export async function premium(uid) {
  return one(
    "SELECT s.id,s.fecha_inicio,s.fecha_fin,p.nombre AS plan FROM suscripciones s JOIN planes p ON p.id=s.plan_id WHERE s.usuario_id=? AND s.estado='activa' AND s.fecha_inicio<=CURDATE() AND s.fecha_fin>=CURDATE() ORDER BY s.fecha_fin DESC LIMIT 1",
    [uid],
  );
}
export async function contentScope(u, t, join, fk) {
  const visible = ` AND ${t}.deleted_at IS NULL`;
  if (u.rol === "admin") return [visible, [], "0"];
  if (u.rol === "director")
    return [
      visible +
        ` AND EXISTS(SELECT 1 FROM ${join} x JOIN carreras sc ON sc.id=x.carrera_id AND sc.deleted_at IS NULL AND sc.activo=1 JOIN universidades su ON su.id=sc.universidad_id AND su.deleted_at IS NULL AND su.activo=1 WHERE x.deleted_at IS NULL AND x.${fk}=${t}.id AND x.carrera_id=?)`,
      [u.director_carrera_id],
      "0",
    ];
  if (u.rol === "docente")
    return [
      visible +
        ` AND EXISTS(SELECT 1 FROM ${join} x JOIN docente_carrera dc ON dc.carrera_id=x.carrera_id AND dc.deleted_at IS NULL JOIN carreras sc ON sc.id=x.carrera_id AND sc.deleted_at IS NULL AND sc.activo=1 JOIN universidades su ON su.id=sc.universidad_id AND su.deleted_at IS NULL AND su.activo=1 WHERE x.deleted_at IS NULL AND x.${fk}=${t}.id AND dc.docente_id=?)`,
      [u.docente_id],
      "0",
    ];
  if (u.tipo_estudiante === "institucional")
    return [
      visible +
        ` AND ${t}.estado='publicado' AND EXISTS(SELECT 1 FROM ${join} x JOIN carreras sc ON sc.id=x.carrera_id AND sc.deleted_at IS NULL AND sc.activo=1 JOIN universidades su ON su.id=sc.universidad_id AND su.deleted_at IS NULL AND su.activo=1 WHERE x.deleted_at IS NULL AND x.${fk}=${t}.id AND x.carrera_id=?)`,
      [u.carrera_id],
      "0",
    ];
  return [
    visible + ` AND ${t}.estado='publicado' AND ${t}.catalogo_publico=1`,
    [],
    (await premium(u.id)) ? "0" : `(${t}.gratis=0)`,
  ];
}
