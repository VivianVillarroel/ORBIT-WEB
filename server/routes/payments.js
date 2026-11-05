import {
  query,
  one,
  val,
  insert,
  requireUser,
  positiveId,
  validate,
  int,
  enumeration,
  text,
  fail,
  premium,
  tx,
  audit,
  safeURL,
} from "../core.js";
import { safeContent } from "./content.js";
export function paymentConfiguration() {
  const clean = (name, max) => {
    const value = process.env[name]?.trim() || "";
    return value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
      ? value
      : "";
  };
  const holder = clean("PAYMENT_HOLDER", 160),
    bank = clean("PAYMENT_BANK", 160),
    account = clean("PAYMENT_ACCOUNT", 100),
    qr = clean("PAYMENT_QR_URL", 500),
    qr_url =
      qr && safeURL(qr) && (/^https:\/\//.test(qr) || /^img\//.test(qr))
        ? qr
        : null,
    methods = [];
  if (process.env.PAYMENT_ENABLED !== "true" || !holder)
    return { enabled: false, methods };
  if (qr_url) methods.push("qr");
  if (bank && account) methods.push("transferencia");
  return methods.length
    ? { enabled: true, holder, bank, account, qr_url, methods }
    : { enabled: false, methods };
}
export async function catalog(req, res, p) {
  if (req.method !== "GET" || p.length !== 1) fail(405, "Método no permitido.");
  return res.json({
    laboratorios: (
      await query(
        "SELECT id,nombre,area,equipo,descripcion,imagen_url,gratis,vr_disponible FROM laboratorios WHERE deleted_at IS NULL AND estado='publicado' AND catalogo_publico=1 ORDER BY gratis DESC,nombre",
      )
    ).map(safeContent),
    libros: (
      await query(
        "SELECT id,titulo,autor,materia,descripcion,portada_url,gratis FROM libros WHERE deleted_at IS NULL AND estado='publicado' AND catalogo_publico=1 ORDER BY gratis DESC,titulo",
      )
    ).map(safeContent),
    planes: await query(
      "SELECT codigo,nombre,precio_mes,descripcion FROM planes WHERE activo=1 AND deleted_at IS NULL ORDER BY precio_mes",
    ),
  });
}
export async function subscription(req, res, p) {
  const u = requireUser(req, "estudiante");
  if (u.tipo_estudiante !== "independiente")
    fail(403, "Tu acceso lo da tu institución.");
  if (req.method === "GET" && p.length === 1)
    return res.json({
      payment: paymentConfiguration(),
      planes: await query(
        "SELECT id,codigo,nombre,precio_mes,descripcion FROM planes WHERE activo=1 AND deleted_at IS NULL ORDER BY precio_mes",
      ),
      actual: await premium(u.id),
      pendiente: await one(
        "SELECT * FROM pagos WHERE usuario_id=? AND estado='pendiente' ORDER BY id DESC LIMIT 1",
        [u.id],
      ),
      pagos: await query(
        "SELECT id,monto,meses,metodo,referencia,estado,creado_en,revisado_en FROM pagos WHERE usuario_id=? ORDER BY creado_en DESC",
        [u.id],
      ),
    });
  if (req.method === "POST" && p.length === 2 && p[1] === "pago") {
    const configuration = paymentConfiguration();
    if (!configuration.enabled)
      fail(503, "Los pagos todavía no están habilitados. Contacta a ORBIT.");
    const d = validate(
      {
        metodo: enumeration(["qr", "transferencia"], true),
        referencia: text(80, true),
        meses: int(true, 1, 12),
      },
      req.body,
    );
    if (!configuration.methods.includes(d.metodo))
      fail(422, "Este método de pago no está disponible.");
    const id = await tx(async () => {
      if (
        !(await one(
          "SELECT id FROM usuarios WHERE id=? AND deleted_at IS NULL FOR UPDATE",
          [u.id],
        ))
      )
        fail(401, "La cuenta ya no está disponible.");
      if (
        await val(
          "SELECT id FROM pagos WHERE usuario_id=? AND estado='pendiente'",
          [u.id],
        )
      )
        fail(409, "Ya tienes un pago en revisión.");
      const plan = await one(
        "SELECT id,precio_mes FROM planes WHERE codigo='premium' AND activo=1 AND deleted_at IS NULL",
      );
      if (!plan) fail(409, "Plan no disponible.");
      const sub = await premium(u.id);
      const sid =
        sub?.id ||
        (await val(
          "SELECT id FROM suscripciones WHERE usuario_id=? AND estado='pendiente' ORDER BY id DESC LIMIT 1",
          [u.id],
        )) ||
        (await insert("suscripciones", {
          usuario_id: u.id,
          plan_id: plan.id,
          estado: "pendiente",
        }));
      const next = {
        ...d,
        usuario_id: u.id,
        suscripcion_id: sid,
        monto: Math.round(plan.precio_mes * d.meses * 100) / 100,
      };
      const id = await insert("pagos", next);
      await audit(req, {
        action: "create",
        entity: "pagos",
        entityId: id,
        after: next,
      });
      return id;
    });
    return res.status(201).json({ id });
  }
  fail(405, "Método no permitido.");
}
export async function payments(req, res, p) {
  const u = requireUser(req, "admin"),
    id = p[1] ? positiveId(p[1]) : null;
  if (p.length > 2) fail(404, "Ruta no encontrada.");
  if (req.method === "GET" && !id) {
    const params = [];
    let q = `SELECT pg.*,CONCAT(u.nombre,' ',u.apellido) AS estudiante,u.email,s.estado AS suscripcion_estado,s.fecha_fin,CONCAT(r.nombre,' ',r.apellido) AS revisor FROM pagos pg JOIN usuarios u ON u.id=pg.usuario_id JOIN suscripciones s ON s.id=pg.suscripcion_id LEFT JOIN usuarios r ON r.id=pg.revisado_por WHERE 1=1`;
    if (req.query.estado) {
      q += " AND pg.estado=?";
      params.push(req.query.estado);
    }
    return res.json({
      items: await query(q + " ORDER BY pg.creado_en DESC", params),
    });
  }
  if (req.method === "PUT" && id) {
    const d = validate(
      { accion: enumeration(["confirmar", "rechazar"], true) },
      req.body,
    );
    await tx(async () => {
      const pg = await one("SELECT * FROM pagos WHERE id=? FOR UPDATE", [id]);
      if (!pg) fail(404, "Pago no encontrado.");
      if (
        d.accion === "confirmar" &&
        !(await one(
          "SELECT id FROM usuarios WHERE id=? AND deleted_at IS NULL FOR UPDATE",
          [pg.usuario_id],
        ))
      )
        fail(
          409,
          "No se puede activar una suscripción de una cuenta dada de baja.",
        );
      if (pg.estado !== "pendiente") fail(409, "Este pago ya fue revisado.");
      const s = await one(
        "SELECT *,fecha_fin>=CURDATE() AS prorrogable FROM suscripciones WHERE id=? FOR UPDATE",
        [pg.suscripcion_id],
      );
      if (!s || s.usuario_id !== pg.usuario_id)
        fail(409, "El pago y la suscripción no pertenecen a la misma cuenta.");
      if (d.accion === "confirmar") {
        // A prepaid future period may be extended without moving its start
        // date to today. Actual access is checked separately by premium().
        if (s.estado === "activa" && s.prorrogable)
          await query(
            "UPDATE suscripciones SET fecha_fin=DATE_ADD(fecha_fin,INTERVAL ? MONTH) WHERE id=?",
            [pg.meses, s.id],
          );
        else
          await query(
            "UPDATE suscripciones SET estado='activa',fecha_inicio=CURDATE(),fecha_fin=DATE_ADD(CURDATE(),INTERVAL ? MONTH) WHERE id=?",
            [pg.meses, s.id],
          );
      } else if (s.estado === "pendiente")
        await query("UPDATE suscripciones SET estado='cancelada' WHERE id=?", [
          s.id,
        ]);
      await query(
        "UPDATE pagos SET estado=?,revisado_por=?,revisado_en=NOW() WHERE id=?",
        [d.accion === "confirmar" ? "confirmado" : "rechazado", u.id, id],
      );
      await audit(req, {
        action: d.accion,
        entity: "pagos",
        entityId: id,
        before: pg,
        after: {
          ...pg,
          estado: d.accion === "confirmar" ? "confirmado" : "rechazado",
          revisado_por: u.id,
        },
      });
    });
    return res.json({ ok: true });
  }
  fail(405, "Método no permitido.");
}
