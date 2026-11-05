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
  dec,
  enumeration,
  date,
  search,
  tx,
  fail,
  classAccess,
  academicScope,
  audit,
} from "../core.js";
import { safeContent } from "./content.js";
function validateGrade(enrollment) {
  if (
    (enrollment.estado === "aprobado" &&
      (enrollment.nota_final === null || enrollment.nota_final < 51)) ||
    (enrollment.estado === "reprobado" &&
      (enrollment.nota_final === null || enrollment.nota_final >= 51))
  )
    fail(
      422,
      "El estado de aprobación debe coincidir con la nota final: se aprueba desde 51/100.",
    );
}
async function enrollmentHistory(req, old, next) {
  await insert("notas_historial", {
    inscripcion_id: old.id,
    actor_id: req.user.id,
    anterior: JSON.stringify({
      estado: old.estado,
      nota_final: old.nota_final,
    }),
    nueva: JSON.stringify({ estado: next.estado, nota_final: next.nota_final }),
  });
  await audit(req, {
    action: "update",
    entity: "inscripciones",
    entityId: old.id,
    before: old,
    after: next,
  });
}
async function lockClassRelations(data) {
  const career = await one(
    "SELECT c.id FROM carreras c JOIN universidades un ON un.id=c.universidad_id WHERE c.id=? AND c.deleted_at IS NULL AND c.activo=1 AND un.deleted_at IS NULL AND un.activo=1 FOR UPDATE",
    [data.carrera_id],
  );
  if (!career) fail(422, "La carrera no está disponible.");
  if (!data.docente_id) return;
  const teacher = await one(
    "SELECT d.id FROM docentes d JOIN usuarios du ON du.id=d.usuario_id WHERE d.id=? AND du.deleted_at IS NULL AND du.activo=1 FOR UPDATE",
    [data.docente_id],
  );
  if (
    !teacher ||
    !(await val(
      "SELECT 1 FROM docente_carrera WHERE docente_id=? AND carrera_id=? AND deleted_at IS NULL FOR UPDATE",
      [data.docente_id, data.carrera_id],
    ))
  )
    fail(422, "El docente debe estar activo y asignado a esa carrera.");
}
export async function classes(req, res, p) {
  const u = requireUser(req),
    id = p[1] ? positiveId(p[1]) : null,
    sub = p[2],
    sid = p[3] ? positiveId(p[3]) : null,
    m = req.method,
    b = req.body;
  if (p.length > 4) fail(404, "Ruta no encontrada.");
  if (sub) {
    if (!id || !["inscripciones", "laboratorios"].includes(sub))
      fail(404, "Ruta no encontrada.");
    if (sub === "inscripciones" && u.rol === "estudiante")
      fail(403, "No tienes permiso.");
    let k = await classAccess(id, u, m !== "GET");
    if (sub === "inscripciones") {
      if (m === "GET" && !sid)
        return res.json({
          items: await query(
            `SELECT i.*,u.nombre,u.apellido,u.email,e.codigo,(SELECT COUNT(*) FROM practicas pr JOIN laboratorios pl ON pl.id=pr.laboratorio_id AND pl.deleted_at IS NULL WHERE pr.deleted_at IS NULL AND pr.clase_id=i.clase_id AND pr.estudiante_id=e.id) AS practicas,(SELECT ROUND(AVG(pr.puntaje)) FROM practicas pr JOIN laboratorios pl ON pl.id=pr.laboratorio_id AND pl.deleted_at IS NULL WHERE pr.deleted_at IS NULL AND pr.clase_id=i.clase_id AND pr.estudiante_id=e.id) AS promedio,(SELECT MAX(pr.realizada_en) FROM practicas pr JOIN laboratorios pl ON pl.id=pr.laboratorio_id AND pl.deleted_at IS NULL WHERE pr.deleted_at IS NULL AND pr.clase_id=i.clase_id AND pr.estudiante_id=e.id) AS ultima_practica,(SELECT COUNT(*) FROM clase_laboratorio cl JOIN laboratorios al ON al.id=cl.laboratorio_id AND al.deleted_at IS NULL WHERE cl.deleted_at IS NULL AND cl.clase_id=i.clase_id) AS total_labs,(SELECT COUNT(*) FROM clase_laboratorio cl JOIN laboratorios al ON al.id=cl.laboratorio_id AND al.deleted_at IS NULL WHERE cl.deleted_at IS NULL AND cl.clase_id=i.clase_id AND EXISTS(SELECT 1 FROM practicas pr JOIN laboratorios pl ON pl.id=pr.laboratorio_id AND pl.deleted_at IS NULL WHERE pr.deleted_at IS NULL AND pr.clase_id=i.clase_id AND pr.estudiante_id=e.id AND pr.laboratorio_id=cl.laboratorio_id AND pr.completada=1)) AS labs_completados FROM inscripciones i JOIN estudiantes e ON e.id=i.estudiante_id JOIN usuarios u ON u.id=e.usuario_id AND u.deleted_at IS NULL WHERE i.clase_id=? AND i.estado<>'retirado' ORDER BY u.apellido`,
            [id],
          ),
        });
      if (m === "POST" && !sid) {
        const d = validate({ estudiante_id: int(true) }, b);
        const rid = await tx(async () => {
          await one(
            "SELECT id FROM clases WHERE id=? AND deleted_at IS NULL FOR UPDATE",
            [id],
          );
          k = await classAccess(id, u, true);
          const e = await one(
            "SELECT e.id,e.carrera_id FROM estudiantes e JOIN usuarios u ON u.id=e.usuario_id AND u.deleted_at IS NULL WHERE e.id=? AND u.activo=1 FOR UPDATE",
            [d.estudiante_id],
          );
          if (!e || e.carrera_id !== k.carrera_id)
            fail(
              422,
              "El estudiante debe estar activo y pertenecer a la misma carrera de la clase.",
            );
          if (
            k.cupo !== null &&
            Number(
              await val(
                "SELECT COUNT(*) FROM inscripciones i JOIN estudiantes e ON e.id=i.estudiante_id JOIN usuarios su ON su.id=e.usuario_id AND su.deleted_at IS NULL WHERE i.clase_id=? AND i.estado<>'retirado'",
                [id],
              ),
            ) >= k.cupo
          )
            fail(409, "La clase no tiene cupos.");
          const old = await one(
            "SELECT * FROM inscripciones WHERE clase_id=? AND estudiante_id=?",
            [id, d.estudiante_id],
          );
          if (old && old.estado !== "retirado")
            fail(409, "El estudiante ya está inscrito.");
          if (old) {
            const next = {
              estado: "inscrito",
            };
            await update("inscripciones", old.id, next);
            await enrollmentHistory(req, old, { ...old, ...next });
            return old.id;
          }
          const next = { clase_id: id, ...d };
          const rid = await insert("inscripciones", next);
          await audit(req, {
            action: "create",
            entity: "inscripciones",
            entityId: rid,
            after: next,
          });
          return rid;
        });
        return res.status(201).json({ id: rid });
      }
      if (sid) {
        await tx(async () => {
          await one(
            "SELECT id FROM clases WHERE id=? AND deleted_at IS NULL FOR UPDATE",
            [id],
          );
          await classAccess(id, u, true);
          const old = await one(
            "SELECT i.* FROM inscripciones i JOIN estudiantes e ON e.id=i.estudiante_id JOIN usuarios su ON su.id=e.usuario_id AND su.deleted_at IS NULL WHERE i.id=? AND i.clase_id=? AND i.estado<>'retirado' FOR UPDATE",
            [sid, id],
          );
          if (!old) fail(404, "Inscripción no encontrada.");
          if (m === "PUT") {
            const d = validate(
              {
                estado: enumeration([
                  "inscrito",
                  "retirado",
                  "aprobado",
                  "reprobado",
                ]),
                nota_final: dec(),
              },
              b,
              true,
            );
            if (!Object.keys(d).length)
              fail(422, "Envía un estado o una nota final.");
            if (d.nota_final != null)
              d.nota_final = Math.round(d.nota_final * 100) / 100;
            const next = { ...old, ...d };
            validateGrade(next);
            await update("inscripciones", sid, d);
            await enrollmentHistory(req, old, next);
          } else if (m === "DELETE") {
            // Removing a student from a class must retain grades, certificates and past attempts.
            await update("inscripciones", sid, { estado: "retirado" });
            await enrollmentHistory(req, old, { ...old, estado: "retirado" });
          } else fail(405, "Método no permitido.");
        });
        return res.json({ ok: true });
      }
    } else {
      if (m === "GET" && !sid) {
        const params =
          u.rol === "estudiante"
            ? [u.estudiante_id, u.estudiante_id, id]
            : [id];
        const extra =
          u.rol === "estudiante"
            ? `,(SELECT COUNT(*) FROM practicas pr JOIN laboratorios pl ON pl.id=pr.laboratorio_id AND pl.deleted_at IS NULL WHERE pr.deleted_at IS NULL AND pr.estudiante_id=? AND pr.laboratorio_id=l.id AND pr.clase_id=cl.clase_id) AS mis_practicas,(SELECT MAX(pr.puntaje) FROM practicas pr JOIN laboratorios pl ON pl.id=pr.laboratorio_id AND pl.deleted_at IS NULL WHERE pr.deleted_at IS NULL AND pr.estudiante_id=? AND pr.laboratorio_id=l.id AND pr.clase_id=cl.clase_id) AS mi_mejor_puntaje`
            : "";
        return res.json({
          items: (
            await query(
              `SELECT l.*,cl.fecha_limite,cl.asignado_en ${extra} FROM clase_laboratorio cl JOIN laboratorios l ON l.id=cl.laboratorio_id AND l.deleted_at IS NULL WHERE cl.clase_id=? AND cl.deleted_at IS NULL ${u.rol === "estudiante" ? "AND l.estado='publicado'" : ""} ORDER BY l.nombre`,
              params,
            )
          ).map(safeContent),
        });
      }
      if (m === "POST" && !sid) {
        const d = validate(
          { laboratorio_id: int(true), fecha_limite: date },
          b,
        );
        await tx(async () => {
          await one(
            "SELECT id FROM clases WHERE id=? AND deleted_at IS NULL FOR UPDATE",
            [id],
          );
          k = await classAccess(id, u, true);
          if (
            !(await one(
              "SELECT id FROM laboratorios WHERE id=? AND deleted_at IS NULL FOR UPDATE",
              [d.laboratorio_id],
            ))
          )
            fail(422, "Laboratorio no disponible.");
          if (
            !(await val(
              "SELECT 1 FROM laboratorio_carrera lc JOIN laboratorios l ON l.id=lc.laboratorio_id AND l.deleted_at IS NULL WHERE lc.laboratorio_id=? AND lc.carrera_id=? AND lc.deleted_at IS NULL",
              [d.laboratorio_id, k.carrera_id],
            ))
          )
            fail(422, "Laboratorio no habilitado para esta carrera.");
          const before = await one(
            "SELECT * FROM clase_laboratorio WHERE clase_id=? AND laboratorio_id=? FOR UPDATE",
            [id, d.laboratorio_id],
          );
          await query(
            "INSERT INTO clase_laboratorio(clase_id,laboratorio_id,fecha_limite) VALUES(?,?,?) ON DUPLICATE KEY UPDATE fecha_limite=VALUES(fecha_limite),deleted_at=NULL,deleted_by=NULL",
            [id, d.laboratorio_id, d.fecha_limite || null],
          );
          await audit(req, {
            action: before ? "update" : "create",
            entity: "clase_laboratorio",
            entityId: id,
            before,
            after: d,
          });
        });
        return res.status(201).json({ ok: true });
      }
      if (m === "DELETE" && sid) {
        await tx(async () => {
          await one(
            "SELECT id FROM clases WHERE id=? AND deleted_at IS NULL FOR UPDATE",
            [id],
          );
          await classAccess(id, u, true);
          const before = await one(
            "SELECT * FROM clase_laboratorio WHERE clase_id=? AND laboratorio_id=? AND deleted_at IS NULL FOR UPDATE",
            [id, sid],
          );
          if (!before) fail(404, "Asignación no encontrada.");
          await query(
            "UPDATE clase_laboratorio SET deleted_at=NOW(),deleted_by=? WHERE clase_id=? AND laboratorio_id=? AND deleted_at IS NULL",
            [u.id, id, sid],
          );
          await audit(req, {
            action: "archive",
            entity: "clase_laboratorio",
            entityId: id,
            before,
            after: { ...before, deleted_at: new Date(), deleted_by: u.id },
          });
        });
        return res.json({ ok: true });
      }
    }
    fail(405, "Método no permitido.");
  }
  if (m === "GET") {
    if (id) await classAccess(id, u);
    const [scope, params] = academicScope(u);
    let sql = `SELECT k.*,c.nombre AS carrera,c.universidad_id,un.nombre AS universidad,un.sigla AS universidad_sigla,CONCAT(du.nombre,' ',du.apellido) AS docente,(SELECT COUNT(*) FROM inscripciones i JOIN estudiantes se ON se.id=i.estudiante_id JOIN usuarios su ON su.id=se.usuario_id AND su.deleted_at IS NULL WHERE i.clase_id=k.id AND i.estado<>'retirado') AS inscritos,(SELECT GROUP_CONCAT(l.nombre SEPARATOR ', ') FROM clase_laboratorio cl JOIN laboratorios l ON l.id=cl.laboratorio_id WHERE cl.clase_id=k.id AND cl.deleted_at IS NULL AND l.deleted_at IS NULL) AS laboratorios FROM clases k JOIN carreras c ON c.id=k.carrera_id AND c.deleted_at IS NULL JOIN universidades un ON un.id=c.universidad_id AND un.deleted_at IS NULL LEFT JOIN docentes d ON d.id=k.docente_id LEFT JOIN usuarios du ON du.id=d.usuario_id AND du.deleted_at IS NULL WHERE 1=1 ${scope}`;
    if (id) {
      sql += " AND k.id=?";
      params.push(id);
    } else {
      sql += search(
        ["k.nombre", "k.codigo", "c.nombre", "du.nombre", "du.apellido"],
        req.query.q,
        params,
      );
      for (const key of ["carrera_id", "estado", "periodo", "docente_id"])
        if (req.query[key]) {
          sql += ` AND k.${key}=?`;
          params.push(req.query[key]);
        }
    }
    const rows = await query(sql + " ORDER BY k.periodo DESC,k.nombre", params);
    if (u.rol === "estudiante")
      for (const r of rows) {
        const i = await one(
          "SELECT estado,nota_final FROM inscripciones WHERE clase_id=? AND estudiante_id=?",
          [r.id, u.estudiante_id],
        );
        r.mi_estado = i?.estado;
        r.mi_nota = i?.nota_final;
      }
    if (id && !rows[0]) fail(404, "Clase no encontrada.");
    return res.json(id ? { item: rows[0] } : { items: rows });
  }
  requireUser(req, "admin", "docente");
  if (id) await classAccess(id, u, true);
  if ((m === "POST" && !id) || (m === "PUT" && id)) {
    const d = validate(
      {
        carrera_id: int(true),
        docente_id: int(),
        nombre: text(140, true),
        codigo: text(30),
        descripcion: text(3000),
        periodo: text(20, true),
        horario: text(120),
        aula: text(60),
        cupo: int(false, 1, 2000),
        estado: enumeration(["planificada", "activa", "finalizada"], true),
      },
      b,
    );
    const c = await exists("carreras", d.carrera_id);
    if (u.rol === "docente") {
      d.docente_id = u.docente_id;
      if (
        !(await val(
          "SELECT 1 FROM docente_carrera dc JOIN docentes d ON d.id=dc.docente_id JOIN usuarios du ON du.id=d.usuario_id AND du.deleted_at IS NULL WHERE dc.docente_id=? AND dc.carrera_id=? AND dc.deleted_at IS NULL",
          [u.docente_id, c.id],
        ))
      )
        fail(422, "Solo puedes crear clases en tus carreras.");
    }
    if (
      d.docente_id &&
      !(await val(
        "SELECT 1 FROM docente_carrera dc JOIN docentes d ON d.id=dc.docente_id JOIN usuarios du ON du.id=d.usuario_id AND du.deleted_at IS NULL WHERE dc.docente_id=? AND dc.carrera_id=? AND dc.deleted_at IS NULL",
        [d.docente_id, c.id],
      ))
    )
      fail(422, "El docente no está asignado a esa carrera.");
    if (id) {
      await tx(async () => {
        const before = await one(
          "SELECT * FROM clases WHERE id=? AND deleted_at IS NULL FOR UPDATE",
          [id],
        );
        await classAccess(id, u, true);
        await lockClassRelations(d);
        if (
          before.carrera_id !== d.carrera_id &&
          ((await val("SELECT 1 FROM inscripciones WHERE clase_id=? LIMIT 1", [
            id,
          ])) ||
            (await val(
              "SELECT 1 FROM clase_laboratorio WHERE clase_id=? AND deleted_at IS NULL LIMIT 1",
              [id],
            )))
        )
          fail(
            409,
            "Una clase con inscripciones o laboratorios debe conservar su carrera.",
          );
        if (
          d.cupo != null &&
          d.cupo <
            Number(
              await val(
                "SELECT COUNT(*) FROM inscripciones i JOIN estudiantes e ON e.id=i.estudiante_id JOIN usuarios su ON su.id=e.usuario_id AND su.deleted_at IS NULL WHERE i.clase_id=? AND i.estado<>'retirado'",
                [id],
              ),
            )
        )
          fail(
            409,
            "El cupo no puede ser menor que las inscripciones activas.",
          );
        await update("clases", id, d);
        await audit(req, {
          action: "update",
          entity: "clases",
          entityId: id,
          before,
          after: { ...before, ...d },
        });
      });
      return res.json({ ok: true });
    }
    const rid = await tx(async () => {
      await lockClassRelations(d);
      const rid = await insert("clases", d);
      await audit(req, {
        action: "create",
        entity: "clases",
        entityId: rid,
        after: d,
      });
      return rid;
    });
    return res.status(201).json({ id: rid });
  }
  if (m === "DELETE" && id) {
    await tx(async () => {
      const before = await one(
        "SELECT * FROM clases WHERE id=? AND deleted_at IS NULL FOR UPDATE",
        [id],
      );
      await classAccess(id, u, true);
      await query(
        "UPDATE clases SET deleted_at=NOW(),deleted_by=? WHERE id=? AND deleted_at IS NULL",
        [u.id, id],
      );
      await audit(req, {
        action: "archive",
        entity: "clases",
        entityId: id,
        before,
        after: { ...before, deleted_at: new Date(), deleted_by: u.id },
      });
    });
    return res.json({ ok: true });
  }
  fail(405, "Método no permitido.");
}
