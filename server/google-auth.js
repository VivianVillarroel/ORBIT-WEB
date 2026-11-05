import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  query,
  one,
  val,
  insert,
  tx,
  fail,
  requireUser,
  loadUser,
  hashPassword,
  verifyPassword,
  validate,
  email,
  audit,
} from "./core.js";
import { signIn, limit } from "./auth.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const saveSession = (req) =>
  new Promise((resolve, reject) =>
    req.session.save((e) => (e ? reject(e) : resolve())),
  );
export function sameSecret(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function googleConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}
export function googleRedirectURI() {
  return new URL(
    "/api/auth/google/callback",
    process.env.APP_ORIGIN || "http://localhost:3000",
  ).href;
}
export function createGoogleProvider() {
  const client = () =>
    new OAuth2Client({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: googleRedirectURI(),
      transporterOptions: { timeout: 10000, retry: false },
    });
  return {
    enabled: googleConfigured,
    authorize(flow) {
      return client().generateAuthUrl({
        response_type: "code",
        scope: ["openid", "email", "profile"],
        state: flow.state,
        nonce: flow.nonce,
        prompt: "select_account",
        code_challenge: createHash("sha256")
          .update(flow.verifier)
          .digest("base64url"),
        code_challenge_method: CodeChallengeMethod.S256,
      });
    },
    async profile(code, flow) {
      const oauth = client();
      const { tokens } = await oauth.getToken({
        code,
        codeVerifier: flow.verifier,
      });
      if (!tokens.id_token) fail(401, "Google no confirmó tu identidad.");
      // The official library checks Google's signature, issuer, expiry and our audience.
      const ticket = await oauth.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      return ticket.getPayload();
    },
  };
}
export function checkedGoogleProfile(payload, nonce) {
  if (
    !payload ||
    payload.email_verified !== true ||
    !sameSecret(payload.nonce, nonce) ||
    typeof payload.sub !== "string" ||
    !/^[\w-]{1,255}$/.test(payload.sub)
  )
    fail(401, "Google no confirmó tu identidad.");
  const address = validate({ email }, { email: payload.email }).email;
  const cleanName = (value) =>
    typeof value === "string"
      ? value
          .trim()
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .slice(0, 80)
      : "";
  const given = cleanName(payload.given_name),
    family = cleanName(payload.family_name);
  return {
    sub: payload.sub,
    email: address,
    nombre: given || cleanName(payload.name) || "Estudiante",
    apellido: family,
  };
}
export async function googleAccount(profile, linkUser) {
  // Stable Google subject, not a mutable email address, identifies a returning user.
  return tx(async () => {
    const linked = await one(
      "SELECT user_id FROM orbit_google_identities WHERE google_sub=? FOR UPDATE",
      [profile.sub],
    );
    if (linked) {
      if (linkUser && linked.user_id !== linkUser.id)
        fail(
          409,
          "Esta cuenta de Google ya está vinculada a otra cuenta ORBIT.",
        );
      const u = await loadUser(linked.user_id);
      if (!u?.activo) fail(403, "Esta cuenta no está disponible.");
      return u;
    }
    if (linkUser) {
      const current = await one(
        "SELECT activo,auth_version FROM usuarios WHERE id=? AND deleted_at IS NULL FOR UPDATE",
        [linkUser.id],
      );
      if (!current?.activo || current.auth_version !== linkUser.auth_version)
        fail(403, "Inicia sesión de nuevo para vincular Google.");
      if (
        await val(
          "SELECT user_id FROM orbit_google_identities WHERE user_id=?",
          [linkUser.id],
        )
      )
        fail(409, "Tu cuenta ya tiene un acceso de Google vinculado.");
      await insert("orbit_google_identities", {
        google_sub: profile.sub,
        user_id: linkUser.id,
      });
      return loadUser(linkUser.id);
    }
    // Never silently link an existing account (especially institutional/admin roles) by email.
    if (await val("SELECT id FROM usuarios WHERE email=?", [profile.email]))
      fail(
        409,
        "Ya tienes una cuenta. Inicia sesión y vincula Google desde Mi cuenta.",
      );
    const password_hash = await hashPassword(
      randomBytes(36).toString("base64url"),
    );
    const uid = await insert("usuarios", {
      nombre: profile.nombre,
      apellido: profile.apellido,
      email: profile.email,
      password_hash,
      rol: "estudiante",
      activo: 1,
      email_verified_at: new Date(),
    });
    await insert("estudiantes", {
      usuario_id: uid,
      tipo: "independiente",
      codigo: "LIBRE-" + String(uid).padStart(6, "0"),
    });
    await insert("orbit_google_identities", {
      google_sub: profile.sub,
      user_id: uid,
    });
    return loadUser(uid);
  });
}
async function startFlow(req, provider, linkUser) {
  await limit("google-start:" + req.ip, 20, 900);
  const flow = {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
    created: Date.now(),
    destination: linkUser
      ? "/panel.html#/cuenta"
      : req.query.plan === "premium"
        ? "/panel.html#/plan"
        : "/panel.html",
    userId: linkUser?.id || null,
    version: linkUser?.auth_version || null,
  };
  if (req.session.googleFlow)
    await query("DELETE FROM orbit_google_flows WHERE state_hash=?", [
      hash(req.session.googleFlow.state),
    ]);
  await insert("orbit_google_flows", {
    state_hash: hash(flow.state),
    expires_at: new Date(Date.now() + 10 * 60000),
  });
  req.session.googleFlow = flow;
  await saveSession(req);
  return provider.authorize(flow);
}
export function createGoogleRoutes(provider = createGoogleProvider()) {
  return async (req, res, p) => {
    const action = p[2];
    if (p.length !== 3) fail(404, "Ruta no encontrada.");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (action === "status" && req.method === "GET") {
      const linked = req.user
        ? !!(await val(
            "SELECT user_id FROM orbit_google_identities WHERE user_id=?",
            [req.user.id],
          ))
        : false;
      return res.json({ enabled: provider.enabled(), linked });
    }
    if (!provider.enabled()) {
      if (req.method === "GET")
        return res.redirect(303, "/login.html?google_error=unavailable");
      fail(503, "El acceso con Google todavía no está disponible.");
    }
    if (action === "start" && req.method === "GET")
      return res.redirect(303, await startFlow(req, provider));
    if (action === "link" && req.method === "POST") {
      const u = requireUser(req);
      await limit("google-link:" + u.id, 10, 900);
      const stored = await val(
        "SELECT password_hash FROM usuarios WHERE id=?",
        [u.id],
      );
      if (!(await verifyPassword(req.body.actual, stored)))
        fail(422, "Confirma tu contraseña actual para vincular Google.");
      return res.json({ url: await startFlow(req, provider, u) });
    }
    if (action === "callback" && req.method === "GET") {
      const flow = req.session.googleFlow;
      if (
        !flow ||
        !sameSecret(req.query.state, flow.state) ||
        Date.now() - flow.created > 10 * 60000
      )
        return res.redirect(303, "/login.html?google_error=invalid_flow");
      delete req.session.googleFlow;
      await saveSession(req);
      // Atomic consumption also prevents two simultaneous callbacks from reusing a flow.
      const consumed = await query(
        "DELETE FROM orbit_google_flows WHERE state_hash=? AND expires_at>NOW()",
        [hash(flow.state)],
      );
      if (consumed.affectedRows !== 1)
        return res.redirect(303, "/login.html?google_error=invalid_flow");
      if (req.query.error)
        return res.redirect(303, "/login.html?google_error=cancelled");
      if (
        typeof req.query.code !== "string" ||
        !req.query.code ||
        req.query.code.length > 4096
      )
        return res.redirect(303, "/login.html?google_error=invalid_flow");
      try {
        let linkUser;
        if (flow.userId) {
          linkUser = requireUser(req);
          if (
            linkUser.id !== flow.userId ||
            linkUser.auth_version !== flow.version
          )
            fail(403, "La sesión cambió.");
        }
        const profile = checkedGoogleProfile(
          await provider.profile(req.query.code, flow),
          flow.nonce,
        );
        const u = await tx(async () => {
          const u = await googleAccount(profile, linkUser);
          await query("UPDATE usuarios SET ultimo_acceso=NOW() WHERE id=?", [
            u.id,
          ]);
          await audit(req, {
            action: linkUser ? "auth.google_link" : "auth.google_login",
            entity: "usuarios",
            entityId: u.id,
            actorId: u.id,
            actorRole: u.rol,
          });
          return u;
        });
        await signIn(req, u);
        await saveSession(req);
        return res.redirect(303, flow.destination);
      } catch (e) {
        // Never expose Google's tokens, codes or provider error descriptions in logs/URLs.
        const error =
          e.status === 409
            ? "existing_account"
            : e.status === 403
              ? "account_unavailable"
              : "failed";
        return res.redirect(303, "/login.html?google_error=" + error);
      }
    }
    fail(405, "Método no permitido.");
  };
}
