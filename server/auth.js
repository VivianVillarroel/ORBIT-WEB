import {
  randomBytes,
  randomInt,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import nodemailer from "nodemailer";
import {
  query,
  one,
  val,
  insert,
  update,
  tx,
  fail,
  validate,
  text,
  email,
  hashPassword,
  verifyPassword,
  loadUser,
  publicUser,
  requireUser,
  audit,
} from "./core.js";

const digest = (value) =>
  createHmac("sha256", process.env.SESSION_SECRET).update(value).digest("hex");
export async function limit(key, max, seconds) {
  const bucket = digest(key);
  await query(
    "INSERT INTO orbit_limits(bucket,hits,expires_at) VALUES(?,1,DATE_ADD(NOW(),INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE hits=IF(expires_at<NOW(),1,hits+1),expires_at=IF(expires_at<NOW(),VALUES(expires_at),expires_at)",
    [bucket, seconds],
  );
  if (
    Number(
      await val("SELECT hits FROM orbit_limits WHERE bucket=?", [bucket]),
    ) > max
  )
    fail(429, "Demasiados intentos. Espera antes de volver a intentarlo.");
}
export function mailer() {
  if (
    !process.env.SMTP_HOST ||
    (process.env.SMTP_USER && !process.env.SMTP_PASSWORD)
  )
    fail(
      503,
      "El envío de correos aún no está configurado. Contacta al administrador.",
    );
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: process.env.SMTP_SECURE !== "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
}
export async function sendMail(to, subject, content) {
  await mailer().sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text: content,
  });
}
export async function issueCode(address, purpose, payload, send = sendMail) {
  await limit("send:" + purpose + ":" + address, 3, 900);
  const id = randomBytes(16).toString("hex"),
    code = String(randomInt(100000, 1000000));
  await insert("orbit_codes", {
    id,
    email: address,
    purpose,
    code_hash: digest(id + ":" + code),
    payload: JSON.stringify(payload),
    expires_at: new Date(Date.now() + 10 * 60000),
  });
  try {
    await send(
      address,
      "Tu código de ORBIT",
      `Tu código es ${code}. Vence en 10 minutos. No lo compartas. Si no solicitaste esta operación, ignora este mensaje.`,
    );
  } catch (e) {
    await query("DELETE FROM orbit_codes WHERE id=?", [id]);
    throw e;
  }
  return id;
}
export async function consumeCode(id, code, purpose, fn) {
  if (
    typeof id !== "string" ||
    !/^[a-f0-9]{32}$/.test(id) ||
    typeof code !== "string" ||
    !/^\d{6}$/.test(code)
  )
    fail(422, "Código no válido o vencido.");
  const result = await tx(async () => {
    const r = await one(
      "SELECT *,expires_at>NOW() AS valid FROM orbit_codes WHERE id=? FOR UPDATE",
      [id],
    );
    if (!r || r.purpose !== purpose || r.used_at || !r.valid || r.attempts >= 5)
      return { invalid: true };
    const match = timingSafeEqual(
      Buffer.from(r.code_hash, "hex"),
      Buffer.from(digest(id + ":" + code), "hex"),
    );
    await query("UPDATE orbit_codes SET attempts=attempts+1 WHERE id=?", [id]);
    if (!match) return { invalid: true };
    const data =
      typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    const value = await fn(data, r.email);
    await query(
      "UPDATE orbit_codes SET used_at=NOW() WHERE email=? AND purpose=? AND used_at IS NULL",
      [r.email, purpose],
    );
    return { value };
  });
  if (result.invalid) fail(422, "Código no válido o vencido.");
  return result.value;
}
const regenerate = (req) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
export async function signIn(req, u) {
  await regenerate(req);
  req.session.uid = u.id;
  req.session.version = u.auth_version;
  req.session.csrf = randomBytes(32).toString("hex");
  req.session.started = Date.now();
  return { user: publicUser(u), csrf: req.session.csrf };
}
export async function auth(req, res, parts) {
  if (parts.length !== 2) fail(404, "Ruta no encontrada.");
  const a = parts[1],
    b = req.body,
    method = req.method;
  if (a === "csrf" && method === "GET") {
    req.session.csrf ||= randomBytes(32).toString("hex");
    return res.json({ csrf: req.session.csrf });
  }
  if (a === "login" && method === "POST") {
    const d = validate({ email }, b);
    if (
      typeof b.password !== "string" ||
      !b.password ||
      b.password.length > 1000
    )
      fail(422, "Escribe tu contraseña.");
    await limit("login-ip:" + req.ip, 30, 900);
    await limit("login-account:" + d.email, 10, 900);
    const row = await one(
      "SELECT id,password_hash,activo FROM usuarios WHERE email=? AND deleted_at IS NULL",
      [d.email],
    );
    // A fixed dummy hash keeps the expensive comparison for unknown accounts too.
    const ok = await verifyPassword(
      b.password,
      row?.password_hash ||
        "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxH7LX/9Z5vFpXgTzLqJLDwzX2e",
    );
    if (!row || !ok || !row.activo)
      fail(401, "El correo o la contraseña no son correctos.");
    await tx(async () => {
      await query("UPDATE usuarios SET ultimo_acceso=NOW() WHERE id=?", [
        row.id,
      ]);
      const user = await loadUser(row.id);
      await audit(req, {
        action: "auth.login",
        entity: "usuarios",
        entityId: row.id,
        actorId: row.id,
        actorRole: user.rol,
      });
    });
    return res.json(await signIn(req, await loadUser(row.id)));
  }
  if (a === "register" && method === "POST") {
    const d = validate(
      { nombre: text(80, true), apellido: text(80, true), email },
      b,
    );
    await limit("register-ip:" + req.ip, 10, 3600);
    const password_hash = await hashPassword(b.password);
    const existing = await val("SELECT id FROM usuarios WHERE email=?", [
      d.email,
    ]);
    const challenge = existing
      ? randomBytes(16).toString("hex")
      : await issueCode(
          d.email,
          "register",
          { ...d, password_hash },
          req.app.locals.sendMail,
        );
    return res.status(202).json({
      challenge,
      message:
        "Si el correo está disponible, recibirás un código para completar el registro.",
    });
  }
  if (a === "verify-register" && method === "POST") {
    await limit("verify:" + req.ip, 30, 900);
    const uid = await consumeCode(
      b.challenge,
      b.code,
      "register",
      async (d) => {
        const uid = await insert("usuarios", {
          ...d,
          rol: "estudiante",
          activo: 1,
          email_verified_at: new Date(),
        });
        await insert("estudiantes", {
          usuario_id: uid,
          tipo: "independiente",
          codigo: "LIBRE-" + String(uid).padStart(6, "0"),
        });
        await audit(req, {
          action: "auth.register",
          entity: "usuarios",
          entityId: uid,
          actorId: uid,
          actorRole: "estudiante",
        });
        return uid;
      },
    );
    return res.status(201).json(await signIn(req, await loadUser(uid)));
  }
  if (a === "forgot" && method === "POST") {
    const d = validate({ email }, b);
    await limit("forgot-ip:" + req.ip, 10, 3600);
    const u = await one(
      "SELECT id,activo,auth_version FROM usuarios WHERE email=? AND deleted_at IS NULL",
      [d.email],
    );
    const challenge = u?.activo
      ? await issueCode(
          d.email,
          "reset",
          { uid: u.id, version: u.auth_version },
          req.app.locals.sendMail,
        )
      : randomBytes(16).toString("hex");
    return res.status(202).json({
      challenge,
      message:
        "Si existe una cuenta activa con ese correo, recibirás un código.",
    });
  }
  if (a === "reset" && method === "POST") {
    await limit("reset-ip:" + req.ip, 30, 900);
    const hash = await hashPassword(b.password);
    await consumeCode(b.challenge, b.code, "reset", async (d) => {
      const u = await one(
        "SELECT id,auth_version FROM usuarios WHERE id=? AND activo=1 AND deleted_at IS NULL FOR UPDATE",
        [d.uid],
      );
      if (!u || u.auth_version !== d.version)
        fail(422, "Solicita un nuevo código.");
      await query(
        "UPDATE usuarios SET password_hash=?,auth_version=auth_version+1,email_verified_at=COALESCE(email_verified_at,NOW()) WHERE id=?",
        [hash, d.uid],
      );
      await query("DELETE FROM orbit_sessions WHERE user_id=?", [d.uid]);
      await audit(req, {
        action: "auth.password_reset",
        entity: "usuarios",
        entityId: d.uid,
        actorId: d.uid,
      });
    });
    return res.json({
      ok: true,
      message: "Contraseña actualizada. Inicia sesión de nuevo.",
    });
  }
  const u = requireUser(req);
  if (a === "me" && method === "GET")
    return res.json({ user: publicUser(u), csrf: req.session.csrf });
  if (a === "me" && method === "PUT") {
    const changes = validate(
      {
        nombre: text(80, true),
        apellido: text(80, true),
        telefono: text(30),
      },
      b,
    );
    await tx(async () => {
      await update("usuarios", u.id, changes);
      await audit(req, {
        action: "auth.profile_update",
        entity: "usuarios",
        entityId: u.id,
        before: {
          nombre: u.nombre,
          apellido: u.apellido,
          telefono: u.telefono,
        },
        after: changes,
      });
    });
    return res.json({ ok: true });
  }
  if (a === "logout" && method === "POST") {
    await audit(req, {
      action: "auth.logout",
      entity: "usuarios",
      entityId: u.id,
    });
    await new Promise((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve())),
    );
    res.clearCookie("orbit_sid");
    return res.json({ ok: true });
  }
  if (["password", "email-request"].includes(a) && method === "POST") {
    await limit("account:" + u.id, 10, 900);
    const hash = await val("SELECT password_hash FROM usuarios WHERE id=?", [
      u.id,
    ]);
    if (!(await verifyPassword(b.actual, hash)))
      fail(422, "La contraseña actual no es correcta.", {
        actual: "Contraseña incorrecta.",
      });
    if (a === "password") {
      const next = await hashPassword(b.nueva);
      await tx(async () => {
        await query(
          "UPDATE usuarios SET password_hash=?,auth_version=auth_version+1 WHERE id=? AND auth_version=? AND deleted_at IS NULL",
          [next, u.id, u.auth_version],
        ).then((result) => {
          if (!result.affectedRows)
            fail(409, "La cuenta cambió. Inicia sesión de nuevo.");
        });
        await query("DELETE FROM orbit_sessions WHERE user_id=?", [u.id]);
        await audit(req, {
          action: "auth.password_change",
          entity: "usuarios",
          entityId: u.id,
        });
      });
      return res.json(await signIn(req, await loadUser(u.id)));
    }
    const d = validate({ email }, b);
    if (await val("SELECT id FROM usuarios WHERE email=?", [d.email]))
      fail(409, "Ese correo no está disponible.");
    const challenge = await issueCode(
      d.email,
      "email",
      { uid: u.id, version: u.auth_version },
      req.app.locals.sendMail,
    );
    return res
      .status(202)
      .json({ challenge, message: "Enviamos un código al nuevo correo." });
  }
  if (a === "email-confirm" && method === "POST") {
    await limit("email-verify:" + u.id, 10, 900);
    let oldEmail;
    await consumeCode(b.challenge, b.code, "email", async (d, address) => {
      const current = await one(
        "SELECT auth_version FROM usuarios WHERE id=? AND deleted_at IS NULL FOR UPDATE",
        [u.id],
      );
      if (d.uid !== u.id || d.version !== current?.auth_version)
        fail(403, "Operación no autorizada.");
      oldEmail = u.email;
      await query(
        "UPDATE usuarios SET email=?,email_verified_at=NOW(),auth_version=auth_version+1 WHERE id=?",
        [address, u.id],
      );
      await query("DELETE FROM orbit_sessions WHERE user_id=?", [u.id]);
      await audit(req, {
        action: "auth.email_change",
        entity: "usuarios",
        entityId: u.id,
        before: { email: oldEmail },
        after: { email: address },
      });
    });
    // The committed change does not depend on delivery of the security notification.
    (req.app.locals.sendMail || sendMail)(
      oldEmail,
      "Cambio de correo en ORBIT",
      "El correo de tu cuenta ORBIT fue cambiado. Si no realizaste este cambio, contacta al administrador.",
    ).catch(() => console.error("Security notification delivery failed"));
    return res.json(await signIn(req, await loadUser(u.id)));
  }
  fail(404, "Ruta no encontrada.");
}
