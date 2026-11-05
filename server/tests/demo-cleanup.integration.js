import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  archiveDemoLabs,
  previewDemoLabs,
} from "../scripts/archive-demo-labs.js";
import { contentList } from "../routes/content.js";
import { insert, one, pool, query, tx } from "../core.js";
import { migrate } from "../scripts/migrate.js";

if (!/test/.test(process.env.DB_NAME || ""))
  throw new Error(
    "Demo cleanup integration requires a dedicated test database.",
  );

test("demo cleanup archives only explicit labs and assignments while retaining academic history, audit and retry safety", async () => {
  await migrate();
  const tag = randomBytes(6).toString("hex");
  let university,
    career,
    admin,
    studentUser,
    nonAdmin,
    student,
    course,
    enrollment,
    practice,
    certificate,
    note,
    book;
  const labs = [];
  try {
    university = await insert("universidades", { nombre: `Cleanup ${tag}` });
    career = await insert("carreras", {
      universidad_id: university,
      nombre: `Cleanup ${tag}`,
    });
    for (const role of ["admin", "estudiante", "docente"]) {
      const id = await insert("usuarios", {
        nombre: role,
        apellido: tag,
        email: `${role}-cleanup-${tag}@example.invalid`,
        password_hash: "Unused internal fixture hash",
        rol: role,
        universidad_id: university,
      });
      if (role === "admin") admin = id;
      else if (role === "estudiante") studentUser = id;
      else nonAdmin = id;
    }
    student = await insert("estudiantes", {
      usuario_id: studentUser,
      carrera_id: career,
      tipo: "institucional",
      codigo: `cleanup-${tag}`,
    });
    course = await insert("clases", {
      carrera_id: career,
      nombre: `Cleanup ${tag}`,
      periodo: "TEST",
      estado: "activa",
    });
    for (const name of ["demo 1", "demo 2", "new lab"]) {
      const lab = await insert("laboratorios", {
        nombre: `${name} ${tag}`,
        estado: "publicado",
        catalogo_publico: 1,
        gratis: 1,
      });
      labs.push(lab);
      await query(
        "INSERT INTO laboratorio_carrera(laboratorio_id,carrera_id) VALUES(?,?)",
        [lab, career],
      );
      await query(
        "INSERT INTO clase_laboratorio(clase_id,laboratorio_id,fecha_limite) VALUES(?,?,?)",
        [course, lab, "2026-12-01"],
      );
    }
    enrollment = await insert("inscripciones", {
      clase_id: course,
      estudiante_id: student,
      estado: "aprobado",
      nota_final: 86,
    });
    practice = await insert("practicas", {
      estudiante_id: student,
      laboratorio_id: labs[0],
      clase_id: course,
      completada: 1,
      duracion_min: 7,
    });
    note = await insert("notas_historial", {
      inscripcion_id: enrollment,
      actor_id: admin,
      anterior: JSON.stringify({ nota_final: null }),
      nueva: JSON.stringify({ nota_final: 86 }),
    });
    certificate = await insert("certificados", {
      inscripcion_id: enrollment,
      codigo: randomBytes(16).toString("hex"),
      estudiante: `Student ${tag}`,
      curso: `Cleanup ${tag}`,
      carrera: `Cleanup ${tag}`,
      institucion: `Cleanup ${tag}`,
      nota: 86,
      emitido_por: admin,
    });
    book = await insert("libros", {
      titulo: `Book stays ${tag}`,
      estado: "publicado",
    });
    const snapshots = {};
    for (const [table, id] of [
      ["inscripciones", enrollment],
      ["practicas", practice],
      ["notas_historial", note],
      ["certificados", certificate],
      ["clases", course],
      ["libros", book],
    ])
      snapshots[table] = await one(`SELECT * FROM ${table} WHERE id=?`, [id]);
    const selection = labs.slice(0, 2);
    const preview = await previewDemoLabs(selection);
    assert.equal(preview.length, 2);
    assert.ok(
      preview.every(
        (row) => row.asignaciones_activas === 1 && row.deleted_at === null,
      ),
    );
    await assert.rejects(
      archiveDemoLabs({ actorId: nonAdmin, labIds: selection }),
      (error) => error.status === 403,
    );
    await assert.rejects(
      archiveDemoLabs({ actorId: admin, labIds: [] }),
      (error) => error.status === 422,
    );
    await assert.rejects(
      archiveDemoLabs({ actorId: admin, labIds: [labs[0], 2147483647] }),
      (error) => error.status === 404,
    );
    assert.equal(
      (await one("SELECT deleted_at FROM laboratorios WHERE id=?", [labs[0]]))
        .deleted_at,
      null,
    );
    await assert.rejects(
      tx(async () => {
        await archiveDemoLabs({ actorId: admin, labIds: selection });
        throw new Error("Injected transaction failure");
      }),
      /Injected transaction failure/,
    );
    assert.equal(
      (await one("SELECT deleted_at FROM laboratorios WHERE id=?", [labs[0]]))
        .deleted_at,
      null,
    );
    assert.equal(
      (await query("SELECT id FROM orbit_audit WHERE actor_id=?", [admin]))
        .length,
      0,
    );
    const result = await archiveDemoLabs({ actorId: admin, labIds: selection });
    assert.equal(result.archived_labs, 2);
    assert.equal(result.archived_assignments, 2);
    assert.deepEqual(result.lab_ids, selection);
    assert.match(result.request_id, /^[a-f0-9]{24}$/);
    for (const id of selection) {
      const archived = await one(
        "SELECT deleted_at,deleted_by FROM laboratorios WHERE id=?",
        [id],
      );
      assert.ok(archived.deleted_at);
      assert.equal(archived.deleted_by, admin);
      const assignment = await one(
        "SELECT * FROM clase_laboratorio WHERE clase_id=? AND laboratorio_id=?",
        [course, id],
      );
      assert.ok(assignment.deleted_at);
      assert.equal(assignment.deleted_by, admin);
      assert.equal(assignment.fecha_limite, "2026-12-01");
    }
    assert.equal(
      (await one("SELECT deleted_at FROM laboratorios WHERE id=?", [labs[2]]))
        .deleted_at,
      null,
    );
    assert.equal(
      (
        await one(
          "SELECT deleted_at FROM clase_laboratorio WHERE clase_id=? AND laboratorio_id=?",
          [course, labs[2]],
        )
      ).deleted_at,
      null,
    );
    for (const [table, id] of [
      ["inscripciones", enrollment],
      ["practicas", practice],
      ["notas_historial", note],
      ["certificados", certificate],
      ["clases", course],
      ["libros", book],
    ])
      assert.deepEqual(
        await one(`SELECT * FROM ${table} WHERE id=?`, [id]),
        snapshots[table],
        `${table} must remain intact`,
      );
    const visible = await contentList("laboratorios", { rol: "admin" });
    assert.ok(!visible.some((row) => selection.includes(row.id)));
    assert.ok(visible.some((row) => row.id === labs[2]));
    const events = await query(
      "SELECT * FROM orbit_audit WHERE actor_id=? ORDER BY id",
      [admin],
    );
    assert.equal(events.length, 4);
    assert.ok(
      events.every(
        (row) =>
          row.action === "archive" &&
          row.request_id === result.request_id &&
          (typeof row.data === "string" ? JSON.parse(row.data) : row.data)
            .details.reason === "demo_cleanup",
      ),
    );
    const repeat = await archiveDemoLabs({ actorId: admin, labIds: selection });
    assert.equal(repeat.archived_labs, 0);
    assert.equal(repeat.archived_assignments, 0);
    assert.equal(
      (await query("SELECT id FROM orbit_audit WHERE actor_id=?", [admin]))
        .length,
      4,
    );
  } finally {
    // Physical deletion is limited to this test's own generated fixture IDs.
    if (certificate)
      await query("DELETE FROM certificados WHERE id=?", [certificate]);
    if (note) await query("DELETE FROM notas_historial WHERE id=?", [note]);
    if (course) await query("DELETE FROM clases WHERE id=?", [course]);
    for (const id of labs)
      await query("DELETE FROM laboratorios WHERE id=?", [id]);
    if (book) await query("DELETE FROM libros WHERE id=?", [book]);
    for (const id of [studentUser, nonAdmin, admin].filter(Boolean))
      await query("DELETE FROM usuarios WHERE id=?", [id]);
    if (admin) await query("DELETE FROM orbit_audit WHERE actor_id=?", [admin]);
    if (career) await query("DELETE FROM carreras WHERE id=?", [career]);
    if (university)
      await query("DELETE FROM universidades WHERE id=?", [university]);
    await pool.end();
  }
});
