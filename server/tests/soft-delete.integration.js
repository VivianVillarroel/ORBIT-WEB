import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { query, insert, hashPassword, pool } from "../core.js";
import { migrate } from "../scripts/migrate.js";
import { createApp } from "../app.js";

if (!/test/.test(process.env.DB_NAME || ""))
  throw new Error(
    "Integration tests require a dedicated DB_NAME containing test.",
  );

test("business deletions archive rows, retain academic history and revoke access; assignments reactivate in place", async () => {
  await migrate();
  const tag = randomBytes(6).toString("hex");
  const password = `Soft deletion test password ${tag}`;
  const ids = {
    universidades: [],
    carreras: [],
    usuarios: [],
    laboratorios: [],
    libros: [],
    clases: [],
    licencias: [],
    solicitudes: [],
  };
  let server, assetPath;
  const keep = async (table, data) => {
    const id = await insert(table, data);
    ids[table]?.push(id);
    return id;
  };
  try {
    const university = await keep("universidades", { nombre: `Main ${tag}` });
    const orphanUniversity = await keep("universidades", {
      nombre: `Archive ${tag}`,
    });
    const career = await keep("carreras", {
      universidad_id: university,
      nombre: `Main ${tag}`,
    });
    const orphanCareer = await keep("carreras", {
      universidad_id: university,
      nombre: `Archive ${tag}`,
    });
    const hash = await hashPassword(password);
    const account = (role, label = role, institutional = true) =>
      keep("usuarios", {
        nombre: label,
        apellido: tag,
        email: `${label}-${tag}@example.invalid`,
        password_hash: hash,
        rol: role,
        universidad_id: institutional ? university : null,
      });
    const adminId = await account("admin");
    const teacherUser = await account("docente");
    const studentUser = await account("estudiante");
    const independentUser = await account("estudiante", "independent", false);
    const teacherId = await insert("docentes", { usuario_id: teacherUser });
    const studentId = await insert("estudiantes", {
      usuario_id: studentUser,
      tipo: "institucional",
      carrera_id: career,
      codigo: `inst-${tag}`,
    });
    const independentId = await insert("estudiantes", {
      usuario_id: independentUser,
      tipo: "independiente",
      codigo: `free-${tag}`,
    });
    await query(
      "INSERT INTO docente_carrera(docente_id,carrera_id) VALUES(?,?)",
      [teacherId, career],
    );
    const labData = {
      nombre: `Archive lab ${tag}`,
      area: "Salud",
      estado: "publicado",
      catalogo_publico: 1,
      gratis: 1,
    };
    const lab = await keep("laboratorios", labData);
    await query(
      "INSERT INTO laboratorio_carrera(laboratorio_id,carrera_id) VALUES(?,?)",
      [lab, career],
    );
    const fileName = `soft-delete-${tag}.pdf`;
    assetPath = path.resolve("orbit-web/uploads", fileName);
    await mkdir(path.dirname(assetPath), { recursive: true });
    await writeFile(
      assetPath,
      "%PDF-1.7\n% Isolated soft-deletion fixture\n%%EOF\n",
      { flag: "wx" },
    );
    const bookData = {
      titulo: `Archive book ${tag}`,
      estado: "publicado",
      libro_url: `uploads/${fileName}`,
      catalogo_publico: 1,
      gratis: 1,
    };
    const book = await keep("libros", bookData);
    await query("INSERT INTO libro_carrera(libro_id,carrera_id) VALUES(?,?)", [
      book,
      career,
    ]);
    await insert("libro_resultados", {
      estudiante_id: studentId,
      libro_id: book,
      tema: "Historical result",
      puntaje: 70,
    });
    const license = await keep("licencias", {
      universidad_id: university,
      fecha_inicio: "2026-01-01",
      estado: "activa",
    });
    const request = await keep("solicitudes", {
      nombre: `Archive ${tag}`,
      email: `request-${tag}@example.invalid`,
      mensaje: "Isolated fixture request",
    });

    server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function api(client, method, route, body, expected = 200) {
      const headers = {};
      if (client.cookie) headers.Cookie = client.cookie;
      if (client.csrf) headers["X-CSRF-Token"] = client.csrf;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(`${base}/api/${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const cookie = response.headers.get("set-cookie");
      if (cookie) client.cookie = cookie.split(";")[0];
      const data = await response.json();
      assert.equal(
        response.status,
        expected,
        `${method} ${route}: ${JSON.stringify(data)}`,
      );
      if (data.csrf) client.csrf = data.csrf;
      return data;
    }
    async function login(label) {
      const client = {};
      await api(client, "POST", "auth/login", {
        email: `${label}-${tag}@example.invalid`,
        password,
      });
      return client;
    }
    const admin = await login("admin");
    const student = await login("estudiante");
    const independent = await login("independent");
    async function archived(table, id) {
      const rows = await query(
        `SELECT deleted_at,deleted_by FROM ${table} WHERE id=?`,
        [id],
      );
      assert.equal(rows.length, 1, `${table} row must remain in the database`);
      assert.ok(rows[0].deleted_at);
      assert.equal(rows[0].deleted_by, adminId);
    }
    async function hidden(table, id) {
      await api(admin, "GET", `${table}/${id}`, undefined, 404);
      assert.equal(
        (await api(admin, "GET", table)).items.some((row) => row.id === id),
        false,
      );
    }
    async function checkLink(table, where, params, removed) {
      const rows = await query(
        `SELECT deleted_at,deleted_by FROM ${table} WHERE ${where}`,
        params,
      );
      assert.equal(
        rows.length,
        1,
        "assignment must retain its original composite key",
      );
      assert.equal(!!rows[0].deleted_at, removed);
      assert.equal(rows[0].deleted_by, removed ? adminId : null);
    }

    const teacherData = {
      nombre: "docente",
      apellido: tag,
      email: `docente-${tag}@example.invalid`,
      universidad_id: university,
      activo: 1,
    };
    for (const removed of [true, false]) {
      await api(admin, "PUT", `docentes/${teacherId}`, {
        ...teacherData,
        carrera_ids: removed ? [] : [career],
      });
      await checkLink(
        "docente_carrera",
        "docente_id=? AND carrera_id=?",
        [teacherId, career],
        removed,
      );
      await api(admin, "PUT", `laboratorios/${lab}`, {
        ...labData,
        carrera_ids: removed ? [] : [career],
      });
      await checkLink(
        "laboratorio_carrera",
        "laboratorio_id=? AND carrera_id=?",
        [lab, career],
        removed,
      );
      await api(admin, "GET", `laboratorios/${lab}`, undefined, 200);
      await api(
        student,
        "GET",
        `laboratorios/${lab}`,
        undefined,
        removed ? 404 : 200,
      );
      await api(admin, "PUT", `libros/${book}`, {
        ...bookData,
        carrera_ids: removed ? [] : [career],
      });
      await checkLink(
        "libro_carrera",
        "libro_id=? AND carrera_id=?",
        [book, career],
        removed,
      );
    }

    const course = await keep("clases", {
      carrera_id: career,
      docente_id: teacherId,
      nombre: `Archive class ${tag}`,
      periodo: "TEST",
      estado: "activa",
    });
    await api(
      admin,
      "POST",
      `clases/${course}/laboratorios`,
      { laboratorio_id: lab },
      201,
    );
    await api(admin, "DELETE", `clases/${course}/laboratorios/${lab}`);
    await checkLink(
      "clase_laboratorio",
      "clase_id=? AND laboratorio_id=?",
      [course, lab],
      true,
    );
    assert.equal(
      (await api(admin, "GET", `clases/${course}/laboratorios`)).items.length,
      0,
    );
    await api(
      admin,
      "POST",
      `clases/${course}/laboratorios`,
      { laboratorio_id: lab, fecha_limite: "2026-12-31" },
      201,
    );
    await checkLink(
      "clase_laboratorio",
      "clase_id=? AND laboratorio_id=?",
      [course, lab],
      false,
    );
    const enrollment = (
      await api(
        admin,
        "POST",
        `clases/${course}/inscripciones`,
        { estudiante_id: studentId },
        201,
      )
    ).id;
    await api(admin, "PUT", `clases/${course}/inscripciones/${enrollment}`, {
      estado: "aprobado",
      nota_final: 80,
    });
    await api(admin, "DELETE", `clases/${course}/inscripciones/${enrollment}`);
    let [savedEnrollment] = await query(
      "SELECT estado,nota_final FROM inscripciones WHERE id=?",
      [enrollment],
    );
    assert.equal(savedEnrollment.estado, "retirado");
    assert.equal(savedEnrollment.nota_final, 80);
    assert.equal(
      (
        await api(
          admin,
          "POST",
          `clases/${course}/inscripciones`,
          { estudiante_id: studentId },
          201,
        )
      ).id,
      enrollment,
    );
    [savedEnrollment] = await query(
      "SELECT estado,nota_final FROM inscripciones WHERE id=?",
      [enrollment],
    );
    assert.equal(savedEnrollment.estado, "inscrito");
    assert.equal(savedEnrollment.nota_final, 80);
    const historyBeforeArchive = await query(
      "SELECT id FROM notas_historial WHERE inscripcion_id=?",
      [enrollment],
    );
    assert.ok(historyBeforeArchive.length >= 3);
    const practice = await insert("practicas", {
      estudiante_id: studentId,
      laboratorio_id: lab,
      clase_id: course,
      completada: 1,
    });
    const retainedPractice = await insert("practicas", {
      estudiante_id: studentId,
      laboratorio_id: lab,
      clase_id: course,
      completada: 1,
    });
    const certificate = await insert("certificados", {
      inscripcion_id: enrollment,
      codigo: randomBytes(16).toString("hex"),
      estudiante: "Historical student",
      curso: "Historical class",
      carrera: "Historical career",
      institucion: "Historical institution",
      nota: 80,
      emitido_por: adminId,
    });
    await api(admin, "DELETE", `practicas/${practice}`);
    await archived("practicas", practice);
    const practices = (await api(admin, "GET", `practicas?clase_id=${course}`))
      .items;
    assert.equal(
      practices.some((row) => row.id === practice),
      false,
    );
    assert.equal(
      practices.some((row) => row.id === retainedPractice),
      true,
    );
    assert.equal(
      (await api(student, "GET", `laboratorios/${lab}`)).item.mis_practicas,
      1,
    );
    await api(admin, "DELETE", `clases/${course}`);
    await archived("clases", course);
    await hidden("clases", course);
    await api(
      admin,
      "POST",
      `clases/${course}/laboratorios`,
      { laboratorio_id: lab },
      404,
    );
    assert.equal(
      (await query("SELECT id FROM inscripciones WHERE id=?", [enrollment]))
        .length,
      1,
    );
    assert.equal(
      (await query("SELECT id FROM practicas WHERE clase_id=?", [course]))
        .length,
      2,
    );
    assert.equal(
      (await query("SELECT id FROM certificados WHERE id=?", [certificate]))
        .length,
      1,
    );
    assert.equal(
      (
        await query("SELECT id FROM notas_historial WHERE inscripcion_id=?", [
          enrollment,
        ])
      ).length,
      historyBeforeArchive.length,
    );
    const academic = await api(admin, "GET", "academico");
    assert.equal(
      academic.clases.some((row) => row.id === course),
      false,
    );
    assert.equal(
      academic.actividad.some((row) => row.clase_id === course),
      false,
    );

    const fileRequest = () =>
      fetch(`${base}/uploads/${fileName}`, {
        headers: { Cookie: student.cookie },
      });
    assert.equal((await fileRequest()).status, 200);
    for (const [table, id] of [
      ["laboratorios", lab],
      ["libros", book],
      ["licencias", license],
      ["solicitudes", request],
      ["carreras", orphanCareer],
      ["universidades", orphanUniversity],
    ]) {
      await api(admin, "DELETE", `${table}/${id}`);
      await archived(table, id);
      await hidden(table, id);
    }
    assert.equal(
      (
        await query(
          "SELECT id FROM libro_resultados WHERE estudiante_id=? AND libro_id=?",
          [studentId, book],
        )
      ).length,
      1,
    );
    assert.equal(
      (await fileRequest()).status,
      403,
      "an archived book cannot be retrieved through its direct private URL",
    );
    const options = await api(admin, "GET", "opciones");
    assert.equal(
      options.universidades.some((row) => row.id === orphanUniversity),
      false,
    );
    assert.equal(
      options.carreras.some((row) => row.id === orphanCareer),
      false,
    );
    assert.equal(
      options.laboratorios.some((row) => row.id === lab),
      false,
    );

    const [beforeAccount] = await query(
      "SELECT auth_version FROM usuarios WHERE id=?",
      [independentUser],
    );
    await api(admin, "DELETE", `estudiantes/${independentId}`);
    await archived("usuarios", independentUser);
    const [savedAccount] = await query(
      "SELECT activo,auth_version FROM usuarios WHERE id=?",
      [independentUser],
    );
    assert.equal(savedAccount.activo, 0);
    assert.ok(savedAccount.auth_version > beforeAccount.auth_version);
    assert.equal(
      (await query("SELECT id FROM estudiantes WHERE id=?", [independentId]))
        .length,
      1,
    );
    await hidden("estudiantes", independentId);
    await api(independent, "GET", "auth/me", undefined, 401);
    await api(
      {},
      "POST",
      "auth/login",
      { email: `independent-${tag}@example.invalid`, password },
      401,
    );
    assert.equal(
      (
        await query("SELECT sid FROM orbit_sessions WHERE user_id=?", [
          independentUser,
        ])
      ).length,
      0,
    );
    const events = await query(
      "SELECT entity,entity_id,actor_id FROM orbit_audit WHERE actor_id=? AND action='archive'",
      [adminId],
    );
    for (const [entity, id] of [
      ["clases", course],
      ["practicas", practice],
      ["libros", book],
      ["laboratorios", lab],
      ["estudiantes", independentId],
    ])
      assert.ok(
        events.some(
          (event) => event.entity === entity && event.entity_id === id,
        ),
        `archive of ${entity} must be audited`,
      );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    // Physical cleanup belongs only to these fixtures in the dedicated test DB.
    for (const id of ids.clases) {
      await query(
        "DELETE c FROM certificados c JOIN inscripciones i ON i.id=c.inscripcion_id WHERE i.clase_id=?",
        [id],
      );
      await query(
        "DELETE nh FROM notas_historial nh JOIN inscripciones i ON i.id=nh.inscripcion_id WHERE i.clase_id=?",
        [id],
      );
      await query("DELETE FROM clases WHERE id=?", [id]);
    }
    for (const table of [
      "libros",
      "laboratorios",
      "licencias",
      "solicitudes",
      "usuarios",
      "carreras",
      "universidades",
    ])
      for (const id of ids[table])
        await query(`DELETE FROM ${table} WHERE id=?`, [id]);
    if (ids.usuarios.length)
      await query(
        `DELETE FROM orbit_audit WHERE actor_id IN (${ids.usuarios.map(() => "?")})`,
        ids.usuarios,
      );
    if (assetPath) await unlink(assetPath).catch(() => {});
    await pool.end();
  }
});
