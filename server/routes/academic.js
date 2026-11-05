import { randomBytes } from "node:crypto";
import {
  query,
  one,
  val,
  insert,
  exists,
  requireUser,
  positiveId,
  validate,
  int,
  fail,
  academicScope,
  classAccess,
  tx,
  audit,
} from "../core.js";
import { sql, scoped } from "../sql.js";
const average = (rows) =>
  rows.length
    ? Math.round(rows.reduce((s, x) => s + Number(x), 0) / rows.length)
    : 0;
export async function academicData(u) {
  const [scope, params] = academicScope(u),
    own = u.rol === "estudiante" ? " AND e.id=?" : "",
    ip = [...params, ...(own ? [u.estudiante_id] : [])],
    s = sql.academico;
  const clases = await query(scoped(s.courses, { scope }), params),
    inscripciones = await query(scoped(s.enrollments, { scope, own }), ip);
  for (const r of inscripciones) {
    r.progreso = r.total ? Math.round((100 * r.completados) / r.total) : 0;
    r.certificable = !!(
      r.total &&
      r.completados === r.total &&
      r.estado === "aprobado" &&
      r.nota_final !== null &&
      r.nota_final >= 51
    );
  }
  for (const k of clases) {
    const en = inscripciones.filter((r) => r.clase_id === k.id);
    Object.assign(k, {
      inscritos: en.length,
      progreso: average(en.map((r) => r.progreso)),
      aprobados: en.filter((r) => r.estado === "aprobado").length,
      pendientes_nota: en.filter((r) => r.nota_final === null).length,
    });
  }
  let aw = "",
    ap = [],
    sw = "",
    sp = [],
    tw = "",
    tp = [];
  if (u.rol === "director") {
    aw = " AND (k.carrera_id=? OR (pr.clase_id IS NULL AND e.carrera_id=?))";
    ap = [u.director_carrera_id, u.director_carrera_id];
    sw =
      " AND (e.carrera_id=? OR EXISTS(SELECT 1 FROM inscripciones ai JOIN clases ak ON ak.id=ai.clase_id AND ak.deleted_at IS NULL WHERE ai.estudiante_id=e.id AND ai.estado<>'retirado' AND ak.carrera_id=?))";
    sp = ap;
    tw =
      " AND EXISTS(SELECT 1 FROM docente_carrera dc WHERE dc.docente_id=d.id AND dc.carrera_id=? AND dc.deleted_at IS NULL)";
    tp = [u.director_carrera_id];
  } else if (u.rol === "docente") {
    aw = " AND k.docente_id=?";
    ap = [u.docente_id];
    sw =
      " AND EXISTS(SELECT 1 FROM inscripciones ai JOIN clases ak ON ak.id=ai.clase_id AND ak.deleted_at IS NULL WHERE ai.estudiante_id=e.id AND ai.estado<>'retirado' AND ak.docente_id=?)";
    sp = ap;
    tw = " AND d.id=?";
    tp = ap;
  } else if (u.rol === "estudiante") {
    aw = " AND e.id=?";
    ap = [u.estudiante_id];
    sw = aw;
    sp = ap;
    tw =
      " AND d.id IN(SELECT k.docente_id FROM clases k JOIN inscripciones i ON i.clase_id=k.id WHERE i.estudiante_id=? AND i.estado<>'retirado' AND k.deleted_at IS NULL)";
    tp = ap;
  }
  const actividad = await query(scoped(s.activity, { aw }), ap),
    resumen_practicas = await one(scoped(s.practiceSummary, { aw }), ap),
    practice = await query(scoped(s.studentPractice, { aw }), ap),
    estudiantes = await query(scoped(s.students, { sw }), sp),
    notas_historial = await query(scoped(s.history, { scope, own }), ip),
    docentes = await query(scoped(s.teachers, { tw }), tp);
  for (const st of estudiantes) {
    const en = inscripciones.filter((r) => r.estudiante_id === st.id),
      pr = practice.find((r) => r.estudiante_id === st.id);
    Object.assign(st, {
      intentos: pr?.intentos || 0,
      minutos: pr?.minutos || 0,
      cursos: en.length,
      progreso: average(en.map((r) => r.progreso)),
    });
  }
  for (const t of docentes) {
    const ks = clases.filter((k) => k.docente_id === t.id);
    Object.assign(t, {
      clases: ks.length,
      inscripciones: ks.reduce((s, k) => s + k.inscritos, 0),
      progreso: average(ks.map((k) => k.progreso)),
      pendientes_nota: ks.reduce((s, k) => s + k.pendientes_nota, 0),
    });
  }
  const total = inscripciones.reduce((s, r) => s + Number(r.total), 0),
    done = inscripciones.reduce((s, r) => s + Number(r.completados), 0),
    notes = inscripciones
      .filter((r) => r.nota_final !== null)
      .map((r) => r.nota_final);
  return {
    rol: u.rol,
    stats: {
      cursos: clases.length,
      estudiantes: estudiantes.length,
      docentes: docentes.length,
      asignaciones: total,
      completadas: done,
      progreso: total ? Math.round((done * 100) / total) : 0,
      promedio: notes.length ? average(notes) : null,
      minutos: inscripciones.reduce((s, r) => s + Number(r.minutos), 0),
      pendientes_nota: inscripciones.filter((r) => r.nota_final === null)
        .length,
      certificables: inscripciones.filter((r) => r.certificable).length,
    },
    resumen_practicas,
    clases,
    estudiantes,
    inscripciones,
    docentes,
    notas_historial,
    actividad,
  };
}
export async function academic(req, res, p) {
  if (req.method !== "GET") fail(405, "Método no permitido.");
  const d = await academicData(requireUser(req));
  if (p.length === 1) return res.json(d);
  if (p.length !== 3 || !["estudiantes", "docentes"].includes(p[1]))
    fail(404, "Ruta no encontrada.");
  const id = positiveId(p[2]),
    student = p[1] === "estudiantes",
    person = d[p[1]].find((r) => r.id === id);
  if (!person) fail(404, "Perfil no disponible en tu ámbito.");
  d.inscripciones = d.inscripciones.filter((r) =>
    student ? r.estudiante_id === id : r.docente_id === id,
  );
  const courseIds = new Set(
    student
      ? d.inscripciones.map((r) => r.clase_id)
      : d.clases.filter((r) => r.docente_id === id).map((r) => r.id),
  );
  d.clases = d.clases.filter((r) => courseIds.has(r.id));
  d.actividad = d.actividad.filter((r) =>
    student ? r.estudiante_id === id : courseIds.has(r.clase_id),
  );
  d.notas_historial = d.notas_historial.filter((r) =>
    student ? r.estudiante_id === id : courseIds.has(r.clase_id),
  );
  d.estudiantes = d.estudiantes.filter((r) =>
    student
      ? r.id === id
      : d.inscripciones.some((i) => i.estudiante_id === r.id),
  );
  d.perfil = {
    nombre: person.nombre,
    codigo: person.codigo,
    tipo: student ? "Estudiante" : "Docente",
  };
  const total = d.inscripciones.reduce((s, r) => s + Number(r.total), 0),
    done = d.inscripciones.reduce((s, r) => s + Number(r.completados), 0),
    notes = d.inscripciones
      .filter((r) => r.nota_final !== null)
      .map((r) => r.nota_final);
  d.stats = {
    cursos: d.clases.length,
    estudiantes: d.estudiantes.length,
    asignaciones: total,
    completadas: done,
    progreso: total ? Math.round((done * 100) / total) : 0,
    promedio: notes.length ? average(notes) : null,
    pendientes_nota: d.inscripciones.filter((r) => r.nota_final === null)
      .length,
  };
  d.resumen_practicas = {
    intentos: student
      ? person.intentos
      : d.inscripciones.reduce((s, r) => s + Number(r.intentos), 0),
    minutos: student
      ? person.minutos
      : d.inscripciones.reduce((s, r) => s + Number(r.minutos), 0),
  };
  return res.json(d);
}
export async function certificateAccess(id, u, historical = false) {
  const r = await one(sql.academico.certificateEnrollment, [id]);
  if (!r) fail(404, "Inscripción no encontrada.");
  if (u.rol === "estudiante") {
    if (r.usuario_id !== u.id)
      fail(403, "No tienes acceso a este certificado.");
  } else if (historical) {
    const course = await one(
      "SELECT docente_id,carrera_id FROM clases WHERE id=?",
      [r.clase_id],
    );
    if (
      !course ||
      !(
        u.rol === "admin" ||
        (u.rol === "docente" && course.docente_id === u.docente_id) ||
        (u.rol === "director" && course.carrera_id === u.director_carrera_id)
      )
    )
      fail(403, "No tienes acceso a este certificado.");
  } else await classAccess(r.clase_id, u);
  if (
    !historical &&
    !(await val(
      "SELECT 1 FROM clases k JOIN carreras c ON c.id=k.carrera_id JOIN universidades un ON un.id=c.universidad_id JOIN estudiantes e ON e.id=? JOIN usuarios us ON us.id=e.usuario_id WHERE k.id=? AND k.deleted_at IS NULL AND c.deleted_at IS NULL AND c.activo=1 AND un.deleted_at IS NULL AND un.activo=1 AND us.deleted_at IS NULL AND us.activo=1",
      [r.estudiante_id, r.clase_id],
    ))
  )
    fail(404, "La inscripción no está disponible.");
  return r;
}
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function certificates(req, res, p) {
  const u = requireUser(req);
  if (req.method === "POST" && p.length === 1) {
    const d = validate({ inscripcion_id: int(true) }, req.body);
    const initial = await certificateAccess(d.inscripcion_id, u);
    const result = await tx(async () => {
      // All academic mutations lock the class before its enrollment, so the
      // requirements cannot change halfway through issuing a certificate.
      await one("SELECT id FROM clases WHERE id=? FOR UPDATE", [
        initial.clase_id,
      ]);
      await one("SELECT id FROM inscripciones WHERE id=? FOR UPDATE", [
        d.inscripcion_id,
      ]);
      const r = await certificateAccess(d.inscripcion_id, u),
        total = Number(
          await val(
            "SELECT COUNT(*) FROM clase_laboratorio cl JOIN laboratorios l ON l.id=cl.laboratorio_id AND l.deleted_at IS NULL WHERE cl.clase_id=? AND cl.deleted_at IS NULL",
            [r.clase_id],
          ),
        ),
        done = Number(
          await val(
            "SELECT COUNT(*) FROM clase_laboratorio cl JOIN laboratorios l ON l.id=cl.laboratorio_id AND l.deleted_at IS NULL WHERE cl.clase_id=? AND cl.deleted_at IS NULL AND EXISTS(SELECT 1 FROM practicas pr WHERE pr.clase_id=cl.clase_id AND pr.laboratorio_id=cl.laboratorio_id AND pr.estudiante_id=? AND pr.completada=1 AND pr.deleted_at IS NULL)",
            [r.clase_id, r.estudiante_id],
          ),
        );
      if (
        !total ||
        done !== total ||
        r.estado !== "aprobado" ||
        r.nota_final === null ||
        r.nota_final < 51
      )
        fail(
          422,
          "Completa todos los laboratorios y obtén aprobación docente con nota mínima de 51/100.",
        );
      const old = await val(
        "SELECT id FROM certificados WHERE inscripcion_id=?",
        [r.id],
      );
      if (old) return { id: old, created: false };
      const next = {
        inscripcion_id: r.id,
        codigo: randomBytes(16).toString("hex"),
        estudiante: r.estudiante,
        curso: r.curso,
        carrera: r.carrera,
        institucion: r.institucion,
        nota: r.nota_final,
        emitido_por: u.id,
      };
      const id = await insert("certificados", next);
      await audit(req, {
        action: "create",
        entity: "certificados",
        entityId: id,
        after: next,
      });
      return { id, created: true };
    });
    return res.status(result.created ? 201 : 200).json({ id: result.id });
  }
  if (req.method === "GET" && p.length === 3 && p[2] === "documento") {
    const c = await exists("certificados", positiveId(p[1]));
    await certificateAccess(c.inscripcion_id, u, true);
    return res
      .type("html")
      .send(
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Certificado ORBIT</title><link rel="stylesheet" href="/css/certificado.css"><script src="/js/certificado.js" defer></script></head><body><div class="tools"><button id="print">Imprimir / Guardar como PDF</button></div><main class="paper"><p class="brand">ORBIT</p><p>Dirección académica · Formación práctica</p><h1>Certificado de finalización</h1><p>ORBIT certifica que</p><h2>${esc(c.estudiante)}</h2><p>ha finalizado el curso <strong>${esc(c.curso)}</strong>, completando sus laboratorios asignados y obteniendo aprobación docente con una nota final de <strong>${Number(c.nota).toFixed(2)}/100</strong>.</p><p>${esc(c.carrera)} · ${esc(c.institucion)}</p><footer>Emisión: ${esc(c.emitido_en.slice(0, 10))}<br>ORBIT-${esc(c.codigo.toUpperCase())}<p>Constancia de finalización del curso en la plataforma ORBIT.</p></footer></main></body></html>`,
      );
  }
  fail(404, "Ruta no encontrada.");
}
