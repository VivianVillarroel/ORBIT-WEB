import { randomBytes } from "node:crypto";
import {
  query,
  one,
  val,
  insert,
  exists,
  requireUser,
  validate,
  int,
  text,
  email,
  areas,
  enumeration,
  hashPassword,
  tx,
  fail,
  audit,
  replaceLinks,
} from "../core.js";
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
export async function imports(req, res, p) {
  const actor = requireUser(req, "admin");
  if (
    req.method !== "POST" ||
    p.length !== 2 ||
    !["carreras", "estudiantes", "laboratorios"].includes(p[1])
  )
    fail(404, "Ruta no encontrada.");
  const b = req.body,
    d = validate({ universidad_id: int(true) }, b);
  await exists("universidades", d.universidad_id);
  if (!Array.isArray(b.filas) || !b.filas.length || b.filas.length > 3000)
    fail(422, "Envía entre 1 y 3000 filas.");
  const out = {
    creados: 0,
    actualizados: 0,
    omitidas: [],
    carreras_creadas: [],
    credenciales: [],
  };
  async function career(name, create) {
    const k = String(name || "").trim();
    if (!k) return null;
    const found = await one(
      "SELECT id,deleted_at FROM carreras WHERE universidad_id=? AND (nombre=? OR codigo=?) FOR UPDATE",
      [d.universidad_id, k, k],
    );
    if (found?.deleted_at)
      fail(
        409,
        "La carrera está dada de baja y su nombre permanece reservado.",
      );
    if (found) return found.id;
    if (!create) return null;
    const fields = validate({ nombre: text(140, true) }, { nombre: k });
    const id = await insert("carreras", {
      ...fields,
      universidad_id: d.universidad_id,
      area: "Otra",
    });
    return id;
  }
  for (const [i, row] of b.filas.entries()) {
    try {
      const result = await tx(async () => {
        if (
          !(await one(
            "SELECT id FROM universidades WHERE id=? AND deleted_at IS NULL FOR UPDATE",
            [d.universidad_id],
          ))
        )
          fail(409, "La institución está dada de baja.");
        const rowResult = await (async () => {
          if (p[1] === "carreras") {
            const data = validate(
              {
                nombre: text(140, true),
                codigo: text(20),
                duracion_semestres: int(false, 1, 20),
              },
              row,
            );
            if (await career(data.nombre, false))
              fail(409, "La carrera ya existe.");
            const area =
              areas.find((a) => norm(a) === norm(row.area)) || "Otra";
            await insert("carreras", {
              ...data,
              area,
              universidad_id: d.universidad_id,
            });
            return { created: 1 };
          }
          if (p[1] === "estudiantes") {
            const data = validate(
                {
                  nombre: text(80, true),
                  apellido: text(80, true),
                  email,
                  telefono: text(30),
                },
                row,
              ),
              extra = validate(
                { codigo: text(30, true), semestre: int(false, 1, 20) },
                row,
              );
            const cid = await career(row.carrera, b.crear_carreras !== false);
            if (!cid) fail(422, "Carrera no encontrada.");
            if (
              await val(
                "SELECT 1 FROM usuarios u LEFT JOIN estudiantes e ON e.usuario_id=u.id WHERE u.deleted_at IS NOT NULL AND (u.email=? OR e.codigo=?) LIMIT 1",
                [data.email, extra.codigo],
              )
            )
              fail(
                409,
                "El correo o código pertenece a una cuenta dada de baja y permanece reservado.",
              );
            const password = randomBytes(15).toString("base64url");
            const uid = await insert("usuarios", {
              ...data,
              password_hash: await hashPassword(password),
              rol: "estudiante",
              universidad_id: d.universidad_id,
              activo: 1,
            });
            await insert("estudiantes", {
              ...extra,
              usuario_id: uid,
              tipo: "institucional",
              carrera_id: cid,
            });
            return {
              created: 1,
              credential: {
                nombre: data.nombre + " " + data.apellido,
                email: data.email,
                codigo: extra.codigo,
                carrera: row.carrera,
                password,
              },
            };
          }
          const data = validate(
            {
              nombre: text(140, true),
              equipo: text(140),
              descripcion: text(3000),
            },
            row,
          );
          const previous = await one(
            "SELECT id,deleted_at FROM laboratorios WHERE nombre=? FOR UPDATE",
            [data.nombre],
          );
          if (previous?.deleted_at)
            fail(
              409,
              "El laboratorio está dado de baja y su nombre permanece reservado.",
            );
          let id = previous?.id,
            created = 0;
          if (!id) {
            id = await insert("laboratorios", {
              ...data,
              area: areas.find((a) => norm(a) === norm(row.area)) || "Otra",
              estado: "solicitado",
              solicitado_por: d.universidad_id,
            });
            created = 1;
          }
          const targetCareers = new Set(
            (
              await query(
                "SELECT carrera_id FROM laboratorio_carrera WHERE laboratorio_id=? AND deleted_at IS NULL",
                [id],
              )
            ).map((r) => r.carrera_id),
          );
          for (const name of String(row.carreras || "")
            .split(/[|;,]/)
            .map((s) => s.trim())
            .filter(Boolean)) {
            const cid = await career(name, b.crear_carreras !== false);
            if (!cid) fail(422, "Carrera no encontrada: " + name);
            targetCareers.add(cid);
          }
          await replaceLinks(
            "laboratorio_carrera",
            "laboratorio_id",
            id,
            "carrera_id",
            [...targetCareers],
            actor.id,
          );
          return { created, updated: created ? 0 : 1 };
        })();
        await audit(req, {
          action: "import",
          entity: p[1],
          entityId: null,
          after: {
            universidad_id: d.universidad_id,
            fila: i + 2,
            nombre: row.nombre,
            codigo: row.codigo,
            email: row.email,
            creados: rowResult.created || 0,
            actualizados: rowResult.updated || 0,
          },
        });
        return rowResult;
      });
      out.creados += result.created || 0;
      out.actualizados += result.updated || 0;
      if (result.credential) out.credenciales.push(result.credential);
    } catch (e) {
      if (!e.status && !["ER_DUP_ENTRY", "ER_DATA_TOO_LONG"].includes(e.code))
        throw e;
      out.omitidas.push({
        fila: i + 2,
        motivo: e.status ? e.message : "Datos duplicados o demasiado largos.",
      });
    }
  }
  return res.json(out);
}
