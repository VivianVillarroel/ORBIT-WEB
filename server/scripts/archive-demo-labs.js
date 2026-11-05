import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { audit, fail, one, pool, positiveId, query, tx } from "../core.js";
import { createBackup } from "./backup.js";

function selectedIds(values) {
  if (!Array.isArray(values) || !values.length || values.length > 1000)
    fail(422, "Indica entre 1 y 1000 identificadores de laboratorio.");
  return [...new Set(values.map(positiveId))].sort((a, b) => a - b);
}

const placeholders = (values) => values.map(() => "?").join(",");

export async function previewDemoLabs(labIds) {
  const selected = selectedIds(labIds);
  const labs = await query(
    `SELECT l.id,l.nombre,l.estado,l.deleted_at,(SELECT COUNT(*) FROM clase_laboratorio cl WHERE cl.laboratorio_id=l.id AND cl.deleted_at IS NULL) AS asignaciones_activas FROM laboratorios l WHERE l.id IN (${placeholders(selected)}) ORDER BY l.id`,
    selected,
  );
  if (labs.length !== selected.length)
    fail(
      404,
      "Algún laboratorio seleccionado no existe. No se aplicó la baja.",
    );
  return labs;
}

export async function archiveDemoLabs({ actorId, labIds }) {
  const actor = positiveId(actorId);
  const selected = selectedIds(labIds);
  const marks = placeholders(selected);
  // Discover classes first, then always lock classes before labs, matching the
  // application routes. A concurrent new assignment requires a fresh attempt;
  // never acquire a previously unknown class lock while holding its lab lock.
  for (let attempt = 0; attempt < 3; attempt++) {
    const classes = await query(
      `SELECT DISTINCT clase_id FROM clase_laboratorio WHERE laboratorio_id IN (${marks}) AND deleted_at IS NULL ORDER BY clase_id`,
      selected,
    );
    const lockedClasses = new Set(classes.map((row) => row.clase_id));
    try {
      return await tx(async () => {
        const user = await one(
          "SELECT id,rol,activo,deleted_at FROM usuarios WHERE id=? FOR UPDATE",
          [actor],
        );
        if (!user || user.rol !== "admin" || !user.activo || user.deleted_at)
          fail(403, "La baja requiere un administrador activo.");
        for (const course of classes)
          await one("SELECT id FROM clases WHERE id=? FOR UPDATE", [
            course.clase_id,
          ]);
        const labs = [];
        for (const id of selected) {
          const lab = await one(
            "SELECT * FROM laboratorios WHERE id=? FOR UPDATE",
            [id],
          );
          if (!lab)
            fail(
              404,
              "Algún laboratorio seleccionado no existe. No se aplicó la baja.",
            );
          labs.push(lab);
        }
        const assignments = await query(
          `SELECT * FROM clase_laboratorio WHERE laboratorio_id IN (${marks}) AND deleted_at IS NULL ORDER BY clase_id,laboratorio_id FOR UPDATE`,
          selected,
        );
        if (assignments.some((row) => !lockedClasses.has(row.clase_id))) {
          const error = new Error("Assignment set changed");
          error.retryArchive = true;
          throw error;
        }
        const request = { id: randomBytes(12).toString("hex"), user };
        for (const before of assignments) {
          await query(
            "UPDATE clase_laboratorio SET deleted_at=NOW(),deleted_by=? WHERE clase_id=? AND laboratorio_id=? AND deleted_at IS NULL",
            [actor, before.clase_id, before.laboratorio_id],
          );
          const after = await one(
            "SELECT * FROM clase_laboratorio WHERE clase_id=? AND laboratorio_id=?",
            [before.clase_id, before.laboratorio_id],
          );
          await audit(request, {
            action: "archive",
            entity: "clase_laboratorio",
            entityId: before.clase_id,
            before,
            after,
            details: {
              reason: "demo_cleanup",
              laboratorio_id: before.laboratorio_id,
            },
          });
        }
        const activeLabs = labs.filter((lab) => !lab.deleted_at);
        for (const before of activeLabs) {
          await query(
            "UPDATE laboratorios SET deleted_at=NOW(),deleted_by=? WHERE id=? AND deleted_at IS NULL",
            [actor, before.id],
          );
          const after = await one("SELECT * FROM laboratorios WHERE id=?", [
            before.id,
          ]);
          await audit(request, {
            action: "archive",
            entity: "laboratorios",
            entityId: before.id,
            before,
            after,
            details: { reason: "demo_cleanup" },
          });
        }
        return {
          archived_labs: activeLabs.length,
          archived_assignments: assignments.length,
          lab_ids: activeLabs.map((lab) => lab.id),
          request_id: request.id,
        };
      });
    } catch (error) {
      if (!error.retryArchive) throw error;
    }
  }
  fail(
    409,
    "Las asignaciones están cambiando. Vuelve a ejecutar la baja al terminar.",
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Uso: node --env-file=.env server/scripts/archive-demo-labs.js --ids=1,2,3 [--actor-id=1] [--apply]",
    );
    console.log(
      "Sin --apply sólo lista los registros. Con --apply crea primero un respaldo privado y aplica baja lógica auditada. Ejecuta db:migrate previamente.",
    );
    return;
  }
  if (
    args.some(
      (arg) => arg !== "--apply" && !/^--(?:ids|actor-id)=.+$/.test(arg),
    )
  )
    fail(422, "Argumentos no válidos. Consulta --help.");
  for (const name of ["ids", "actor-id"])
    if (args.filter((arg) => arg.startsWith(`--${name}=`)).length > 1)
      fail(422, "No repitas argumentos de selección.");
  const selection = args.find((arg) => arg.startsWith("--ids="));
  if (!selection)
    fail(422, "Indica los identificadores explícitos con --ids=1,2,3.");
  const labIds = selectedIds(selection.slice(6).split(","));
  const actorArgument = args.find((arg) => arg.startsWith("--actor-id="));
  const actorId = actorArgument
    ? positiveId(actorArgument.slice(11))
    : (
        await one(
          "SELECT id FROM usuarios WHERE email=? AND rol='admin' AND activo=1 AND deleted_at IS NULL",
          [process.env.ORBIT_ADMIN_EMAIL?.trim().toLowerCase() || ""],
        )
      )?.id;
  if (!actorId)
    fail(
      422,
      "Configura ORBIT_ADMIN_EMAIL o indica --actor-id para el administrador responsable.",
    );
  const administrator = await one(
    "SELECT id FROM usuarios WHERE id=? AND rol='admin' AND activo=1 AND deleted_at IS NULL",
    [actorId],
  );
  if (!administrator) fail(403, "La baja requiere un administrador activo.");
  const labs = await previewDemoLabs(labIds);
  console.log(
    JSON.stringify({
      mode: args.includes("--apply") ? "apply" : "preview",
      actor_id: actorId,
      labs,
    }),
  );
  if (!args.includes("--apply")) return;
  const backup = await createBackup();
  console.log(JSON.stringify({ backup }));
  console.log(JSON.stringify(await archiveDemoLabs({ actorId, labIds })));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch (error) {
    console.error(
      error.status
        ? error.message
        : "No se pudo completar la baja de laboratorios. Consulta la configuración y el estado de MySQL.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
