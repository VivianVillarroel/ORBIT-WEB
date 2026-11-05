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
test("complete ORBIT workflow, role boundaries, email verification, reset and session revocation", async () => {
  const paymentKeys = ["PAYMENT_ENABLED", "PAYMENT_HOLDER", "PAYMENT_QR_URL"];
  const previousPayment = Object.fromEntries(
    paymentKeys.map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    PAYMENT_ENABLED: "true",
    PAYMENT_HOLDER: "ORBIT test",
    PAYMENT_QR_URL: "https://example.invalid/qr.png",
  });
  await migrate();
  await query("DELETE FROM orbit_limits");
  const tag = randomBytes(5).toString("hex"),
    password = " a strong test password " + tag + " ",
    mail = [];
  const server = createApp({
    sendMail: async (to, subject, body) => mail.push({ to, subject, body }),
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const users = [],
    unis = [],
    labs = [],
    books = [],
    classes = [];
  function client() {
    return { cookie: "", csrf: "" };
  }
  async function api(c, method, route, body, status = 200) {
    const headers = {};
    if (c.cookie) headers.Cookie = c.cookie;
    if (c.csrf) headers["X-CSRF-Token"] = c.csrf;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base + "/api/" + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) c.cookie = cookie.split(";")[0];
    const raw = await response.text();
    assert.equal(response.status, status, method + " " + route + ": " + raw);
    const d = response.headers.get("content-type")?.includes("json")
      ? JSON.parse(raw)
      : raw;
    if (d.csrf) c.csrf = d.csrf;
    return d;
  }
  async function login(address) {
    const c = client();
    await api(c, "POST", "auth/login", { email: address, password });
    return c;
  }
  const addr = (n) => `${tag}-${n}@example.invalid`,
    code = () => mail.at(-1).body.match(/\b\d{6}\b/)[0];
  try {
    const adminId = await insert("usuarios", {
      nombre: "Admin",
      apellido: tag,
      email: addr("admin"),
      password_hash: await hashPassword(password),
      rol: "admin",
    });
    users.push(adminId);
    const admin = await login(addr("admin"));
    for (let n = 0; n < 2; n++) {
      const r = await api(
        admin,
        "POST",
        "universidades",
        { nombre: tag + n, tipo: "universidad", pais: "Bolivia" },
        201,
      );
      unis.push(r.id);
    }
    const career = (
        await api(
          admin,
          "POST",
          "carreras",
          { universidad_id: unis[0], nombre: "Carrera " + tag, area: "Salud" },
          201,
        )
      ).id,
      otherCareer = (
        await api(
          admin,
          "POST",
          "carreras",
          { universidad_id: unis[1], nombre: "Otra " + tag, area: "Salud" },
          201,
        )
      ).id;
    const userData = (n) => ({
      nombre: n,
      apellido: tag,
      email: addr(n),
      password,
      activo: true,
    });
    const teacherId = (
      await api(
        admin,
        "POST",
        "docentes",
        {
          ...userData("teacher"),
          universidad_id: unis[0],
          carrera_ids: [career],
        },
        201,
      )
    ).id;
    const directorId = (
      await api(
        admin,
        "POST",
        "directores",
        { ...userData("director"), carrera_id: career },
        201,
      )
    ).id;
    const studentId = (
      await api(
        admin,
        "POST",
        "estudiantes",
        { ...userData("student"), carrera_id: career, codigo: tag + "1" },
        201,
      )
    ).id;
    const otherId = (
      await api(
        admin,
        "POST",
        "estudiantes",
        { ...userData("other"), carrera_id: otherCareer, codigo: tag + "2" },
        201,
      )
    ).id;
    for (const [table, id] of [
      ["docentes", teacherId],
      ["directores", directorId],
      ["estudiantes", studentId],
      ["estudiantes", otherId],
    ])
      users.push((await api(admin, "GET", table + "/" + id)).item.usuario_id);
    const teacher = await login(addr("teacher")),
      director = await login(addr("director")),
      student = await login(addr("student")),
      other = await login(addr("other"));
    await api(teacher, "GET", "directores", undefined, 403);
    await api(director, "POST", "clases", { nombre: "invalid" }, 403);
    await api(
      student,
      "PUT",
      "universidades/" + unis[0],
      { nombre: "invalid" },
      403,
    );
    const lab = (
      await api(
        director,
        "POST",
        "laboratorios",
        {
          nombre: "Lab " + tag,
          area: "Salud",
          estado: "publicado",
          carrera_ids: [otherCareer],
          catalogo_publico: true,
          gratis: true,
          modelo_url: "uploads/modelos/test.glb",
        },
        201,
      )
    ).id;
    labs.push(lab);
    const l = (await api(director, "GET", "laboratorios/" + lab)).item;
    assert.equal(l.catalogo_publico, 0);
    assert.equal(l.carrera_ids, String(career));
    const course = (
      await api(
        teacher,
        "POST",
        "clases",
        {
          nombre: "Curso " + tag,
          carrera_id: career,
          periodo: "TEST",
          estado: "activa",
          cupo: 10,
        },
        201,
      )
    ).id;
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
    await api(
      teacher,
      "POST",
      `clases/${course}/laboratorios`,
      { laboratorio_id: lab },
      201,
    );
    await api(other, "GET", "laboratorios/" + lab, undefined, 404);
    await api(other, "GET", "clases/" + course, undefined, 403);
    await api(
      student,
      "POST",
      "practicas",
      {
        laboratorio_id: lab,
        clase_id: course,
        duracion_min: 5,
        completada: true,
        puntaje: 100,
      },
      422,
    );
    for (let i = 0; i < 2; i++)
      await api(
        student,
        "POST",
        "practicas",
        {
          laboratorio_id: lab,
          clase_id: course,
          duracion_min: 5,
          completada: true,
        },
        201,
      );
    await api(
      student,
      "POST",
      "certificados",
      { inscripcion_id: enrollment },
      422,
    );
    await api(
      director,
      "PUT",
      `clases/${course}/inscripciones/${enrollment}`,
      { nota_final: 99 },
      403,
    );
    await api(teacher, "PUT", `clases/${course}/inscripciones/${enrollment}`, {
      nota_final: 85,
      estado: "aprobado",
    });
    const academic = await api(director, "GET", "academico");
    const en = academic.inscripciones.find((r) => r.id === enrollment);
    assert.equal(en.total, 1);
    assert.equal(en.completados, 1);
    assert.equal(en.intentos, 2);
    assert.equal(en.progreso, 100);
    assert.equal(academic.notas_historial.length, 1);
    await api(
      director,
      "GET",
      "academico/estudiantes/" + otherId,
      undefined,
      404,
    );
    const cert = (
      await api(
        student,
        "POST",
        "certificados",
        { inscripcion_id: enrollment },
        201,
      )
    ).id;
    assert.equal(
      (
        await api(student, "POST", "certificados", {
          inscripcion_id: enrollment,
        })
      ).id,
      cert,
    );
    assert.match(
      await api(student, "GET", `certificados/${cert}/documento`),
      /85.00/,
    );
    await api(other, "GET", `certificados/${cert}/documento`, undefined, 403);
    for (const c of [admin, teacher, director, student]) {
      await api(c, "GET", "dashboard");
      await api(c, "GET", "opciones");
      await api(c, "GET", "academico");
      await api(c, "GET", "clases");
      await api(c, "GET", "laboratorios");
      await api(c, "GET", "libros");
      await api(c, "GET", "practicas");
    }
    for (const route of [
      "universidades",
      "carreras",
      "docentes",
      "estudiantes",
      "directores",
      "licencias",
      "planes",
      "solicitudes",
      "pagos",
    ])
      await api(admin, "GET", route);
    await api(admin, "GET", "laboratorios?q=" + tag);
    await api(director, "PUT", "laboratorios/" + lab, {
      nombre: "Lab " + tag,
      area: "Salud",
      estado: "publicado",
      carrera_ids: [career],
      modelo_url: "simuladores/m2/index.html",
    });
    const unity = await fetch(base + "/simuladores/m2/index.html", {
      headers: { Cookie: student.cookie },
    });
    assert.equal(unity.status, 200);
    assert.match(unity.headers.get("content-security-policy"), /nonce-/);
    assert.doesNotMatch(
      await unity.text(),
      /createUnityInstance|m2\.loader\.js|<canvas/,
    );
    assert.equal(
      (
        await fetch(base + "/simuladores/m2/Build/m2.loader.js", {
          headers: { Cookie: student.cookie },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(base + "/simuladores/m2/index.html", {
          headers: { Cookie: other.cookie },
        })
      ).status,
      403,
    );
    const anon = client(),
      reg = await api(
        anon,
        "POST",
        "auth/register",
        { ...userData("registered"), rol: "admin" },
        202,
      );
    const right = code();
    assert.equal(
      await query("SELECT id FROM usuarios WHERE email=?", [
        addr("registered"),
      ]).then((r) => r.length),
      0,
    );
    await api(
      anon,
      "POST",
      "auth/verify-register",
      { challenge: reg.challenge, code: "000000" },
      422,
    );
    const created = await api(
      anon,
      "POST",
      "auth/verify-register",
      { challenge: reg.challenge, code: right },
      201,
    );
    users.push(created.user.id);
    assert.equal(created.user.rol, "estudiante");
    assert.ok(created.user.email_verified_at);
    await api(
      anon,
      "POST",
      "auth/verify-register",
      { challenge: reg.challenge, code: right },
      422,
    );
    const second = await login(addr("registered"));
    const premiumLab = (
      await api(
        admin,
        "POST",
        "laboratorios",
        {
          nombre: "Premium " + tag,
          area: "Salud",
          estado: "publicado",
          catalogo_publico: true,
          gratis: false,
          carrera_ids: [],
        },
        201,
      )
    ).id;
    labs.push(premiumLab);
    assert.equal(
      (await api(anon, "GET", "laboratorios/" + premiumLab)).item.bloqueado,
      1,
    );
    await api(anon, "POST", "practicas", { laboratorio_id: premiumLab }, 402);
    const payment = await api(
      anon,
      "POST",
      "suscripcion/pago",
      {
        metodo: "qr",
        referencia: tag,
        meses: 2,
        monto: 0,
      },
      201,
    );
    await api(
      anon,
      "POST",
      "suscripcion/pago",
      { metodo: "qr", referencia: tag, meses: 2 },
      409,
    );
    const plan = (
      await query("SELECT precio_mes FROM planes WHERE codigo='premium'")
    )[0];
    assert.equal(
      (await query("SELECT monto FROM pagos WHERE id=?", [payment.id]))[0]
        .monto,
      plan.precio_mes * 2,
    );
    await api(admin, "PUT", "pagos/" + payment.id, { accion: "confirmar" });
    await api(
      admin,
      "PUT",
      "pagos/" + payment.id,
      { accion: "confirmar" },
      409,
    );
    assert.equal(
      (await api(anon, "GET", "laboratorios/" + premiumLab)).item.bloqueado,
      0,
    );
    assert.ok((await api(anon, "GET", "auth/me")).user.premium_hasta);
    const imported = await api(admin, "POST", "importar/carreras", {
      universidad_id: unis[0],
      filas: [{ nombre: "Importada " + tag, area: "Salud" }, { nombre: "" }],
    });
    assert.equal(imported.creados, 1);
    assert.equal(imported.omitidas.length, 1);
    const book = (
      await api(
        admin,
        "POST",
        "libros",
        {
          titulo: "Libro " + tag,
          estado: "publicado",
          carrera_ids: [career],
          catalogo_publico: false,
          gratis: false,
        },
        201,
      )
    ).id;
    books.push(book);
    await api(
      student,
      "POST",
      `libros/${book}/resultados`,
      { tema: "Prueba", puntaje: 85 },
      201,
    );
    assert.equal(
      (await api(student, "GET", `libros/${book}/resultados`)).items.length,
      1,
    );
    const form = new FormData();
    form.append("archivo", new Blob(["<script>bad</script>"]), "fake.glb");
    const badUpload = await fetch(base + `/api/laboratorios/${lab}/modelo`, {
      method: "POST",
      headers: { Cookie: director.cookie, "X-CSRF-Token": director.csrf },
      body: form,
    });
    assert.equal(badUpload.status, 422);
    const reset = await api(
      client(),
      "POST",
      "auth/forgot",
      { email: addr("registered") },
      202,
    );
    const resetCode = code();
    await api(client(), "POST", "auth/reset", {
      challenge: reset.challenge,
      code: resetCode,
      password: "new strong password " + tag,
    });
    await api(second, "GET", "auth/me", undefined, 401);
    await api(anon, "GET", "auth/me", undefined, 401);
    const fresh = client();
    await api(fresh, "POST", "auth/login", {
      email: addr("registered"),
      password: "new strong password " + tag,
    });
    const emailChange = await api(
      fresh,
      "POST",
      "auth/email-request",
      { email: addr("changed"), actual: "new strong password " + tag },
      202,
    );
    const verified = await api(fresh, "POST", "auth/email-confirm", {
      challenge: emailChange.challenge,
      code: code(),
    });
    assert.equal(verified.user.email, addr("changed"));
    const expired = await api(
      client(),
      "POST",
      "auth/forgot",
      { email: addr("changed") },
      202,
    );
    await query(
      "UPDATE orbit_codes SET expires_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE id=?",
      [expired.challenge],
    );
    await api(
      client(),
      "POST",
      "auth/reset",
      {
        challenge: expired.challenge,
        code: code(),
        password: "another strong password",
      },
      422,
    );
    const locked = await api(
        client(),
        "POST",
        "auth/forgot",
        { email: addr("changed") },
        202,
      ),
      validCode = code();
    for (let i = 0; i < 5; i++)
      await api(
        client(),
        "POST",
        "auth/reset",
        {
          challenge: locked.challenge,
          code: "000000",
          password: "another strong password",
        },
        422,
      );
    await api(
      client(),
      "POST",
      "auth/reset",
      {
        challenge: locked.challenge,
        code: validCode,
        password: "another strong password",
      },
      422,
    );
    assert.equal(
      (
        await query("SELECT code_hash,payload FROM orbit_codes WHERE id=?", [
          locked.challenge,
        ])
      )[0].code_hash.includes(validCode),
      false,
    );
    console.log(
      "ORBIT_INTEGRATION_OK: CRUD, four roles, IDOR, grades audit, certificates, nonce, verification, reset, expiration, lockout and revoked sessions.",
    );
  } finally {
    for (const [key, value] of Object.entries(previousPayment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // This database is disposable. Cleanup targets only fixture IDs generated by this test.
    if (classes.length) {
      const ph = classes.map(() => "?").join(",");
      await query(
        `DELETE ct FROM certificados ct JOIN inscripciones i ON i.id=ct.inscripcion_id WHERE i.clase_id IN (${ph})`,
        classes,
      );
      await query(
        `DELETE nh FROM notas_historial nh JOIN inscripciones i ON i.id=nh.inscripcion_id WHERE i.clase_id IN (${ph})`,
        classes,
      );
      for (const id of classes)
        await query("DELETE FROM clases WHERE id=?", [id]);
    }
    for (const id of labs)
      await query("DELETE FROM laboratorios WHERE id=?", [id]);
    for (const id of books) await query("DELETE FROM libros WHERE id=?", [id]);
    for (const uid of users)
      await query("DELETE FROM usuarios WHERE id=?", [uid]);
    for (const id of unis) {
      await query("DELETE FROM carreras WHERE universidad_id=?", [id]);
      await query("DELETE FROM universidades WHERE id=?", [id]);
    }
    await query("DELETE FROM orbit_codes WHERE email LIKE ?", [tag + "-%"]);
    await query("DELETE FROM orbit_sessions");
    await new Promise((r) => server.close(r));
    await pool.end();
  }
});
