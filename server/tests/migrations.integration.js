import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { migrate } from "../scripts/migrate.js";
import { pool, query, insert } from "../core.js";

if (!/test/.test(process.env.DB_NAME || ""))
  throw new Error(
    "Integration tests require a dedicated DB_NAME containing test.",
  );

test("migrations preserve data across concurrent reruns and database enforces academic/money ranges", async () => {
  let userId, studentId, labId, planId;
  const tag = randomBytes(6).toString("hex");
  try {
    await Promise.all([migrate(), migrate()]);
    userId = await insert("usuarios", {
      nombre: "Migration",
      apellido: tag,
      email: `migration-${tag}@example.invalid`,
      password_hash: "unused-test-hash",
      rol: "estudiante",
    });
    studentId = await insert("estudiantes", {
      usuario_id: userId,
      tipo: "independiente",
      codigo: `mig-${tag}`,
    });
    labId = await insert("laboratorios", { nombre: `Migration ${tag}` });
    planId = await insert("planes", {
      codigo: `mig-${tag}`,
      nombre: "Test",
      precio_mes: 3,
    });
    await query("UPDATE planes SET deleted_at=NOW(),deleted_by=? WHERE id=?", [
      userId,
      planId,
    ]);
    await migrate();
    assert.equal(
      (await query("SELECT precio_mes FROM planes WHERE id=?", [planId]))[0]
        .precio_mes,
      3,
    );
    const [archivedPlan] = await query(
      "SELECT deleted_at,deleted_by FROM planes WHERE id=?",
      [planId],
    );
    assert.ok(
      archivedPlan.deleted_at,
      "rerunning a migration must not reactivate archived data",
    );
    assert.equal(archivedPlan.deleted_by, userId);
    await assert.rejects(
      query("UPDATE planes SET precio_mes=-1 WHERE id=?", [planId]),
      (error) => [3819, 4025].includes(error.errno),
    );
    for (const data of [{ puntaje: 101 }, { completada: 2 }])
      await assert.rejects(
        insert("practicas", {
          estudiante_id: studentId,
          laboratorio_id: labId,
          ...data,
        }),
        (error) => [3819, 4025].includes(error.errno),
      );
    const applied = await query(
      "SELECT version FROM orbit_schema_migrations WHERE version='20261105_integrity_audit'",
    );
    assert.equal(applied.length, 1);
    const [archiveColumns] = await query(
      "SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('universidades','carreras','usuarios','clases','laboratorios','libros','licencias','planes','solicitudes','practicas','docente_carrera','laboratorio_carrera','libro_carrera','clase_laboratorio') AND COLUMN_NAME IN ('deleted_at','deleted_by')",
    );
    assert.equal(Number(archiveColumns.total), 28);
    assert.equal(
      (
        await query(
          "SELECT version FROM orbit_schema_migrations WHERE version='20261105_soft_delete'",
        )
      ).length,
      1,
    );
    const [progress] = await query(
      "SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_list FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='practicas' AND INDEX_NAME='ix_practicas_progreso'",
    );
    assert.equal(
      progress.columns_list,
      "clase_id,estudiante_id,laboratorio_id,completada",
    );
    const [auditForeignKeys] = await query(
      "SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='orbit_audit' AND CONSTRAINT_TYPE='FOREIGN KEY'",
    );
    assert.equal(
      Number(auditForeignKeys.total),
      0,
      "audit events must survive actor/resource deletion",
    );
  } finally {
    if (userId) await query("DELETE FROM usuarios WHERE id=?", [userId]);
    if (labId) await query("DELETE FROM laboratorios WHERE id=?", [labId]);
    if (planId) await query("DELETE FROM planes WHERE id=?", [planId]);
    await pool.end();
  }
});
