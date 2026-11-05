import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { query, insert, hashPassword, pool } from "../core.js";
import { migrate } from "../scripts/migrate.js";
import { createApp } from "../app.js";
import { webRoot } from "../routes/content.js";

if (!/test/.test(process.env.DB_NAME || ""))
  throw new Error("A dedicated test database is required.");

test("production boundaries reject unconfigured payments and inactive institutions/careers", async () => {
  await migrate();
  const keys = [
    "PAYMENT_ENABLED",
    "PAYMENT_HOLDER",
    "PAYMENT_BANK",
    "PAYMENT_ACCOUNT",
    "PAYMENT_QR_URL",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  for (const key of keys) delete process.env[key];
  const tag = randomBytes(6).toString("hex"),
    password = "Production regression " + tag;
  const users = [];
  let university, career, laboratory, course, asset, server, heldUpload;
  try {
    const hash = await hashPassword(password);
    university = await insert("universidades", { nombre: "Boundary " + tag });
    career = await insert("carreras", {
      nombre: "Boundary " + tag,
      universidad_id: university,
    });
    async function account(role, suffix) {
      const id = await insert("usuarios", {
        nombre: role,
        apellido: tag,
        email: `${tag}-${suffix}@example.invalid`,
        password_hash: hash,
        rol: role,
        universidad_id: university,
      });
      users.push(id);
      return id;
    }
    const adminId = await account("admin", "admin");
    const independentUser = await account("estudiante", "free");
    await insert("estudiantes", {
      usuario_id: independentUser,
      tipo: "independiente",
      codigo: "FREE-" + tag,
    });
    const teacherUser = await account("docente", "teacher");
    const teacher = await insert("docentes", { usuario_id: teacherUser });
    await query(
      "INSERT INTO docente_carrera(docente_id,carrera_id) VALUES(?,?)",
      [teacher, career],
    );
    const studentUser = await account("estudiante", "student");
    const student = await insert("estudiantes", {
      usuario_id: studentUser,
      tipo: "institucional",
      carrera_id: career,
      codigo: "INST-" + tag,
    });
    const directorUser = await account("director", "director");
    await insert("directores", {
      usuario_id: directorUser,
      carrera_id: career,
    });
    const url = `uploads/modelos/boundary-${tag}.glb`;
    laboratory = await insert("laboratorios", {
      nombre: "Boundary " + tag,
      estado: "publicado",
      modelo_url: url,
      creado_por: directorUser,
    });
    await query(
      "INSERT INTO laboratorio_carrera(laboratorio_id,carrera_id) VALUES(?,?)",
      [laboratory, career],
    );
    course = await insert("clases", {
      nombre: "Boundary " + tag,
      carrera_id: career,
      docente_id: teacher,
      periodo: "TEST",
      estado: "activa",
    });
    await insert("inscripciones", { clase_id: course, estudiante_id: student });
    asset = path.join(webRoot, url);
    await mkdir(path.dirname(asset), { recursive: true });
    await writeFile(asset, "Boundary fixture");
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    async function api(client, method, route, body, status = 200) {
      const headers = {};
      if (client.cookie) headers.Cookie = client.cookie;
      if (client.csrf) headers["X-CSRF-Token"] = client.csrf;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(base + "/api/" + route, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const cookie = response.headers.get("set-cookie");
      if (cookie) client.cookie = cookie.split(";")[0];
      const data = await response.json();
      assert.equal(
        response.status,
        status,
        `${method} ${route}: ${JSON.stringify(data)}`,
      );
      if (data.csrf) client.csrf = data.csrf;
      return data;
    }
    async function login(suffix) {
      const client = {};
      await api(client, "POST", "auth/login", {
        email: `${tag}-${suffix}@example.invalid`,
        password,
      });
      return client;
    }
    const admin = await login("admin"),
      free = await login("free"),
      teacherClient = await login("teacher"),
      studentClient = await login("student"),
      director = await login("director");
    // Hold a multipart body open: another upload by this user must be refused
    // without buffering it, and aborting the first must free the admission slot.
    const boundary = "orbit-boundary-" + tag;
    heldUpload = httpRequest(base + `/api/laboratorios/${laboratory}/modelo`, {
      method: "POST",
      headers: {
        Cookie: admin.cookie,
        "X-CSRF-Token": admin.csrf,
        "Content-Type": "multipart/form-data; boundary=" + boundary,
      },
    });
    heldUpload.on("error", () => {});
    heldUpload.write(
      `--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="held.glb"\r\nContent-Type: application/octet-stream\r\n\r\nglTF`,
    );
    const pause = () => new Promise((resolve) => setTimeout(resolve, 50));
    const invalidUpload = async () => {
      const form = new FormData();
      form.append("archivo", new Blob(["invalid"]), "invalid.glb");
      const response = await fetch(
        base + `/api/laboratorios/${laboratory}/modelo`,
        {
          method: "POST",
          headers: { Cookie: admin.cookie, "X-CSRF-Token": admin.csrf },
          body: form,
        },
      );
      await response.text();
      return response.status;
    };
    let uploadStatus;
    for (let attempt = 0; attempt < 3; attempt++) {
      await pause();
      uploadStatus = await invalidUpload();
      if (uploadStatus === 429) break;
      assert.equal(uploadStatus, 422);
    }
    assert.equal(
      uploadStatus,
      429,
      "an in-flight upload must reserve its user's memory slot",
    );
    heldUpload.destroy();
    heldUpload = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      await pause();
      uploadStatus = await invalidUpload();
      if (uploadStatus === 422) break;
      assert.equal(uploadStatus, 429);
    }
    assert.equal(
      uploadStatus,
      422,
      "canceling the upload must allow a fresh request",
    );
    assert.deepEqual((await api(free, "GET", "suscripcion")).payment, {
      enabled: false,
      methods: [],
    });
    await api(
      free,
      "POST",
      "suscripcion/pago",
      { metodo: "qr", referencia: tag, meses: 2 },
      503,
    );
    assert.equal(
      (
        await query("SELECT COUNT(*) AS n FROM pagos WHERE usuario_id=?", [
          independentUser,
        ])
      )[0].n,
      0,
    );
    await api(
      admin,
      "POST",
      "suscripcion/pago",
      { metodo: "qr", referencia: tag, meses: 2 },
      403,
    );
    Object.assign(process.env, {
      PAYMENT_ENABLED: "true",
      PAYMENT_HOLDER: "ORBIT test",
      PAYMENT_QR_URL: "https://example.invalid/qr.png",
    });
    assert.deepEqual((await api(free, "GET", "suscripcion")).payment.methods, [
      "qr",
    ]);
    await api(
      free,
      "POST",
      "suscripcion/pago",
      { metodo: "transferencia", referencia: tag, meses: 2 },
      422,
    );
    const payment = await api(
      free,
      "POST",
      "suscripcion/pago",
      { metodo: "qr", referencia: tag, meses: 2, monto: 0 },
      201,
    );
    const plan = (
      await query("SELECT id,precio_mes FROM planes WHERE codigo='premium'")
    )[0];
    assert.equal(
      (await query("SELECT monto FROM pagos WHERE id=?", [payment.id]))[0]
        .monto,
      plan.precio_mes * 2,
    );
    process.env.PAYMENT_ENABLED = "false";
    await api(admin, "PUT", "pagos/" + payment.id, { accion: "confirmar" });
    assert.ok((await api(free, "GET", "suscripcion")).actual);
    await query(
      "UPDATE suscripciones SET fecha_inicio=DATE_ADD(CURDATE(),INTERVAL 1 DAY),fecha_fin=DATE_ADD(CURDATE(),INTERVAL 1 MONTH) WHERE usuario_id=?",
      [independentUser],
    );
    assert.equal(
      (await api(free, "GET", "suscripcion")).actual,
      null,
      "a future paid period must not grant access early",
    );
    assert.equal((await api(free, "GET", "auth/me")).user.premium_hasta, null);
    await query(
      "UPDATE suscripciones SET fecha_inicio=DATE_SUB(CURDATE(),INTERVAL 2 MONTH),fecha_fin=DATE_SUB(CURDATE(),INTERVAL 1 DAY) WHERE usuario_id=?",
      [independentUser],
    );
    assert.equal(
      (await api(free, "GET", "suscripcion")).actual,
      null,
      "expired periods must not grant access",
    );
    await query(
      "UPDATE suscripciones SET estado='pendiente',fecha_inicio=CURDATE(),fecha_fin=DATE_ADD(CURDATE(),INTERVAL 1 MONTH) WHERE usuario_id=?",
      [independentUser],
    );
    assert.equal(
      (await api(free, "GET", "suscripcion")).actual,
      null,
      "pending payments must not grant access",
    );
    await query("UPDATE suscripciones SET estado='activa' WHERE usuario_id=?", [
      independentUser,
    ]);
    assert.ok(
      (await api(free, "GET", "suscripcion")).actual,
      "current confirmed periods must grant access",
    );
    const foreignSubscription = await insert("suscripciones", {
      usuario_id: studentUser,
      plan_id: plan.id,
      estado: "pendiente",
    });
    const mismatchedPayment = await insert("pagos", {
      usuario_id: independentUser,
      suscripcion_id: foreignSubscription,
      metodo: "qr",
      referencia: tag + "-owner",
      meses: 1,
      monto: plan.precio_mes,
    });
    await api(
      admin,
      "PUT",
      "pagos/" + mismatchedPayment,
      { accion: "confirmar" },
      409,
    );
    assert.equal(
      (
        await query("SELECT estado FROM suscripciones WHERE id=?", [
          foreignSubscription,
        ])
      )[0].estado,
      "pendiente",
      "inconsistent legacy owner data must never activate another account",
    );
    for (const client of [teacherClient, studentClient]) {
      await api(client, "GET", "laboratorios/" + laboratory);
      assert.equal(
        (await fetch(base + "/" + url, { headers: { Cookie: client.cookie } }))
          .status,
        200,
      );
    }
    for (const table of ["carreras", "universidades"]) {
      const id = table === "carreras" ? career : university;
      await api(admin, "PUT", `${table}/${id}`, { activo: false });
      for (const client of [teacherClient, studentClient]) {
        await api(client, "GET", "auth/me");
        await api(client, "GET", "laboratorios/" + laboratory, undefined, 404);
        await api(client, "GET", "clases/" + course, undefined, 404);
        assert.equal(
          (
            await fetch(base + "/" + url, {
              headers: { Cookie: client.cookie },
            })
          ).status,
          403,
        );
      }
      await api(
        director,
        "DELETE",
        "laboratorios/" + laboratory,
        undefined,
        403,
      );
      await api(
        admin,
        "POST",
        "clases",
        {
          nombre: "Invalid",
          carrera_id: career,
          docente_id: teacher,
          periodo: "TEST",
          estado: "activa",
        },
        422,
      );
      await api(admin, "PUT", `${table}/${id}`, { activo: true });
    }
    assert.equal(adminId, users[0]);
  } finally {
    heldUpload?.destroy();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (course) await query("DELETE FROM clases WHERE id=?", [course]);
    if (laboratory)
      await query("DELETE FROM laboratorios WHERE id=?", [laboratory]);
    for (const id of users) {
      await query("DELETE FROM orbit_sessions WHERE user_id=?", [id]);
      await query("DELETE FROM usuarios WHERE id=?", [id]);
      await query("DELETE FROM orbit_audit WHERE actor_id=?", [id]);
    }
    if (career) await query("DELETE FROM carreras WHERE id=?", [career]);
    if (university)
      await query("DELETE FROM universidades WHERE id=?", [university]);
    if (asset) await unlink(asset).catch(() => {});
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await pool.end();
  }
});
