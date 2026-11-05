import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { query, insert, hashPassword, pool } from "../core.js";
import { migrate } from "../scripts/migrate.js";
import { createApp } from "../app.js";

if (!/test/.test(process.env.DB_NAME || ""))
  throw new Error(
    "Integration tests require a dedicated DB_NAME containing test.",
  );

test("academic mutations retain history, enforce grade consistency and audit administrative changes", async () => {
  await migrate();
  const tag = randomBytes(6).toString("hex"),
    password = "Route regression password " + tag,
    users = [],
    careers = [],
    classes = [],
    labs = [];
  let university, server;
  let application;
  const previousUnity = process.env.UNITY_WEBGL_ENABLED;
  process.env.UNITY_WEBGL_ENABLED = "false";
  try {
    university = await insert("universidades", {
      nombre: tag,
      tipo: "universidad",
      pais: "Bolivia",
    });
    for (const nombre of ["Principal", "Secundaria"])
      careers.push(
        await insert("carreras", {
          universidad_id: university,
          nombre: nombre + tag,
          area: "Salud",
        }),
      );
    const hash = await hashPassword(password);
    async function account(role, label = role) {
      const id = await insert("usuarios", {
        nombre: role,
        apellido: tag,
        email: `${label}-${tag}@example.invalid`,
        password_hash: hash,
        rol: role,
        universidad_id: university,
      });
      users.push(id);
      return id;
    }
    const adminId = await account("admin"),
      teacherUser = await account("docente"),
      studentUser = await account("estudiante");
    const teacherId = await insert("docentes", { usuario_id: teacherUser });
    await query(
      "INSERT INTO docente_carrera(docente_id,carrera_id) VALUES(?,?),(?,?)",
      [teacherId, careers[0], teacherId, careers[1]],
    );
    const studentId = await insert("estudiantes", {
      usuario_id: studentUser,
      carrera_id: careers[0],
      tipo: "institucional",
      codigo: tag,
    });
    const labId = await insert("laboratorios", {
      nombre: "Lab " + tag,
      area: "Salud",
      estado: "publicado",
      modelo_url: "simuladores/m2/index.html",
      imagen_url: "javascript:alert(1)",
      catalogo_publico: 1,
      gratis: 1,
    });
    labs.push(labId);
    await query(
      "INSERT INTO laboratorio_carrera(laboratorio_id,carrera_id) VALUES(?,?)",
      [labId, careers[0]],
    );
    application = createApp();
    server = application.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port;
    async function api(client, method, route, body, expected = 200) {
      const headers = {
        Cookie: client.cookie || "",
        "X-CSRF-Token": client.csrf || "",
      };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(base + "/api/" + route, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get("set-cookie"))
        client.cookie = response.headers.get("set-cookie").split(";")[0];
      const data = await response.json();
      assert.equal(
        response.status,
        expected,
        method + " " + route + ": " + JSON.stringify(data),
      );
      if (data.csrf) client.csrf = data.csrf;
      return data;
    }
    async function login(role) {
      const client = {};
      await api(client, "POST", "auth/login", {
        email: `${role}-${tag}@example.invalid`,
        password,
      });
      return client;
    }
    const admin = await login("admin"),
      teacher = await login("docente"),
      student = await login("estudiante");
    await api(student, "GET", "auditoria", undefined, 403);
    await api(teacher, "GET", "auditoria", undefined, 403);
    const courseData = {
      carrera_id: careers[0],
      nombre: "Clase " + tag,
      periodo: "TEST",
      estado: "activa",
      cupo: 10,
    };
    const course = (await api(teacher, "POST", "clases", courseData, 201)).id;
    classes.push(course);
    const enrollment = (
      await api(
        teacher,
        "POST",
        `clases/${course}/inscripciones`,
        { estudiante_id: studentId },
        201,
      )
    ).id;
    const movedStudent = {
      nombre: "estudiante",
      apellido: tag,
      email: `estudiante-${tag}@example.invalid`,
      codigo: tag,
      tipo: "institucional",
      carrera_id: careers[1],
      activo: true,
    };
    await api(admin, "PUT", "estudiantes/" + studentId, movedStudent, 409);
    await api(
      admin,
      "PUT",
      "estudiantes/" + studentId,
      { ...movedStudent, tipo: "independiente", carrera_id: null },
      409,
    );
    const otherStudent = await insert("estudiantes", {
      usuario_id: await account("estudiante", "otra"),
      carrera_id: careers[1],
      tipo: "institucional",
      codigo: tag + "-other",
    });
    await api(
      teacher,
      "POST",
      `clases/${course}/inscripciones`,
      { estudiante_id: otherStudent },
      422,
    );
    await api(
      teacher,
      "POST",
      `clases/${course}/laboratorios`,
      { laboratorio_id: labId },
      201,
    );
    assert.equal(
      (await api(student, "GET", "laboratorios/" + labId)).item
        .unity_disponible,
      false,
    );
    assert.equal(
      (await api(student, "GET", "laboratorios/" + labId)).item.imagen_url,
      null,
    );
    assert.equal(
      (await api(student, "GET", `clases/${course}/laboratorios`)).items[0]
        .imagen_url,
      null,
    );
    assert.equal(
      (await api({}, "GET", "catalogo")).laboratorios.find(
        (lab) => lab.id === labId,
      ).imagen_url,
      null,
    );
    await api(
      student,
      "POST",
      "practicas",
      { laboratorio_id: labId, clase_id: course, completada: true },
      409,
    );
    await api(
      teacher,
      "POST",
      "practicas",
      { laboratorio_id: labId, clase_id: course, completada: true },
      403,
    );
    assert.equal(
      (
        await query(
          "SELECT COUNT(*) AS n FROM practicas WHERE laboratorio_id=?",
          [labId],
        )
      )[0].n,
      0,
    );
    await api(
      student,
      "PUT",
      `clases/${course}/inscripciones/${enrollment}`,
      { nota_final: 100 },
      403,
    );
    await api(
      teacher,
      "PUT",
      `clases/${course}/inscripciones/${enrollment}`,
      { estado: "aprobado" },
      422,
    );
    await api(
      teacher,
      "PUT",
      `clases/${course}/inscripciones/${enrollment}`,
      { estado: "aprobado", nota_final: 50 },
      422,
    );
    await api(
      teacher,
      "PUT",
      `clases/${course}/inscripciones/${enrollment}`,
      { estado: "reprobado", nota_final: 80 },
      422,
    );
    await api(
      teacher,
      "PUT",
      `clases/${course}/inscripciones/${enrollment}`,
      { estado: "reprobado", nota_final: 50.999 },
      422,
    );
    await api(
      teacher,
      "PUT",
      `clases/${course}/inscripciones/${enrollment}`,
      {},
      422,
    );
    await api(teacher, "PUT", `clases/${course}/inscripciones/${enrollment}`, {
      estado: "aprobado",
      nota_final: 80,
    });
    await api(
      teacher,
      "DELETE",
      `clases/${course}/inscripciones/${enrollment}`,
    );
    let row = (
      await query("SELECT * FROM inscripciones WHERE id=?", [enrollment])
    )[0];
    assert.equal(row.estado, "retirado");
    assert.equal(row.nota_final, 80);
    const reenrollment = await api(
      teacher,
      "POST",
      `clases/${course}/inscripciones`,
      { estudiante_id: studentId },
      201,
    );
    assert.equal(reenrollment.id, enrollment);
    row = (
      await query("SELECT * FROM inscripciones WHERE id=?", [enrollment])
    )[0];
    assert.equal(row.estado, "inscrito");
    assert.equal(row.nota_final, 80);
    const history = await query(
      "SELECT * FROM notas_historial WHERE inscripcion_id=? ORDER BY id",
      [enrollment],
    );
    assert.equal(history.length, 3);
    assert.equal(
      (typeof history[2].anterior === "string"
        ? JSON.parse(history[2].anterior)
        : history[2].anterior
      ).nota_final,
      80,
    );
    await api(teacher, "GET", "clases/" + course);
    await api(
      teacher,
      "PUT",
      "clases/" + course,
      { ...courseData, carrera_id: careers[1] },
      409,
    );
    await api(admin, "DELETE", "estudiantes/" + studentId, undefined, 409);
    await api(admin, "DELETE", "docentes/" + teacherId, undefined, 409);
    await api(admin, "DELETE", "laboratorios/" + labId, undefined, 409);
    await api(
      admin,
      "PUT",
      "docentes/" + teacherId,
      {
        nombre: "docente",
        apellido: tag,
        email: `docente-${tag}@example.invalid`,
        universidad_id: university,
        carrera_ids: [careers[1]],
        activo: true,
      },
      409,
    );
    await api(teacher, "PUT", "clases/" + course, {
      ...courseData,
      estado: "finalizada",
    });
    const audit = await query(
      "SELECT * FROM orbit_audit WHERE actor_id IN (?,?,?)",
      [adminId, teacherUser, studentUser],
    );
    assert.ok(
      audit.length >= 7,
      "successful academic mutations must be audited",
    );
    assert.equal(JSON.stringify(audit).includes(password), false);
    assert.equal(JSON.stringify(audit).includes(hash), false);
    const page = await api(
      admin,
      "GET",
      "auditoria?entity=inscripciones&limit=2",
    );
    assert.equal(page.items.length, 2);
    assert.ok(page.next_cursor);
    const nextPage = await api(
      admin,
      "GET",
      `auditoria?entity=inscripciones&limit=2&before_id=${page.next_cursor}`,
    );
    assert.ok(nextPage.items.every((item) => item.id < page.next_cursor));
    await api(admin, "GET", "auditoria?limit=101", undefined, 422);
    application.locals.auditWriter = async () => {
      throw new Error("Injected audit sink failure");
    };
    try {
      await api(
        teacher,
        "PUT",
        "clases/" + course,
        { ...courseData, estado: "finalizada", nombre: "Must roll back" },
        500,
      );
      assert.equal(
        (await query("SELECT nombre FROM clases WHERE id=?", [course]))[0]
          .nombre,
        courseData.nombre,
        "business writes must roll back when audit persistence fails",
      );
    } finally {
      delete application.locals.auditWriter;
    }
    await api(teacher, "PUT", `clases/${course}/inscripciones/${enrollment}`, {
      estado: "aprobado",
      nota_final: 80,
    });
    await api(admin, "PUT", "estudiantes/" + studentId, movedStudent);
    await api(admin, "PUT", "estudiantes/" + studentId, {
      ...movedStudent,
      tipo: "independiente",
      carrera_id: null,
    });
    assert.equal(
      (
        await query("SELECT estado FROM inscripciones WHERE id=?", [enrollment])
      )[0].estado,
      "aprobado",
      "completed enrollment history must survive a later student transfer",
    );
  } finally {
    if (previousUnity === undefined) delete process.env.UNITY_WEBGL_ENABLED;
    else process.env.UNITY_WEBGL_ENABLED = previousUnity;
    if (server) await new Promise((r) => server.close(r));
    for (const id of classes) {
      await query(
        "DELETE nh FROM notas_historial nh JOIN inscripciones i ON i.id=nh.inscripcion_id WHERE i.clase_id=?",
        [id],
      );
      await query("DELETE FROM clases WHERE id=?", [id]);
    }
    for (const id of labs)
      await query("DELETE FROM laboratorios WHERE id=?", [id]);
    for (const id of users)
      await query("DELETE FROM usuarios WHERE id=?", [id]);
    for (const id of careers)
      await query("DELETE FROM carreras WHERE id=?", [id]);
    if (university)
      await query("DELETE FROM universidades WHERE id=?", [university]);
    if (users.length)
      await query(
        `DELETE FROM orbit_audit WHERE actor_id IN (${users.map(() => "?")})`,
        users,
      );
    await pool.end();
  }
});
