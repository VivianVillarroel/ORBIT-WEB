import { requireUser, validate, text, int, query, fail } from "../core.js";

export async function auditLog(req, res, p) {
  requireUser(req, "admin");
  if (p.length !== 1) fail(404, "Ruta no encontrada.");
  if (req.method !== "GET") fail(405, "Método no permitido.");
  const filter = validate(
    {
      action: text(80),
      entity: text(64),
      actor_id: int(),
      before_id: int(false, 1, Number.MAX_SAFE_INTEGER),
      limit: int(false, 1, 100),
    },
    req.query,
    true,
  );
  const params = [],
    clauses = [];
  for (const field of ["action", "entity", "actor_id"]) {
    if (filter[field] != null) {
      clauses.push(`${field}=?`);
      params.push(filter[field]);
    }
  }
  if (filter.before_id != null) {
    clauses.push("id<?");
    params.push(filter.before_id);
  }
  const limit = filter.limit ?? 50;
  params.push(limit);
  const items = await query(
    `SELECT id,actor_id,actor_role,action,entity,entity_id,request_id,data,created_at FROM orbit_audit ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`,
    params,
  );
  return res.json({
    items,
    next_cursor: items.length === limit ? items.at(-1).id : null,
  });
}
