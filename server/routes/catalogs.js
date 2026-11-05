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
  bool,
  date,
  email,
  areas,
  search,
  tx,
  ids,
  hashPassword,
  fail,
  audit,
  replaceLinks,
} from "../core.js";
const specs = {
  universidades: {
    nombre: text(160, true),
    sigla: text(20),
    tipo: enumeration(["universidad", "instituto", "colegio"], true),
    ciudad: text(80),
    pais: text(60, true),
    email_contacto: { ...email, req: false },
    telefono: text(30),
    activo: bool,
  },
  carreras: {
    universidad_id: int(true),
    nombre: text(140, true),
    codigo: text(20),
    area: enumeration(areas, true),
    duracion_semestres: int(false, 1, 20),
    activo: bool,
  },
  licencias: {
    universidad_id: int(true),
    plan: enumeration(["piloto", "institucional", "proyecto_medida"], true),
    precio_estudiante_mes: { ...dec(99999), req: true },
    estudiantes_max: int(),
    fecha_inicio: { ...date, req: true },
    fecha_fin: date,
    estado: enumeration(["activa", "vencida", "suspendida"], true),
    notas: text(),
  },
  planes: {
    nombre: text(80, true),
    precio_mes: { ...dec(99999), req: true },
    descripcion: text(),
    activo: bool,
  },
  solicitudes: {
    estado: enumeration(["nueva", "en_proceso", "cotizada", "cerrada"], true),
  },
};
const selects = {
  universidades: `SELECT u.*,(SELECT COUNT(*) FROM carreras c WHERE c.universidad_id=u.id AND c.deleted_at IS NULL) AS carreras,(SELECT COUNT(*) FROM estudiantes e JOIN usuarios eu ON eu.id=e.usuario_id AND eu.deleted_at IS NULL JOIN carreras c ON c.id=e.carrera_id AND c.deleted_at IS NULL WHERE c.universidad_id=u.id) AS estudiantes FROM universidades u WHERE u.deleted_at IS NULL`,
  carreras: `SELECT c.*,u.nombre AS universidad,u.sigla AS universidad_sigla,(SELECT COUNT(*) FROM estudiantes e JOIN usuarios eu ON eu.id=e.usuario_id AND eu.deleted_at IS NULL WHERE e.carrera_id=c.id) AS estudiantes,(SELECT COUNT(*) FROM clases k WHERE k.carrera_id=c.id AND k.deleted_at IS NULL) AS clases,(SELECT COUNT(*) FROM laboratorio_carrera lc JOIN laboratorios l ON l.id=lc.laboratorio_id AND l.deleted_at IS NULL WHERE lc.carrera_id=c.id AND lc.deleted_at IS NULL) AS laboratorios FROM carreras c JOIN universidades u ON u.id=c.universidad_id AND u.deleted_at IS NULL WHERE c.deleted_at IS NULL`,
  licencias: `SELECT l.*,u.nombre AS universidad,(SELECT COUNT(*) FROM estudiantes e JOIN usuarios eu ON eu.id=e.usuario_id AND eu.deleted_at IS NULL JOIN carreras c ON c.id=e.carrera_id AND c.deleted_at IS NULL WHERE c.universidad_id=l.universidad_id) AS estudiantes_actuales FROM licencias l JOIN universidades u ON u.id=l.universidad_id AND u.deleted_at IS NULL WHERE l.deleted_at IS NULL`,
  planes: `SELECT pl.*,(SELECT COUNT(*) FROM suscripciones s WHERE s.plan_id=pl.id AND s.estado='activa' AND s.fecha_inicio<=CURDATE() AND s.fecha_fin>=CURDATE()) AS activas FROM planes pl WHERE pl.deleted_at IS NULL`,
  solicitudes: "SELECT s.* FROM solicitudes s WHERE s.deleted_at IS NULL",
};
const aliases = {
  universidades: "u",
  carreras: "c",
  licencias: "l",
  planes: "pl",
  solicitudes: "s",
};
export async function catalogs(req, res, p) {
  const table = p[0],
    m = req.method,
    id = p[1] ? positiveId(p[1]) : null;
  if (p.length > 2) fail(404, "Ruta no encontrada.");
  if (table === "solicitudes" && m === "POST" && !id) {
    const d = validate(
      {
        nombre: text(120, true),
        institucion: text(160),
        email,
        tipo: text(80),
        mensaje: { ...text(3000, true), min: 5 },
      },
      req.body,
    );
    if (req.body.sitio_web) return res.status(201).json({ ok: true });
    return res.status(201).json({ id: await insert(table, d) });
  }
  const actor = requireUser(req, "admin");
  if (
    (table === "planes" && !["GET", "PUT"].includes(m)) ||
    (table === "solicitudes" && m === "POST")
  )
    fail(405, "Método no permitido.");
  if (m === "GET") {
    const a = aliases[table],
      params = [];
    let sql = selects[table];
    if (id) {
      sql += ` AND ${a}.id=?`;
      params.push(id);
    } else {
      const col =
        table === "licencias"
          ? "u.nombre"
          : table === "planes"
            ? "pl.nombre"
            : table === "solicitudes"
              ? "s.nombre"
              : a + ".nombre";
      sql += search([col], req.query.q, params);
      for (const k of ["universidad_id", "estado", "tipo", "area"])
        if (specs[table][k] && req.query[k]) {
          sql += ` AND ${a}.${k}=?`;
          params.push(req.query[k]);
        }
    }
    const rows = await query(sql + " ORDER BY " + a + ".id DESC", params);
    if (id && !rows[0]) fail(404, "Registro no encontrado.");
    return res.json(id ? { item: rows[0] } : { items: rows });
  }
  if ((m === "POST" && !id) || (m === "PUT" && id)) {
    const before = id ? await exists(table, id) : null;
    const d = validate(specs[table], req.body, m === "PUT");
    if (d.universidad_id) await exists("universidades", d.universidad_id);
    if (table === "licencias") {
      const merged = { ...(id ? await exists(table, id) : {}), ...d };
      if (merged.fecha_fin && merged.fecha_fin < merged.fecha_inicio)
        fail(422, "La fecha final debe ser posterior al inicio.");
    }
    const rid = await tx(async () => {
      if (id) await one(`SELECT id FROM ${table} WHERE id=? FOR UPDATE`, [id]);
      const currentBefore = id ? await exists(table, id) : null;
      if (
        d.universidad_id &&
        !(await one(
          "SELECT id FROM universidades WHERE id=? AND deleted_at IS NULL FOR UPDATE",
          [d.universidad_id],
        ))
      )
        fail(422, "La institución ya no está disponible.");
      if (
        table === "carreras" &&
        before &&
        d.universidad_id &&
        d.universidad_id !== before.universidad_id &&
        ((await val("SELECT 1 FROM estudiantes WHERE carrera_id=? LIMIT 1", [
          id,
        ])) ||
          (await val(
            "SELECT 1 FROM docente_carrera WHERE carrera_id=? AND deleted_at IS NULL LIMIT 1",
            [id],
          )) ||
          (await val("SELECT 1 FROM directores WHERE carrera_id=? LIMIT 1", [
            id,
          ])) ||
          (await val(
            "SELECT 1 FROM clases WHERE carrera_id=? AND deleted_at IS NULL LIMIT 1",
            [id],
          )))
      )
        fail(
          409,
          "Una carrera con personas o clases debe conservar su institución.",
        );
      const rid = id || (await insert(table, d));
      if (id) await update(table, id, d);
      await audit(req, {
        action: id ? "update" : "create",
        entity: table,
        entityId: rid,
        before: currentBefore,
        after: { ...currentBefore, ...d },
      });
      return rid;
    });
    return res.status(id ? 200 : 201).json(id ? { ok: true } : { id: rid });
  }
  if (m === "DELETE" && id) {
    await tx(async () => {
      await one(`SELECT id FROM ${table} WHERE id=? FOR UPDATE`, [id]);
      const before = await exists(table, id);
      if (
        table === "universidades" &&
        ((await val(
          "SELECT 1 FROM carreras WHERE universidad_id=? AND deleted_at IS NULL LIMIT 1",
          [id],
        )) ||
          (await val(
            "SELECT 1 FROM usuarios WHERE universidad_id=? AND deleted_at IS NULL LIMIT 1",
            [id],
          )) ||
          (await val(
            "SELECT 1 FROM licencias WHERE universidad_id=? AND deleted_at IS NULL LIMIT 1",
            [id],
          )))
      )
        fail(
          409,
          "Da de baja primero las carreras, cuentas y licencias vigentes de la institución.",
        );
      if (
        table === "carreras" &&
        ((await val(
          "SELECT 1 FROM clases WHERE carrera_id=? AND deleted_at IS NULL LIMIT 1",
          [id],
        )) ||
          (await val(
            "SELECT 1 FROM estudiantes e JOIN usuarios u ON u.id=e.usuario_id WHERE e.carrera_id=? AND u.deleted_at IS NULL LIMIT 1",
            [id],
          )) ||
          (await val(
            "SELECT 1 FROM directores d JOIN usuarios u ON u.id=d.usuario_id WHERE d.carrera_id=? AND u.deleted_at IS NULL LIMIT 1",
            [id],
          )) ||
          (await val(
            "SELECT 1 FROM docente_carrera dc JOIN docentes d ON d.id=dc.docente_id JOIN usuarios u ON u.id=d.usuario_id WHERE dc.carrera_id=? AND dc.deleted_at IS NULL AND u.deleted_at IS NULL LIMIT 1",
            [id],
          )))
      )
        fail(
          409,
          "Da de baja o reasigna primero las clases y personas vigentes de la carrera.",
        );
      await query(
        `UPDATE ${table} SET deleted_at=NOW(),deleted_by=? WHERE id=?`,
        [actor.id, id],
      );
      await audit(req, {
        action: "archive",
        entity: table,
        entityId: id,
        before,
        after: { archived: true, deleted_by: actor.id },
      });
    });
    return res.json({ ok: true });
  }
  fail(405, "Método no permitido.");
}
const userSpec = {
  nombre: text(80, true),
  apellido: text(80, true),
  email,
  telefono: text(30),
  activo: bool,
};
export async function saveUser(body, role, university, uid) {
  const d = validate(userSpec, body);
  d.universidad_id = university;
  const before = uid ? await exists("usuarios", uid) : null;
  if (!uid || body.password) {
    d.password_hash = await hashPassword(body.password);
  }
  if (uid) {
    if (
      body.password ||
      d.email !== before.email ||
      (d.activo !== undefined && d.activo !== before.activo)
    )
      await query(
        "UPDATE usuarios SET auth_version=auth_version+1 WHERE id=?",
        [uid],
      );
    await update("usuarios", uid, d);
    return uid;
  }
  return insert("usuarios", { ...d, rol: role });
}
export async function people(req, res, p) {
  const actor = requireUser(req, "admin");
  const table = p[0],
    id = p[1] ? positiveId(p[1]) : null,
    m = req.method;
  if (p.length > 2) fail(404, "Ruta no encontrada.");
  const teacher = table === "docentes",
    director = table === "directores",
    a = teacher ? "d" : director ? "dr" : "e";
  let sql = teacher
    ? `SELECT d.*,u.nombre,u.apellido,u.email,u.telefono,u.activo,u.ultimo_acceso,u.universidad_id,un.nombre AS universidad,(SELECT GROUP_CONCAT(c.nombre SEPARATOR ', ') FROM docente_carrera dc JOIN carreras c ON c.id=dc.carrera_id AND c.deleted_at IS NULL WHERE dc.docente_id=d.id AND dc.deleted_at IS NULL) AS carreras,(SELECT GROUP_CONCAT(carrera_id) FROM docente_carrera dc WHERE dc.docente_id=d.id AND dc.deleted_at IS NULL) AS carrera_ids,(SELECT COUNT(*) FROM clases k WHERE k.docente_id=d.id AND k.deleted_at IS NULL) AS clases FROM docentes d JOIN usuarios u ON u.id=d.usuario_id LEFT JOIN universidades un ON un.id=u.universidad_id AND un.deleted_at IS NULL WHERE u.deleted_at IS NULL`
    : director
      ? `SELECT dr.*,u.nombre,u.apellido,u.email,u.telefono,u.activo,u.ultimo_acceso,c.nombre AS carrera,c.universidad_id,un.nombre AS universidad FROM directores dr JOIN usuarios u ON u.id=dr.usuario_id JOIN carreras c ON c.id=dr.carrera_id AND c.deleted_at IS NULL JOIN universidades un ON un.id=c.universidad_id AND un.deleted_at IS NULL WHERE u.deleted_at IS NULL`
      : `SELECT e.*,u.nombre,u.apellido,u.email,u.telefono,u.activo,u.ultimo_acceso,c.nombre AS carrera,c.universidad_id,un.nombre AS universidad,un.sigla AS universidad_sigla,(SELECT COUNT(*) FROM inscripciones i JOIN clases k ON k.id=i.clase_id AND k.deleted_at IS NULL WHERE i.estudiante_id=e.id AND i.estado<>'retirado') AS clases,(SELECT COUNT(*) FROM practicas pr WHERE pr.estudiante_id=e.id AND pr.deleted_at IS NULL) AS practicas,(SELECT MAX(s.fecha_fin) FROM suscripciones s WHERE s.usuario_id=u.id AND s.estado='activa' AND s.fecha_fin>=CURDATE()) AS premium_hasta FROM estudiantes e JOIN usuarios u ON u.id=e.usuario_id LEFT JOIN carreras c ON c.id=e.carrera_id AND c.deleted_at IS NULL LEFT JOIN universidades un ON un.id=c.universidad_id AND un.deleted_at IS NULL WHERE u.deleted_at IS NULL`;
  if (m === "GET") {
    const params = [];
    if (id) {
      sql += ` AND ${a}.id=?`;
      params.push(id);
    } else {
      sql += search(["u.nombre", "u.apellido", "u.email"], req.query.q, params);
      if (req.query.universidad_id) {
        sql += " AND " + (teacher ? "u" : "c") + ".universidad_id=?";
        params.push(req.query.universidad_id);
      }
      if (!teacher && req.query.carrera_id) {
        sql += ` AND ${a}.carrera_id=?`;
        params.push(req.query.carrera_id);
      }
    }
    const rows = await query(sql + " ORDER BY u.apellido,u.nombre", params);
    if (id && !rows[0]) fail(404, "Registro no encontrado.");
    return res.json(id ? { item: rows[0] } : { items: rows });
  }
  if ((m === "POST" && !id) || (m === "PUT" && id)) {
    const old = id ? await exists(table, id) : null,
      b = req.body;
    if (old) await exists("usuarios", old.usuario_id);
    let university = null,
      d,
      careers = [];
    if (teacher) {
      d = validate(
        {
          universidad_id: int(true),
          especialidad: text(120),
          grado_academico: enumeration([
            "Licenciatura",
            "Especialidad",
            "Maestría",
            "Doctorado",
          ]),
        },
        b,
      );
      university = d.universidad_id;
      delete d.universidad_id;
      await exists("universidades", university);
      careers = ids(b.carrera_ids);
      for (const cid of careers)
        if ((await exists("carreras", cid)).universidad_id !== university)
          fail(422, "Elige carreras de la misma institución.");
    } else if (director) {
      d = validate({ carrera_id: int(true) }, b);
      university = (await exists("carreras", d.carrera_id)).universidad_id;
    } else {
      const independent = b.tipo === "independiente";
      d = validate(
        {
          carrera_id: int(!independent),
          codigo: text(30, !independent),
          semestre: int(false, 1, 20),
          fecha_ingreso: date,
        },
        b,
      );
      d.tipo = independent ? "independiente" : "institucional";
      if (independent) d.carrera_id = null;
      else university = (await exists("carreras", d.carrera_id)).universidad_id;
    }
    const result = await tx(async () => {
      const previousProfile = id
        ? await one(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [id])
        : null;
      if (
        university &&
        !(await one(
          "SELECT id FROM universidades WHERE id=? AND deleted_at IS NULL FOR UPDATE",
          [university],
        ))
      )
        fail(422, "La institución ya no está disponible.");
      for (const cid of [
        ...(teacher ? careers : d.carrera_id ? [d.carrera_id] : []),
      ].sort((a, b) => a - b))
        if (
          !(await one(
            "SELECT id FROM carreras WHERE id=? AND deleted_at IS NULL FOR UPDATE",
            [cid],
          ))
        )
          fail(422, "La carrera ya no está disponible.");
      if (teacher && id) {
        const assigned = await query(
          "SELECT DISTINCT carrera_id FROM clases WHERE docente_id=? AND deleted_at IS NULL AND estado<>'finalizada'",
          [id],
        );
        if (assigned.some((c) => !careers.includes(c.carrera_id)))
          fail(
            409,
            "El docente debe conservar las carreras de sus clases asignadas.",
          );
      }
      if (
        !teacher &&
        !director &&
        id &&
        (await val(
          "SELECT 1 FROM inscripciones i JOIN clases k ON k.id=i.clase_id AND k.deleted_at IS NULL WHERE i.estudiante_id=? AND i.estado='inscrito' AND (? IS NULL OR k.carrera_id<>?) LIMIT 1",
          [id, d.carrera_id, d.carrera_id],
        ))
      )
        fail(
          409,
          "Retira o finaliza las inscripciones pendientes antes de trasladar al estudiante de carrera o cambiarlo a independiente.",
        );
      const uid = await saveUser(
        b,
        teacher ? "docente" : director ? "director" : "estudiante",
        university,
        old?.usuario_id,
      );
      if (!teacher && !director && !d.codigo)
        d.codigo = old?.codigo || "LIBRE-" + String(uid).padStart(6, "0");
      const rid = id || (await insert(table, { ...d, usuario_id: uid }));
      if (id) await update(table, id, d);
      if (teacher) {
        await replaceLinks(
          "docente_carrera",
          "docente_id",
          rid,
          "carrera_id",
          careers,
          actor.id,
        );
      }
      // Passwords and credential hashes never enter the audit payload.
      await audit(req, {
        action: id ? "update" : "create",
        entity: table,
        entityId: rid,
        before: previousProfile,
        after: {
          ...d,
          usuario_id: uid,
          carrera_ids: teacher ? careers : undefined,
          nombre: b.nombre,
          apellido: b.apellido,
          email: b.email,
          activo: b.activo,
          password_changed: !!b.password,
        },
      });
      return rid;
    });
    return res.status(id ? 200 : 201).json({ id: result, ok: true });
  }
  if (m === "DELETE" && id) {
    await tx(async () => {
      await one(`SELECT id FROM ${table} WHERE id=? FOR UPDATE`, [id]);
      const old = await exists(table, id);
      await exists("usuarios", old.usuario_id);
      if (
        teacher
          ? await val(
              "SELECT 1 FROM clases WHERE docente_id=? AND deleted_at IS NULL AND estado<>'finalizada' LIMIT 1",
              [id],
            )
          : !director &&
            (await val(
              "SELECT 1 FROM inscripciones i JOIN clases k ON k.id=i.clase_id AND k.deleted_at IS NULL WHERE i.estudiante_id=? AND i.estado='inscrito' LIMIT 1",
              [id],
            ))
      )
        fail(
          409,
          "Retira o finaliza primero las clases o inscripciones pendientes de la cuenta.",
        );
      await query(
        "UPDATE usuarios SET deleted_at=NOW(),deleted_by=?,activo=0,auth_version=auth_version+1 WHERE id=?",
        [actor.id, old.usuario_id],
      );
      await query("DELETE FROM orbit_sessions WHERE user_id=?", [
        old.usuario_id,
      ]);
      await audit(req, {
        action: "archive",
        entity: table,
        entityId: id,
        before: old,
        after: {
          usuario_id: old.usuario_id,
          archived: true,
          deleted_by: actor.id,
          activo: 0,
        },
      });
    });
    return res.json({ ok: true });
  }
  fail(405, "Método no permitido.");
}
