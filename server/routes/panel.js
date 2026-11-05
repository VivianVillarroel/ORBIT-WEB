import {
  query,
  one,
  val,
  insert,
  requireUser,
  positiveId,
  validate,
  int,
  bool,
  enumeration,
  fail,
  contentScope,
  premium,
  search,
  tx,
  audit,
  safeURL,
} from "../core.js";
import { sql, scoped } from "../sql.js";
import { academicData } from "./academic.js";
export async function dashboard(req, res, p) {
  if (req.method !== "GET" || p.length !== 1) fail(405, "Método no permitido.");
  const u = requireUser(req),
    s = sql.panel;
  if (u.rol === "director") return res.json(await academicData(u));
  if (u.rol === "admin") {
    const stats = await one(s.adminStats);
    stats.ingreso_licencias = (await query(s.licenseRevenue)).reduce(
      (n, r) =>
        n +
        Number(r.precio) *
          (r.max === null ? Number(r.n) : Math.min(Number(r.max), Number(r.n))),
      0,
    );
    return res.json({
      rol: u.rol,
      stats,
      solicitudes: await query(s.requests),
      laboratorios: await query(s.laboratories),
    });
  }
  if (u.rol === "docente") {
    const d = u.docente_id;
    return res.json({
      rol: u.rol,
      stats: await one(s.teacherStats, [d, d, d, d]),
      clases: await query(s.teacherCourses, [d]),
      recientes: await query(s.teacherRecent, [d]),
    });
  }
  const e = u.estudiante_id,
    stats = await one(s.studentStats, [e, e, e, e]),
    [scope, sp] = await contentScope(
      u,
      "l",
      "laboratorio_carrera",
      "laboratorio_id",
    ),
    [scopeB, bp] = await contentScope(u, "b", "libro_carrera", "libro_id");
  stats.laboratorios = await val(scoped(s.laboratoryCount, { scope }), sp);
  stats.libros = await val(scoped(s.bookCount, { scopeB }), bp);
  return res.json({
    rol: u.rol,
    tipo: u.tipo_estudiante,
    premium: await premium(u.id),
    carrera: u.carrera_id
      ? await val(
          "SELECT nombre FROM carreras WHERE id=? AND deleted_at IS NULL",
          [u.carrera_id],
        )
      : null,
    stats,
    pendientes: await query(s.pending, [e, e, e]),
    recientes: await query(s.studentRecent, [e]),
  });
}
export async function options(req, res, p) {
  if (req.method !== "GET" || p.length !== 1) fail(405, "Método no permitido.");
  const u = requireUser(req),
    s = sql.panel,
    out = {};
  if (u.rol === "admin") {
    out.universidades = await query(
      "SELECT id,nombre,sigla FROM universidades WHERE deleted_at IS NULL ORDER BY nombre",
    );
    out.carreras = await query(
      "SELECT c.id,c.nombre,c.universidad_id,u.nombre AS universidad FROM carreras c JOIN universidades u ON u.id=c.universidad_id WHERE c.deleted_at IS NULL AND u.deleted_at IS NULL ORDER BY u.nombre,c.nombre",
    );
    out.laboratorios = await query(s.laboratoryOptions);
    out.docentes = await query(s.teacherOptions);
    out.estudiantes = await query(s.studentOptions);
  } else if (u.rol === "director") {
    out.carreras = await query(
      "SELECT id,nombre,universidad_id FROM carreras WHERE id=? AND deleted_at IS NULL",
      [u.director_carrera_id],
    );
    out.universidades = await query(
      "SELECT id,nombre,sigla FROM universidades WHERE id=? AND deleted_at IS NULL",
      [u.universidad_id],
    );
    out.laboratorios = await query(
      s.laboratoryOptions +
        " AND EXISTS(SELECT 1 FROM laboratorio_carrera lc WHERE lc.laboratorio_id=l.id AND lc.carrera_id=? AND lc.deleted_at IS NULL)",
      [u.director_carrera_id],
    );
  } else if (u.rol === "docente") {
    out.carreras = await query(
      "SELECT c.id,c.nombre,c.universidad_id,u.nombre AS universidad FROM carreras c JOIN universidades u ON u.id=c.universidad_id JOIN docente_carrera dc ON dc.carrera_id=c.id WHERE dc.docente_id=? AND dc.deleted_at IS NULL AND c.deleted_at IS NULL AND u.deleted_at IS NULL",
      [u.docente_id],
    );
    out.estudiantes = await query(s.allStudentOptions, [u.universidad_id]);
    out.laboratorios = await query(
      s.laboratoryOptions +
        " AND EXISTS(SELECT 1 FROM laboratorio_carrera lc JOIN docente_carrera dc ON dc.carrera_id=lc.carrera_id AND dc.deleted_at IS NULL JOIN carreras c ON c.id=lc.carrera_id AND c.deleted_at IS NULL JOIN universidades un ON un.id=c.universidad_id AND un.deleted_at IS NULL WHERE lc.laboratorio_id=l.id AND dc.docente_id=? AND lc.deleted_at IS NULL)",
      [u.docente_id],
    );
  }
  return res.json(out);
}
export async function practices(req, res, p) {
  const u = requireUser(req),
    m = req.method;
  if (m === "GET" && p.length === 1) {
    const params = [];
    let q = sql.panel.practices;
    if (u.rol === "director") {
      q += " AND k.carrera_id=?";
      params.push(u.director_carrera_id);
    }
    if (u.rol === "docente") {
      q += " AND k.docente_id=?";
      params.push(u.docente_id);
    }
    if (u.rol === "estudiante") {
      q += " AND pr.estudiante_id=?";
      params.push(u.estudiante_id);
    }
    for (const key of ["clase_id", "laboratorio_id"])
      if (req.query[key]) {
        q += ` AND pr.${key}=?`;
        params.push(positiveId(req.query[key]));
      }
    q += search(
      ["us.nombre", "us.apellido", "l.nombre", "k.nombre"],
      req.query.q,
      params,
    );
    return res.json({
      items: await query(
        q + " ORDER BY pr.realizada_en DESC LIMIT 300",
        params,
      ),
    });
  }
  if (m === "POST" && p.length === 1) {
    requireUser(req, "estudiante");
    const d = validate(
      {
        laboratorio_id: int(true),
        clase_id: int(),
        modalidad: enumeration(["3D", "VR"]),
        duracion_min: int(false, 1, 600),
        completada: bool,
      },
      req.body,
    );
    // A student cannot submit a grade. Official final grades are assigned by a teacher with an audit trail.
    if ("puntaje" in req.body)
      fail(
        422,
        "El puntaje evaluado debe ser calculado y validado por el servidor.",
      );
    const id = await tx(async () => {
      if (d.clase_id) {
        await one(
          "SELECT id FROM clases WHERE id=? AND deleted_at IS NULL FOR UPDATE",
          [d.clase_id],
        );
        const enrollment = await one(
          "SELECT id FROM inscripciones WHERE clase_id=? AND estudiante_id=? AND estado<>'retirado' FOR UPDATE",
          [d.clase_id, u.estudiante_id],
        );
        if (!enrollment) fail(422, "Laboratorio no asignado a esa clase.");
      }
      if (
        !(await one(
          "SELECT e.id FROM estudiantes e JOIN usuarios su ON su.id=e.usuario_id WHERE e.id=? AND su.deleted_at IS NULL AND su.activo=1 FOR UPDATE",
          [u.estudiante_id],
        ))
      )
        fail(403, "La cuenta no está disponible.");
      await one(
        "SELECT id FROM laboratorios WHERE id=? AND deleted_at IS NULL FOR UPDATE",
        [d.laboratorio_id],
      );
      const [scope, sp, locked] = await contentScope(
          u,
          "l",
          "laboratorio_carrera",
          "laboratorio_id",
        ),
        lab = await one(scoped(sql.panel.practiceLab, { scope, locked }), [
          d.laboratorio_id,
          ...sp,
        ]);
      if (!lab) fail(422, "Laboratorio no disponible.");
      if (lab.bloqueado) fail(402, "Se requiere Premium.");
      const content = await one(
        "SELECT modelo_url FROM laboratorios WHERE id=? AND deleted_at IS NULL",
        [d.laboratorio_id],
      );
      if (
        !content?.modelo_url ||
        !safeURL(content.modelo_url) ||
        (/^simuladores\//.test(content.modelo_url) &&
          process.env.UNITY_WEBGL_ENABLED !== "true")
      )
        fail(
          409,
          "El laboratorio está en preparación. La práctica estará disponible al publicar su contenido.",
        );
      if (
        d.clase_id &&
        !(await val(sql.panel.practiceEnrollment, [
          u.estudiante_id,
          d.clase_id,
          d.laboratorio_id,
        ]))
      )
        fail(422, "Laboratorio no asignado a esa clase.");
      if (
        d.clase_id &&
        !(await val(
          "SELECT 1 FROM clases WHERE id=? AND estado='activa' AND deleted_at IS NULL",
          [d.clase_id],
        ))
      )
        fail(409, "La clase debe estar activa para registrar prácticas.");
      const next = {
        ...d,
        modalidad: d.modalidad || "3D",
        estudiante_id: u.estudiante_id,
      };
      const id = await insert("practicas", next);
      await audit(req, {
        action: "create",
        entity: "practicas",
        entityId: id,
        after: next,
      });
      return id;
    });
    return res.status(201).json({ id });
  }
  if (m === "DELETE" && p.length === 2) {
    requireUser(req, "admin");
    await tx(async () => {
      const id = positiveId(p[1]);
      const before = await one(
        "SELECT * FROM practicas WHERE id=? AND deleted_at IS NULL FOR UPDATE",
        [id],
      );
      if (!before) fail(404, "Práctica no encontrada.");
      await query(
        "UPDATE practicas SET deleted_at=NOW(),deleted_by=? WHERE id=? AND deleted_at IS NULL",
        [u.id, id],
      );
      await audit(req, {
        action: "archive",
        entity: "practicas",
        entityId: id,
        before,
        after: { ...before, deleted_at: new Date(), deleted_by: u.id },
      });
    });
    return res.json({ ok: true });
  }
  fail(405, "Método no permitido.");
}
