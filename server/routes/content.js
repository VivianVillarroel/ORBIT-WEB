import multer from "multer";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { limit } from "../auth.js";
import { createUploadAdmission } from "./upload-admission.js";
import {
  query,
  one,
  val,
  insert,
  update,
  exists,
  positiveId,
  requireUser,
  validate,
  text,
  int,
  enumeration,
  bool,
  areas,
  search,
  tx,
  fail,
  contentScope,
  ids,
  audit,
  safeURL,
  replaceLinks,
  HttpError,
} from "../core.js";
export const webRoot = fileURLToPath(
  new URL("../../orbit-web/", import.meta.url),
);
const url = { ...text(500), url: true };
// Legacy rows may predate URL validation. Never expose active URL schemes from them.
export function safeContent(row) {
  for (const key of Object.keys(row))
    if (key.endsWith("_url") && row[key] && !safeURL(row[key])) row[key] = null;
  return row;
}
const configs = {
  laboratorios: {
    t: "l",
    join: "laboratorio_carrera",
    fk: "laboratorio_id",
    name: "nombre",
    spec: {
      nombre: text(140, true),
      area: enumeration(areas, true),
      equipo: text(140),
      descripcion: text(3000),
      modelo_url: url,
      imagen_url: url,
      vr_disponible: bool,
      estado: enumeration(["solicitado", "en_desarrollo", "publicado"], true),
      solicitado_por: int(),
      catalogo_publico: bool,
      gratis: bool,
    },
  },
  libros: {
    t: "b",
    join: "libro_carrera",
    fk: "libro_id",
    name: "titulo",
    spec: {
      titulo: text(160, true),
      autor: text(140),
      materia: text(100),
      descripcion: text(3000),
      temas: text(3000),
      portada_url: url,
      libro_url: url,
      app_url: url,
      modelo_url: url,
      estado: enumeration(["en_desarrollo", "publicado"], true),
      catalogo_publico: bool,
      gratis: bool,
    },
  },
};
export async function contentList(
  table,
  u,
  where = "",
  params = [],
  { practiceStats = true } = {},
) {
  const c = configs[table],
    [scope, sp, locked] = await contentScope(u, c.t, c.join, c.fk);
  const rows = await query(
    `SELECT ${c.t}.*,(SELECT GROUP_CONCAT(c.nombre SEPARATOR ', ') FROM ${c.join} x JOIN carreras c ON c.id=x.carrera_id AND c.deleted_at IS NULL WHERE x.${c.fk}=${c.t}.id AND x.deleted_at IS NULL) AS carreras,(SELECT GROUP_CONCAT(x.carrera_id) FROM ${c.join} x JOIN carreras c ON c.id=x.carrera_id AND c.deleted_at IS NULL WHERE x.${c.fk}=${c.t}.id AND x.deleted_at IS NULL) AS carrera_ids,${locked} AS bloqueado FROM ${table} ${c.t} WHERE ${c.t}.deleted_at IS NULL ${scope} ${where} ORDER BY ${c.t}.${c.name}`,
    [...sp, ...params],
  );
  const stats = new Map(
    table === "laboratorios" &&
      u.rol === "estudiante" &&
      practiceStats &&
      rows.length
      ? (
          await query(
            "SELECT laboratorio_id,COUNT(*) AS mis_practicas,MAX(puntaje) AS mi_mejor_puntaje FROM practicas WHERE estudiante_id=? AND deleted_at IS NULL GROUP BY laboratorio_id",
            [u.estudiante_id],
          )
        ).map((r) => [r.laboratorio_id, r])
      : [],
  );
  for (const r of rows) {
    safeContent(r);
    if (table === "laboratorios")
      r.unity_disponible =
        !!r.modelo_url &&
        (!/^simuladores\//.test(r.modelo_url) ||
          process.env.UNITY_WEBGL_ENABLED === "true");
    if (r.bloqueado)
      for (const k of ["modelo_url", "libro_url", "app_url"])
        if (k in r) r[k] = null;
    if (table === "laboratorios" && u.rol === "estudiante" && practiceStats) {
      r.mis_practicas = stats.get(r.id)?.mis_practicas ?? 0;
      r.mi_mejor_puntaje = stats.get(r.id)?.mi_mejor_puntaje ?? null;
    }
  }
  return rows;
}
export async function writable(table, id, u) {
  if (
    !["admin", "director"].includes(u.rol) ||
    (u.rol === "director" && table !== "laboratorios")
  )
    fail(403, "No tienes permiso.");
  if (
    u.rol === "director" &&
    !(await val(
      "SELECT 1 FROM carreras c JOIN universidades un ON un.id=c.universidad_id WHERE c.id=? AND c.activo=1 AND c.deleted_at IS NULL AND un.activo=1 AND un.deleted_at IS NULL",
      [u.director_carrera_id],
    ))
  )
    fail(403, "La carrera o institución no están activas.");
  if (id) {
    const r = await exists(table, id);
    if (
      u.rol === "director" &&
      (r.creado_por !== u.id ||
        !(await val(
          "SELECT 1 FROM laboratorio_carrera WHERE laboratorio_id=? AND carrera_id=? AND deleted_at IS NULL",
          [id, u.director_carrera_id],
        )))
    )
      fail(403, "Solo puedes modificar tus laboratorios.");
    return r;
  }
}
const receive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
}).single("archivo");
const enterUpload = createUploadAdmission();
// Accept the self-contained GLB 2 subset used by ORBIT. This is a container and
// resource-boundary check, not a complete validator for mesh/animation semantics.
export function validGLB(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "glTF" ||
    buffer.readUInt32LE(4) !== 2 ||
    buffer.readUInt32LE(8) !== buffer.length
  )
    return false;
  try {
    let offset = 12,
      document,
      binary;
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) return false;
      const length = buffer.readUInt32LE(offset),
        type = buffer.readUInt32LE(offset + 4);
      if (!length || length % 4 || offset + 8 + length > buffer.length)
        return false;
      const payload = buffer.subarray(offset + 8, offset + 8 + length);
      if (offset === 12) {
        if (type !== 0x4e4f534a || length > 8 * 1024 * 1024) return false;
        document = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(payload),
        );
      } else {
        if (type !== 0x004e4942 || binary) return false;
        binary = payload;
      }
      offset += 8 + length;
    }
    if (
      !document ||
      Array.isArray(document) ||
      document.asset?.version !== "2.0" ||
      (document.asset.minVersion !== undefined &&
        document.asset.minVersion !== "2.0")
    )
      return false;
    const embedded = (uri) =>
      typeof uri === "string" &&
      /^data:(?:application\/(?:octet-stream|gltf-buffer)|image\/(?:png|jpeg|webp|ktx2));base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        uri,
      );
    // Extension resources must obey the same rule as core buffers and images.
    let visited = 0;
    function resources(value, depth = 0) {
      if (++visited > 100000 || depth > 64) return false;
      if (!value || typeof value !== "object") return true;
      return Object.entries(value).every(
        ([key, item]) =>
          (key !== "uri" || embedded(item)) && resources(item, depth + 1),
      );
    }
    if (!resources(document)) return false;
    const buffers = document.buffers ?? [],
      views = document.bufferViews ?? [],
      images = document.images ?? [];
    if (![buffers, views, images].every(Array.isArray)) return false;
    for (const [index, item] of buffers.entries()) {
      if (
        !item ||
        !Number.isSafeInteger(item.byteLength) ||
        item.byteLength < 1
      )
        return false;
      if (item.uri !== undefined) {
        if (
          !embedded(item.uri) ||
          Buffer.from(item.uri.slice(item.uri.indexOf(",") + 1), "base64")
            .length !== item.byteLength
        )
          return false;
      } else if (
        index !== 0 ||
        !binary ||
        item.byteLength > binary.length ||
        binary.length - item.byteLength > 3 ||
        binary.subarray(item.byteLength).some((byte) => byte !== 0)
      )
        return false;
    }
    for (const item of views) {
      if (
        !item ||
        !Number.isSafeInteger(item.buffer) ||
        !buffers[item.buffer] ||
        !Number.isSafeInteger(item.byteLength) ||
        item.byteLength < 1 ||
        !Number.isSafeInteger(item.byteOffset ?? 0) ||
        (item.byteOffset ?? 0) < 0 ||
        (item.byteOffset ?? 0) + item.byteLength >
          buffers[item.buffer].byteLength
      )
        return false;
    }
    for (const item of images) {
      if (
        !item ||
        (item.uri !== undefined
          ? !embedded(item.uri) || item.bufferView !== undefined
          : !Number.isSafeInteger(item.bufferView) ||
            !views[item.bufferView] ||
            !/^image\/(png|jpeg|webp|ktx2)$/.test(item.mimeType))
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
async function upload(req, res, table, id, column, u) {
  await writable(table, id, u);
  await limit("upload:" + u.id, 10, 60);
  const release = enterUpload(u.id);
  let rejectUpload;
  const aborted = () =>
    rejectUpload?.(new HttpError(400, "La carga fue cancelada."));
  const closed = () => {
    if (!res.writableFinished) aborted();
  };
  req.once("aborted", aborted);
  res.once("close", closed);
  try {
    await new Promise((resolve, reject) => {
      rejectUpload = reject;
      receive(req, res, (e) => {
        rejectUpload = undefined;
        if (e) reject(e);
        else resolve();
      });
    });
    const f = req.file,
      ext = column === "libro_url" ? "pdf" : "glb";
    if (!f || path.extname(f.originalname).toLowerCase() !== "." + ext)
      fail(422, "Sube un archivo ." + ext);
    if (
      (ext === "glb" && !validGLB(f.buffer)) ||
      (ext === "pdf" && f.buffer.toString("ascii", 0, 5) !== "%PDF-")
    )
      fail(422, "El contenido del archivo no es válido.");
    const folder = ext === "pdf" ? "libros" : "modelos",
      relative = `uploads/${folder}/${randomBytes(24).toString("hex")}.${ext}`,
      target = path.join(webRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, f.buffer, { flag: "wx" });
    try {
      await tx(async () => {
        await one(`SELECT id FROM ${table} WHERE id=? FOR UPDATE`, [id]);
        const before = await writable(table, id, u);
        await update(table, id, { [column]: relative });
        await audit(req, {
          action: "upload",
          entity: table,
          entityId: id,
          before: { [column]: before[column] },
          after: { [column]: relative, bytes: f.size },
        });
      });
    } catch (e) {
      await unlink(target);
      throw e;
    }
    return res.status(201).json({ [column]: relative });
  } finally {
    release();
    req.off("aborted", aborted);
    res.off("close", closed);
    // Do not retain the large buffer through the remainder of the response.
    req.file = undefined;
  }
}
export async function content(req, res, p) {
  const u = requireUser(req),
    table = p[0],
    c = configs[table],
    id = p[1] ? positiveId(p[1]) : null,
    sub = p[2],
    m = req.method,
    b = req.body;
  if (p.length > 3) fail(404, "Ruta no encontrada.");
  if (id && sub) {
    if (m === "POST" && sub === "modelo")
      return upload(req, res, table, id, "modelo_url", u);
    if (m === "POST" && table === "libros" && sub === "pdf")
      return upload(req, res, table, id, "libro_url", u);
    if (table === "libros" && sub === "resultados") {
      requireUser(req, "estudiante");
      const r = (await contentList(table, u, " AND b.id=?", [id]))[0];
      if (!r) fail(404, "Libro no disponible.");
      if (r.bloqueado) fail(402, "Se requiere Premium.");
      if (m === "GET")
        return res.json({
          items: await query(
            "SELECT tema,puntaje,realizado_en FROM libro_resultados WHERE estudiante_id=? AND libro_id=?",
            [u.estudiante_id, id],
          ),
        });
      if (m === "POST") {
        const d = validate(
          { tema: text(140, true), puntaje: int(false, 0, 100) },
          b,
        );
        const next = {
          ...d,
          libro_id: id,
          estudiante_id: u.estudiante_id,
        };
        const resultId = await tx(async () => {
          const resultId = await insert("libro_resultados", next);
          await audit(req, {
            action: "create",
            entity: "libro_resultados",
            entityId: resultId,
            after: next,
          });
          return resultId;
        });
        return res.status(201).json({ id: resultId });
      }
    }
    fail(404, "Ruta no encontrada.");
  }
  if (m === "GET") {
    const params = [];
    let where = "";
    if (id) {
      where = ` AND ${c.t}.id=?`;
      params.push(id);
    } else {
      where = search(
        [c.t + "." + c.name, c.t + ".descripcion"],
        req.query.q,
        params,
      );
      for (const k of ["estado", "area", "solicitado_por"])
        if (c.spec[k] && req.query[k]) {
          where += ` AND ${c.t}.${k}=?`;
          params.push(req.query[k]);
        }
      if (req.query.carrera_id) {
        where += ` AND EXISTS(SELECT 1 FROM ${c.join} x WHERE x.${c.fk}=${c.t}.id AND x.carrera_id=? AND x.deleted_at IS NULL)`;
        params.push(req.query.carrera_id);
      }
    }
    const rows = await contentList(table, u, where, params);
    if (id) {
      if (!rows[0]) fail(404, "Contenido no disponible.");
      if (table === "laboratorios" && u.rol === "estudiante")
        rows[0].clases = await query(
          "SELECT k.id,k.nombre,cl.fecha_limite FROM inscripciones i JOIN clases k ON k.id=i.clase_id AND k.deleted_at IS NULL JOIN clase_laboratorio cl ON cl.clase_id=k.id AND cl.deleted_at IS NULL WHERE i.estudiante_id=? AND cl.laboratorio_id=? AND i.estado<>'retirado'",
          [u.estudiante_id, id],
        );
      if (table === "libros" && u.rol === "estudiante")
        rows[0].resultados = await query(
          "SELECT tema,puntaje,realizado_en FROM libro_resultados WHERE estudiante_id=? AND libro_id=?",
          [u.estudiante_id, id],
        );
    }
    return res.json(id ? { item: rows[0] } : { items: rows });
  }
  await writable(table, id, u);
  if ((m === "POST" && !id) || (m === "PUT" && id)) {
    const d = validate(c.spec, b);
    let careers = ids(b.carrera_ids);
    for (const cid of careers) await exists("carreras", cid);
    if (u.rol === "director") {
      careers = [u.director_carrera_id];
      Object.assign(d, {
        creado_por: u.id,
        catalogo_publico: 0,
        gratis: 0,
        solicitado_por: u.universidad_id,
      });
    }
    const rid = await tx(async () => {
      if (id) await one(`SELECT id FROM ${table} WHERE id=? FOR UPDATE`, [id]);
      const before = id ? await writable(table, id, u) : null;
      for (const cid of [...careers].sort((a, b) => a - b))
        if (
          !(await one(
            "SELECT c.id FROM carreras c JOIN universidades un ON un.id=c.universidad_id WHERE c.id=? AND c.deleted_at IS NULL AND c.activo=1 AND un.deleted_at IS NULL AND un.activo=1 FOR UPDATE",
            [cid],
          ))
        )
          fail(422, "La carrera ya no está disponible.");
      const previousCareers = id
        ? await query(
            `SELECT carrera_id FROM ${c.join} WHERE ${c.fk}=? AND deleted_at IS NULL`,
            [id],
          )
        : [];
      if (table === "laboratorios" && id) {
        const assigned = await query(
          "SELECT DISTINCT k.carrera_id FROM clase_laboratorio cl JOIN clases k ON k.id=cl.clase_id WHERE cl.laboratorio_id=? AND cl.deleted_at IS NULL AND k.deleted_at IS NULL AND k.estado<>'finalizada'",
          [id],
        );
        if (assigned.some((r) => !careers.includes(r.carrera_id)))
          fail(
            409,
            "El laboratorio debe conservar las carreras de las clases que lo tienen asignado.",
          );
      }
      const rid = id || (await insert(table, d));
      if (id) await update(table, id, d);
      await replaceLinks(c.join, c.fk, rid, "carrera_id", careers, u.id);
      await audit(req, {
        action: id ? "update" : "create",
        entity: table,
        entityId: rid,
        before: before
          ? { ...before, carrera_ids: previousCareers.map((r) => r.carrera_id) }
          : null,
        after: { ...before, ...d, carrera_ids: careers },
      });
      return rid;
    });
    return res.status(id ? 200 : 201).json({ id: rid });
  }
  if (m === "DELETE" && id) {
    await tx(async () => {
      await one(`SELECT id FROM ${table} WHERE id=? FOR UPDATE`, [id]);
      const before = await writable(table, id, u);
      if (
        table === "laboratorios" &&
        (await val(
          "SELECT 1 FROM clase_laboratorio cl JOIN clases k ON k.id=cl.clase_id WHERE cl.laboratorio_id=? AND cl.deleted_at IS NULL AND k.deleted_at IS NULL AND k.estado<>'finalizada' LIMIT 1",
          [id],
        ))
      )
        fail(
          409,
          "Retira el laboratorio de las clases pendientes o finalízalas antes de darlo de baja.",
        );
      await query(
        `UPDATE ${table} SET deleted_at=NOW(),deleted_by=? WHERE id=?`,
        [u.id, id],
      );
      await audit(req, {
        action: "archive",
        entity: table,
        entityId: id,
        before,
        after: { archived: true, deleted_by: u.id },
      });
    });
    return res.json({ ok: true });
  }
  fail(405, "Método no permitido.");
}
