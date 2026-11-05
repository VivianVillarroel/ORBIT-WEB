import express from "express";
import session from "express-session";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { query, loadUser, fail, audit, HttpError } from "./core.js";
import { SQLSessionStore } from "./session-store.js";
import { auth, limit } from "./auth.js";
import { catalogs, people } from "./routes/catalogs.js";
import { classes } from "./routes/classes.js";
import { content, webRoot, contentList } from "./routes/content.js";
import { academic, certificates } from "./routes/academic.js";
import { dashboard, options, practices } from "./routes/panel.js";
import { catalog, subscription, payments } from "./routes/payments.js";
import { imports } from "./routes/imports.js";
import { createGoogleRoutes } from "./google-auth.js";
import { auditLog } from "./routes/audit.js";
export function createApp({
  store = new SQLSessionStore(),
  sendMail,
  googleProvider,
  auditWriter,
} = {}) {
  const app = express(),
    production = process.env.NODE_ENV === "production";
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 48)
    throw new Error(
      "SESSION_SECRET debe tener al menos 48 caracteres aleatorios.",
    );
  const configuredOrigin = new URL(
    process.env.APP_ORIGIN || "http://localhost:3000",
  );
  if (
    !["http:", "https:"].includes(configuredOrigin.protocol) ||
    configuredOrigin.username ||
    configuredOrigin.password ||
    configuredOrigin.pathname !== "/" ||
    configuredOrigin.search ||
    configuredOrigin.hash
  )
    throw new Error(
      "APP_ORIGIN debe contener únicamente el origen HTTP(S) de la aplicación.",
    );
  const origin = configuredOrigin.origin;
  if (production && !origin.startsWith("https://"))
    throw new Error("Producción requiere APP_ORIGIN con HTTPS.");
  if (process.env.TRUST_PROXY && !["0", "1"].includes(process.env.TRUST_PROXY))
    throw new Error(
      "TRUST_PROXY debe ser 0 o 1 según la configuración del proxy.",
    );
  app.locals.sendMail = sendMail;
  app.locals.auditWriter = auditWriter;
  const googleRoutes = createGoogleRoutes(googleProvider);
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
  app.use((req, res, next) => {
    req.id = randomBytes(12).toString("hex");
    res.setHeader("X-Request-Id", req.id);
    // All application paths are canonical ASCII paths. Reject encoded aliases
    // before protected-asset mounts and express.static can interpret them differently.
    if (
      /%|\\|\/\//.test(req.path) ||
      req.path.split("/").some((part) => part.startsWith("."))
    )
      fail(404, "Ruta no encontrada.");
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'wasm-unsafe-eval'",
            "https://cdn.jsdelivr.net",
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "blob:", "https:"],
          workerSrc: ["'self'", "blob:"],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      strictTransportSecurity: production ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.get("/health/live", (req, res) => res.json({ ok: true }));
  app.get("/health/ready", async (req, res) => {
    await query("SELECT 1");
    res.json({ ok: true });
  });
  app.use((req, res, next) => {
    if (production && !req.secure) fail(400, "Se requiere una conexión HTTPS.");
    next();
  });
  app.use(["/api", "/uploads", "/simuladores"], (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Cookie");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Demasiadas solicitudes." },
    }),
  );
  app.use("/api", express.json({ limit: "2mb", strict: true }));
  app.use(
    ["/api", "/uploads", "/simuladores"],
    session({
      name: "orbit_sid",
      secret: process.env.SESSION_SECRET,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        maxAge: 8 * 3600000,
      },
    }),
  );
  app.use(["/api", "/uploads", "/simuladores"], async (req, res, next) => {
    if (req.session.uid) {
      const u = await loadUser(req.session.uid);
      if (
        !u?.activo ||
        u.auth_version !== req.session.version ||
        Date.now() - (req.session.started || 0) > 24 * 3600000
      ) {
        await new Promise((resolve, reject) =>
          req.session.regenerate((e) => (e ? reject(e) : resolve())),
        );
      } else req.user = u;
    }
    next();
  });
  const routeMap = {
    auth,
    catalogo: catalog,
    dashboard,
    opciones: options,
    academico: academic,
    certificados: certificates,
    practicas: practices,
    clases: classes,
    laboratorios: content,
    libros: content,
    universidades: catalogs,
    carreras: catalogs,
    licencias: catalogs,
    planes: catalogs,
    solicitudes: catalogs,
    docentes: people,
    estudiantes: people,
    directores: people,
    suscripcion: subscription,
    pagos: payments,
    importar: imports,
    auditoria: auditLog,
  };
  app.use("/api", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (
      Object.keys(req.query).length > 32 ||
      Object.values(req.query).some(
        (value) => typeof value !== "string" || value.length > 4096,
      )
    )
      fail(422, "Parámetros de consulta no válidos.");
    if (!["GET", "POST", "PUT", "DELETE"].includes(req.method))
      fail(405, "Método no permitido.");
    const raw = req.path === "/" ? req.query.r : req.path.slice(1);
    if (
      typeof raw !== "string" ||
      raw.length > 200 ||
      !/^\w+(\/[-\w]+)*$/.test(raw)
    )
      fail(404, "Ruta no encontrada.");
    const p = raw.split("/");
    if (req.method !== "GET") {
      if (
        (req.get("origin") && req.get("origin") !== origin) ||
        req.get("sec-fetch-site") === "cross-site"
      )
        fail(403, "Origen no permitido.");
      const publicPost =
        req.method === "POST" &&
        ((p[0] === "solicitudes" && p.length === 1) ||
          (p[0] === "auth" &&
            p.length === 2 &&
            [
              "login",
              "register",
              "verify-register",
              "forgot",
              "reset",
            ].includes(p[1])));
      if (!publicPost) {
        const sent = req.get("x-csrf-token"),
          expected = req.session?.csrf;
        if (
          typeof sent !== "string" ||
          !/^[a-f0-9]{64}$/.test(sent) ||
          typeof expected !== "string" ||
          sent.length !== expected.length ||
          !timingSafeEqual(Buffer.from(sent), Buffer.from(expected))
        )
          fail(419, "La sesión expiró. Recarga la página.");
      }
      if (req.is("application/json") && (!req.body || Array.isArray(req.body)))
        fail(400, "Se requiere un objeto JSON.");
      if (
        !req.is("application/json") &&
        !req.is("multipart/form-data") &&
        !(
          req.method === "DELETE" &&
          !req.get("content-type") &&
          !req.get("transfer-encoding") &&
          !Number(req.get("content-length"))
        ) &&
        !(p[0] === "auth" && p[1] === "logout")
      )
        fail(415, "Envía los datos como JSON.");
      if (p[0] === "solicitudes") await limit("contact:" + req.ip, 5, 900);
    }
    if (p[0] === "auth" && p[1] === "google") return googleRoutes(req, res, p);
    const handler = routeMap[p[0]];
    if (!handler) fail(404, "Ruta no encontrada.");
    return handler(req, res, p);
  });
  // Protected assets use the same career/Premium checks as the API, including direct URLs.
  app.use(["/uploads", "/simuladores"], async (req, res, next) => {
    if (!req.user) fail(401, "Inicia sesión para acceder al contenido.");
    const asset = decodeURIComponent(req.originalUrl.split("?")[0]).replace(
      /^\//,
      "",
    );
    if (
      process.env.UNITY_WEBGL_ENABLED !== "true" &&
      /^simuladores\/[^/]+\/Build\//i.test(asset)
    )
      fail(404, "La compilación de Unity está en preparación.");
    {
      let allowed = false;
      for (const table of ["laboratorios", "libros"]) {
        const rows = await contentList(table, req.user, "", [], {
          practiceStats: false,
        });
        if (
          rows.some(
            (r) =>
              !r.bloqueado &&
              [r.modelo_url, r.libro_url].some(
                (v) =>
                  v &&
                  (v === asset ||
                    (v.startsWith("simuladores/") &&
                      asset.startsWith(v.slice(0, v.lastIndexOf("/") + 1)))),
              ),
          )
        )
          allowed = true;
      }
      if (!allowed) fail(403, "Contenido no disponible para tu cuenta.");
    }
    next();
  });
  // No source/config/database files are ever served, even when a new private folder is added.
  app.use(async (req, res, next) => {
    if (
      req.path === "/" ||
      /^\/(index|panel|login|registro|recuperar)\.html$/.test(req.path) ||
      /^\/simuladores\/[a-z0-9_-]+\/index\.html$/.test(req.path)
    ) {
      const file = req.path === "/" ? "index.html" : req.path.slice(1);
      let html = await readFile(path.join(webRoot, file), "utf8");
      res.setHeader("Cache-Control", "no-store");
      const nonce = randomBytes(18).toString("base64");
      res.setHeader(
        "Content-Security-Policy",
        String(res.getHeader("Content-Security-Policy")).replace(
          "script-src ",
          `script-src 'nonce-${nonce}' `,
        ),
      );
      html = html.replace(
        /<script(?![^>]*\bsrc=)([^>]*)>/gi,
        `<script nonce="${nonce}"$1>`,
      );
      return res.type("html").send(html);
    }
    if (
      !/^\/(css|js|img|fonts|plantillas|simuladores|uploads)\//.test(
        req.path,
      ) ||
      req.path.split("/").some((s) => s.startsWith(".")) ||
      !/\.(css|js|svg|png|jpe?g|webp|ico|woff2?|ttf|csv|html|wasm|data|glb|pdf|gz|br|unityweb)$/i.test(
        req.path,
      )
    )
      return res.status(404).json({ error: "Ruta no encontrada." });
    next();
  });
  app.use(
    express.static(webRoot, {
      dotfiles: "deny",
      index: false,
      fallthrough: false,
      setHeaders(res, file) {
        if (/\.(gz|br)$/.test(file)) {
          res.setHeader(
            "Content-Encoding",
            file.endsWith(".br") ? "br" : "gzip",
          );
          const original = file.replace(/\.(gz|br)$/, "");
          if (original.endsWith(".wasm")) res.type("application/wasm");
          else if (original.endsWith(".js")) res.type("application/javascript");
          else if (original.endsWith(".css")) res.type("text/css");
          else res.type("application/octet-stream");
        }
        if (file.endsWith(".unityweb")) res.type("application/octet-stream");
        if (file.includes(path.sep + "uploads" + path.sep)) {
          res.setHeader("Content-Disposition", "attachment");
          res.setHeader("Cache-Control", "private, no-store");
        }
      },
    }),
  );
  app.use(async (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const candidate =
      err.status ||
      {
        ER_DUP_ENTRY: 409,
        ER_ROW_IS_REFERENCED_2: 409,
        ER_NO_REFERENCED_ROW_2: 422,
        ECONNREFUSED: 503,
        LIMIT_FILE_SIZE: 413,
        LIMIT_UNEXPECTED_FILE: 422,
        LIMIT_PART_COUNT: 422,
        LIMIT_FIELD_COUNT: 422,
        ENOENT: 404,
      }[err.code] ||
      500;
    const status =
      Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
        ? candidate
        : 500;
    if ([401, 403, 419, 429].includes(status)) {
      try {
        await audit(req, {
          action: "security.denied",
          entity: "http",
          details: { method: req.method, path: req.path.slice(0, 200), status },
        });
      } catch {
        console.error(
          JSON.stringify({
            requestId: req.id,
            code: "AUDIT_UNAVAILABLE",
            status,
          }),
        );
      }
    }
    if (status >= 500)
      console.error(
        JSON.stringify({ requestId: req.id, code: err.code || "SERVER_ERROR" }),
      );
    const message =
      err.type === "entity.parse.failed"
        ? "El cuerpo JSON no es válido."
        : err instanceof HttpError && status < 500
          ? err.message
          : status === 409
            ? "El registro ya existe o tiene datos asociados."
            : status === 422
              ? "Datos relacionados no válidos."
              : status === 413
                ? "El archivo supera el tamaño permitido."
                : status === 404
                  ? "Ruta no encontrada."
                  : status === 503
                    ? "Servicio temporalmente no disponible."
                    : status === 400
                      ? "Solicitud no válida."
                      : "No se pudo completar la operación.";
    res.status(status).json({
      error: message,
      ...(err instanceof HttpError && err.fields ? { fields: err.fields } : {}),
      requestId: req.id,
    });
  });
  return app;
}
