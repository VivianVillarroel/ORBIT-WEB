/* ORBIT — panel para admin, docentes y estudiantes. Sin librerías.
   Habla con la API en api/index.php?r=... y dibuja cada vista según el rol. */
(function () {
  "use strict";

  /* Datos de pago para el plan Premium. Cámbialos por los datos reales de ORBIT. */
  var PAGO_INFO = {
    titular: "ORBIT",
    banco: "Banco (configura en js/panel.js)",
    cuenta: "N.º de cuenta (configura en js/panel.js)",
    qr: "" // ruta a la imagen del QR de cobro, por ejemplo "img/qr-orbit.png"
  };
  var VIEWER_SRC = "https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js";

  var API = "api/index.php?r=";
  var ME = null, CSRF = "", OPTS = {}, BADGES = {}, cleanup = [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var page = $("#page");

  /* ---------- Utilidades ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ic(id) { return '<svg aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function fdate(d) { if (!d) return "—"; var p = String(d).slice(0, 10).split("-"); return +p[2] + " " + MESES[+p[1] - 1] + " " + p[0]; }
  function fdt(d) { if (!d) return "—"; return fdate(d) + ", " + String(d).slice(11, 16); }
  function bs(n) { return "Bs " + Number(n || 0).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function num(n) { return n == null || n === "" ? "—" : esc(n); }
  function ids(s) { return s ? String(s).split(",").map(Number) : []; }
  function initials(u) { return ((u.nombre || "?")[0] + (u.apellido || "")[0]).toUpperCase(); }
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function api(method, route, body) {
    var opt = { method: method, headers: {}, credentials: "same-origin" };
    if (CSRF) opt.headers["X-CSRF-Token"] = CSRF;
    if (body instanceof FormData) opt.body = body;
    else if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    return fetch(API + route, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && route !== "auth/login") { location.href = "login.html?next=" + encodeURIComponent(location.hash); throw new Error("Sesión cerrada"); }
        if (!r.ok) { var e = new Error(data.error || "Error " + r.status); e.status = r.status; e.fields = data.fields || {}; throw e; }
        return data;
      });
    });
  }

  var toastT;
  function toast(msg, bad) {
    var t = $("#toast"); t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }
  function fail(e) { if (e && e.message !== "Sesión cerrada") toast(e.message || "Algo salió mal.", true); }

  /* ---------- Etiquetas ---------- */
  var L = {
    clase: { planificada: ["Planificada", "warn"], activa: ["Activa", "ok"], finalizada: ["Finalizada", ""] },
    lab: { solicitado: ["Solicitado", "warn"], en_desarrollo: ["En desarrollo", "vio"], publicado: ["Publicado", "ok"] },
    libro: { en_desarrollo: ["En desarrollo", "vio"], publicado: ["Publicado", "ok"] },
    insc: { inscrito: ["Inscrito", "vio"], retirado: ["Retirado", ""], aprobado: ["Aprobado", "ok"], reprobado: ["Reprobado", "bad"] },
    lic: { activa: ["Activa", "ok"], vencida: ["Vencida", ""], suspendida: ["Suspendida", "bad"] },
    sol: { nueva: ["Nueva", "bad"], en_proceso: ["En proceso", "warn"], cotizada: ["Cotizada", "vio"], cerrada: ["Cerrada", ""] },
    pago: { pendiente: ["Pendiente", "warn"], confirmado: ["Confirmado", "ok"], rechazado: ["Rechazado", "bad"] },
    activo: { 1: ["Activo", "ok"], 0: ["Inactivo", ""] }
  };
  var TIPO_UNI = { universidad: "Universidad", instituto: "Instituto", colegio: "Colegio" };
  var PLAN_LIC = { piloto: "Piloto", institucional: "Licencia institucional", proyecto_medida: "Proyecto a medida" };
  var METODO = { qr: "QR", transferencia: "Transferencia", tarjeta: "Tarjeta", efectivo: "Efectivo" };
  var AREAS = ["Salud", "Ingeniería y técnica", "Ciencias sociales", "Educación", "Otra"];
  var GRADOS = ["Licenciatura", "Especialidad", "Maestría", "Doctorado"];
  function pill(map, k) { var v = map[k] || [k, ""]; return '<span class="pill ' + v[1] + '">' + esc(v[0]) + "</span>"; }
  function pairs(obj) { return Object.keys(obj).map(function (k) { return [k, Array.isArray(obj[k]) ? obj[k][0] : obj[k]]; }); }
  function acceso(r) {
    if (!+r.catalogo_publico) return '<span class="pill">Solo instituciones</span>';
    return +r.gratis ? '<span class="pill ok">Público · gratis</span>' : '<span class="pill vio">Público · Premium</span>';
  }
  function modal3d(r) { return '<span class="pills"><span class="pill vio">3D</span>' + (+r.vr_disponible ? '<span class="pill">' + ic("i-vr") + "VR</span>" : "") + "</span>"; }

  /* Opciones para selects */
  function optUnis() { return (OPTS.universidades || []).map(function (u) { return [u.id, u.nombre]; }); }
  function optCarreras(uniId) {
    return (OPTS.carreras || []).filter(function (c) { return !uniId || +c.universidad_id === +uniId; })
      .map(function (c) { return [c.id, c.nombre, c.universidad || ""]; });
  }
  function isStudent() { return ME && ME.rol === "estudiante"; }
  function isIndep() { return isStudent() && ME.tipo_estudiante === "independiente"; }

  /* ---------- Ventanas ---------- */
  var dlg = $("#modal");
  function closeModal() { if (dlg.open) dlg.close(); dlg.innerHTML = ""; dlg.className = "modal"; }
  dlg.addEventListener("click", function (e) { if (e.target === dlg) closeModal(); });
  dlg.addEventListener("close", function () { dlg.innerHTML = ""; });

  function confirmBox(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      dlg.className = "modal sm";
      dlg.innerHTML = '<form method="dialog"><div class="mh"><h2>' + esc(title) + '</h2></div><div class="mb"><p>' + esc(text) + '</p></div>' +
        '<div class="mf"><button class="btn btn-line btn-sm" value="no">Cancelar</button><button class="btn btn-sm ' + (danger ? "btn-danger" : "btn-brand") + '" value="si">' + esc(okLabel || "Aceptar") + "</button></div></form>";
      dlg.showModal();
      dlg.addEventListener("close", function h() { dlg.removeEventListener("close", h); resolve(dlg.returnValue === "si"); });
    });
  }

  /* Formulario genérico.
     field: { k, label, type: text|email|password|number|date|textarea|select|checks|check|file|html, req, full, hint, opts(values), show(values), dep, placeholder, accept, step } */
  function openForm(o) {
    var vals = Object.assign({}, o.values || {});
    dlg.className = "modal" + (o.small ? " sm" : "");
    dlg.innerHTML = '<form novalidate><div class="mh"><span class="mi">' + ic(o.icon || "i-edit") + "</span><h2>" + esc(o.title) + '</h2><button type="button" class="ibtn" data-x aria-label="Cerrar">' + ic("i-close") + "</button></div>" +
      '<div class="mb"><p class="formerr" hidden></p><div class="fg"></div></div>' +
      '<div class="mf"><button type="button" class="btn btn-line btn-sm" data-x>Cancelar</button><button type="submit" class="btn btn-brand btn-sm">' + esc(o.submitLabel || "Guardar") + "</button></div></form>";
    var fg = $(".fg", dlg), form = $("form", dlg);
    o.fields.forEach(function (f) {
      var w = document.createElement("div");
      if (f.type === "section") { w.className = "fsec"; w.dataset.k = f.k; w.textContent = f.label; fg.appendChild(w); return; }
      w.className = "fld" + (f.full || f.type === "checks" || f.type === "textarea" || f.type === "html" ? " full" : "");
      w.dataset.k = f.k;
      var id = "fld-" + f.k, lab = f.label ? '<label for="' + id + '">' + esc(f.label) + (f.req ? ' <span class="req">*</span>' : "") + "</label>" : "";
      var v = vals[f.k] == null ? "" : vals[f.k], html = "";
      switch (f.type) {
        case "textarea": html = lab + '<textarea id="' + id + '" name="' + f.k + '" placeholder="' + esc(f.placeholder || "") + '">' + esc(v) + "</textarea>"; break;
        case "select": html = lab + '<select id="' + id + '" name="' + f.k + '"></select>'; break;
        case "checks": html = '<span class="lbl">' + esc(f.label) + '</span><div class="mlist" id="' + id + '"></div>'; break;
        case "check": html = '<label class="chk"><input type="checkbox" id="' + id + '" name="' + f.k + '"' + (v === true || +v === 1 ? " checked" : "") + ">" + esc(f.label) + "</label>"; break;
        case "file": html = lab + '<input type="file" id="' + id + '" name="' + f.k + '" accept="' + esc(f.accept || "") + '">'; break;
        case "html": html = f.html; break;
        default:
          html = lab + '<input id="' + id + '" name="' + f.k + '" type="' + (f.type || "text") + '" value="' + esc(v) + '" placeholder="' + esc(f.placeholder || "") + '"' +
            (f.step ? ' step="' + f.step + '"' : "") + (f.type === "password" ? ' autocomplete="new-password"' : "") + ">";
      }
      w.innerHTML = html + (f.hint ? '<span class="hint">' + esc(f.hint) + "</span>" : "") + '<span class="err" hidden></span>';
      fg.appendChild(w);
    });

    function fillOptions(f) {
      var w = $('[data-k="' + f.k + '"]', fg); if (!w) return;
      var cur = read()[f.k], list = f.opts(read());
      if (cur === undefined || cur === null) cur = vals[f.k];
      if (f.type === "select") {
        var sel = $("select", w), last = null, h = f.req && !f.blank ? "" : '<option value="">' + esc(f.blank || "—") + "</option>";
        if (f.req && !f.blank) h = '<option value="">Elige…</option>';
        list.forEach(function (o) {
          if (o[2] && o[2] !== last) { if (last !== null) h += "</optgroup>"; h += '<optgroup label="' + esc(o[2]) + '">'; last = o[2]; }
          h += '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur == null ? "" : cur) ? " selected" : "") + ">" + esc(o[1]) + "</option>";
        });
        if (last !== null) h += "</optgroup>";
        sel.innerHTML = h;
      } else if (f.type === "checks") {
        var box = $(".mlist", w), sel2 = (cur || []).map(String), g = null, out = "";
        list.forEach(function (o) {
          if (o[2] && o[2] !== g) { out += '<div class="grp">' + esc(o[2]) + "</div>"; g = o[2]; }
          out += '<label class="chk"><input type="checkbox" value="' + esc(o[0]) + '"' + (sel2.indexOf(String(o[0])) > -1 ? " checked" : "") + ">" + esc(o[1]) + "</label>";
        });
        box.innerHTML = out || '<span class="hint">' + esc(f.emptyText || "No hay opciones.") + "</span>";
      }
    }
    function read() {
      var out = {};
      o.fields.forEach(function (f) {
        var w = $('[data-k="' + f.k + '"]', fg); if (!w) return;
        if (f.type === "checks") { var box = $(".mlist", w); out[f.k] = box && box.children.length ? $$("input:checked", box).map(function (i) { return +i.value; }) : (vals[f.k] || []); }
        else if (f.type === "check") out[f.k] = $("input", w).checked;
        else if (f.type === "file" || f.type === "html" || f.type === "section") return;
        else { var el = $("input,select,textarea", w); if (!el) return; var x = el.value.trim(); out[f.k] = f.type === "number" ? (x === "" ? null : Number(x)) : (x === "" && f.type === "select" ? null : x); }
      });
      return out;
    }
    function sync(changed) {
      var cur = read();
      o.fields.forEach(function (f) {
        var w = $('[data-k="' + f.k + '"]', fg);
        if (f.show) w.hidden = !f.show(cur);
        if (f.opts && (changed === undefined || f.dep === changed)) fillOptions(f);
      });
    }
    sync();
    fg.addEventListener("change", function (e) { var w = e.target.closest(".fld"); if (w) sync(w.dataset.k); });
    $$("[data-x]", dlg).forEach(function (b) { b.addEventListener("click", closeModal); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = read(), errBox = $(".formerr", dlg), btn = $('[type="submit"]', dlg);
      $$(".err", fg).forEach(function (x) { x.hidden = true; });
      $$("[aria-invalid]", fg).forEach(function (x) { x.removeAttribute("aria-invalid"); });
      errBox.hidden = true;
      o.fields.forEach(function (f) { var w = $('[data-k="' + f.k + '"]', fg); if (w && w.hidden) delete data[f.k]; });
      var files = {};
      o.fields.forEach(function (f) { if (f.type === "file") { var inp = $('[data-k="' + f.k + '"] input', fg); if (inp && inp.files[0]) files[f.k] = inp.files[0]; } });
      btn.setAttribute("aria-busy", "true");
      Promise.resolve(o.submit(data, files)).then(function (msg) {
        closeModal(); if (msg !== false) toast(msg || "Guardado.");
        if (o.done) o.done();
      }).catch(function (err) {
        btn.removeAttribute("aria-busy");
        if (err.message === "Sesión cerrada") return;
        errBox.textContent = err.message; errBox.hidden = false;
        Object.keys(err.fields || {}).forEach(function (k) {
          var w = $('[data-k="' + k + '"]', fg); if (!w) { errBox.textContent += " " + err.fields[k]; return; }
          var x = $(".err", w); x.textContent = err.fields[k]; x.hidden = false;
          var inp = $("input,select,textarea", w); if (inp) inp.setAttribute("aria-invalid", "true");
        });
        var first = $('[aria-invalid="true"]', fg); if (first) first.focus();
      }).then(function () { btn && btn.removeAttribute("aria-busy"); });
    });
    dlg.showModal();
    var firstInput = $("input:not([type=checkbox]),select,textarea", fg); if (firstInput) firstInput.focus();
  }

  /* ---------- Tablas ---------- */
  function table(cols, rows, actions) {
    if (!rows.length) return "";
    var h = '<div class="tbl-wrap"><table class="tbl resp"><thead><tr>' + cols.map(function (c) { return "<th>" + esc(c.label) + "</th>"; }).join("") + (actions ? "<th></th>" : "") + "</tr></thead><tbody>";
    rows.forEach(function (r, i) {
      h += "<tr>" + cols.map(function (c, j) { return '<td data-label="' + esc(c.label) + '" class="' + (j === 0 ? "first " : "") + (c.cls || "") + '">' + c.render(r) + "</td>"; }).join("") +
        (actions ? '<td class="act">' + actions(r, i) + "</td>" : "") + "</tr>";
    });
    return h + "</tbody></table></div>";
  }
  function emptyBox(title, text, icon) { return '<div class="empty"><span class="em-ic">' + ic(icon || "i-info") + "</span><b>" + esc(title) + "</b>" + esc(text || "") + "</div>"; }
  function note(cls, html, icon) { return '<div class="note ' + (cls || "") + '">' + ic(icon || "i-info") + "<div>" + html + "</div></div>"; }
  function nameCell(main, sub, href) {
    return (href ? '<a class="lnk" href="' + href + '">' + esc(main) + "</a>" : "<b>" + esc(main) + "</b>") + (sub ? '<span class="sub">' + esc(sub) + "</span>" : "");
  }
  function avColor(s) { var h = 0; s = String(s || ""); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return "c" + (h % 6); }
  function av(name) { var p = String(name || "?").trim().split(/\s+/); return '<span class="av ' + avColor(name) + '" aria-hidden="true">' + esc(((p[0] || "?")[0] + ((p[1] || "")[0] || "")).toUpperCase()) + "</span>"; }
  function personCell(name, sub, href) { return '<span class="who-cell">' + av(name) + "<span>" + nameCell(name, sub, href) + "</span></span>"; }
  function thumbCell(img, main, sub, href, ar) {
    var t = img ? '<img class="thumb" src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="thumb-ph' + (ar ? " ar" : "") + '">' + ic(ar ? "i-book" : "i-cube") + "</span>";
    return '<span class="who-cell">' + t + "<span>" + nameCell(main, sub, href) + "</span></span>";
  }

  /* ---------- Recursos con CRUD ---------- */
  function userFields(isNew) {
    return [
      { k: "nombre", label: "Nombre", req: true },
      { k: "apellido", label: "Apellido", req: true },
      { k: "email", label: "Correo", type: "email", req: true },
      { k: "telefono", label: "Teléfono" },
      { k: "password", label: isNew ? "Contraseña inicial" : "Nueva contraseña", type: "password", req: isNew, hint: isNew ? "Mínimo 8 caracteres. Compártela con la persona." : "Déjala vacía para no cambiarla." }
    ];
  }

  var RES = {
    universidades: {
      title: "Instituciones", sub: "Universidades, institutos y colegios que trabajan con ORBIT.", single: "institución", api: "universidades",
      filters: [{ k: "tipo", label: "Todos los tipos", opts: function () { return pairs(TIPO_UNI); } }],
      cols: [
        { label: "Institución", render: function (r) { return nameCell(r.nombre, r.sigla); } },
        { label: "Tipo", render: function (r) { return esc(TIPO_UNI[r.tipo]); } },
        { label: "Ciudad", render: function (r) { return esc(r.ciudad || "—"); } },
        { label: "Carreras", cls: "num", render: function (r) { return num(r.carreras); } },
        { label: "Estudiantes", cls: "num", render: function (r) { return num(r.estudiantes); } },
        { label: "Estado", render: function (r) { return pill(L.activo, +r.activo); } }
      ],
      fields: function () {
        return [
          { k: "nombre", label: "Nombre", req: true, full: true },
          { k: "sigla", label: "Sigla" },
          { k: "tipo", label: "Tipo", type: "select", req: true, opts: function () { return pairs(TIPO_UNI); } },
          { k: "ciudad", label: "Ciudad" },
          { k: "pais", label: "País", req: true },
          { k: "email_contacto", label: "Correo de contacto", type: "email" },
          { k: "telefono", label: "Teléfono" },
          { k: "activo", label: "Activa", type: "check" }
        ];
      },
      defaults: { pais: "Bolivia", tipo: "universidad", activo: true },
      delMsg: function (r) { return "Se eliminará «" + r.nombre + "». Solo es posible si no tiene carreras registradas."; },
      reloadOpts: true
    },
    carreras: {
      title: "Carreras", sub: "Cada carrera define qué laboratorios y libros ven sus estudiantes.", single: "carrera", api: "carreras",
      filters: [
        { k: "universidad_id", label: "Todas las instituciones", opts: optUnis },
        { k: "area", label: "Todas las áreas", opts: function () { return AREAS.map(function (a) { return [a, a]; }); } }
      ],
      cols: [
        { label: "Carrera", render: function (r) { return nameCell(r.nombre, r.codigo); } },
        { label: "Institución", render: function (r) { return esc(r.universidad_sigla || r.universidad); } },
        { label: "Área", render: function (r) { return esc(r.area); } },
        { label: "Estudiantes", cls: "num", render: function (r) { return num(r.estudiantes); } },
        { label: "Clases", cls: "num", render: function (r) { return num(r.clases); } },
        { label: "Laboratorios", cls: "num", render: function (r) { return num(r.laboratorios); } }
      ],
      fields: function () {
        return [
          { k: "universidad_id", label: "Institución", type: "select", req: true, full: true, opts: optUnis },
          { k: "nombre", label: "Nombre", req: true },
          { k: "codigo", label: "Código", placeholder: "Ej.: MED" },
          { k: "area", label: "Área", type: "select", req: true, opts: function () { return AREAS.map(function (a) { return [a, a]; }); } },
          { k: "duracion_semestres", label: "Duración (semestres)", type: "number" },
          { k: "activo", label: "Activa", type: "check" }
        ];
      },
      defaults: { area: "Salud", activo: true },
      delMsg: function (r) { return "Se eliminará la carrera «" + r.nombre + "». Solo es posible si no tiene estudiantes ni clases."; },
      reloadOpts: true
    },
    docentes: {
      title: "Docentes", sub: "Cada docente gestiona sus clases y ve el progreso de sus estudiantes.", single: "docente", api: "docentes",
      filters: [{ k: "universidad_id", label: "Todas las instituciones", opts: optUnis }],
      cols: [
        { label: "Docente", render: function (r) { return personCell(r.nombre + " " + r.apellido, r.email); } },
        { label: "Institución", render: function (r) { return esc(r.universidad || "—"); } },
        { label: "Carreras", render: function (r) { return esc(r.carreras || "—"); } },
        { label: "Especialidad", render: function (r) { return esc(r.especialidad || "—"); } },
        { label: "Clases", cls: "num", render: function (r) { return num(r.clases); } },
        { label: "Estado", render: function (r) { return pill(L.activo, +r.activo); } }
      ],
      fields: function (isNew) {
        return userFields(isNew).concat([
          { k: "universidad_id", label: "Institución", type: "select", req: true, opts: optUnis },
          { k: "grado_academico", label: "Grado académico", type: "select", opts: function () { return GRADOS.map(function (g) { return [g, g]; }); } },
          { k: "especialidad", label: "Especialidad", full: true },
          { k: "carrera_ids", label: "Carreras donde enseña", type: "checks", dep: "universidad_id", emptyText: "Elige primero la institución.",
            opts: function (v) { return v.universidad_id ? optCarreras(v.universidad_id).map(function (c) { return [c[0], c[1]]; }) : []; } },
          { k: "activo", label: "Cuenta activa", type: "check" }
        ]);
      },
      toForm: function (r) { return Object.assign({}, r, { carrera_ids: ids(r.carrera_ids) }); },
      defaults: { activo: true },
      delMsg: function (r) { return "Se eliminará la cuenta de " + r.nombre + " " + r.apellido + ". Sus clases quedarán sin docente asignado."; },
      reloadOpts: true
    },
    estudiantes: {
      title: "Estudiantes", sub: "De instituciones (por carrera) e independientes (versión freemium).", single: "estudiante", api: "estudiantes",
      filters: [
        { k: "tipo", label: "Todos", opts: function () { return [["institucional", "De instituciones"], ["independiente", "Independientes"]]; } },
        { k: "universidad_id", label: "Todas las instituciones", opts: optUnis },
        { k: "carrera_id", label: "Todas las carreras", opts: function () { return optCarreras(); } }
      ],
      cols: [
        { label: "Estudiante", render: function (r) { return personCell(r.nombre + " " + r.apellido, r.email); } },
        { label: "Tipo", render: function (r) {
          if (r.tipo === "independiente") return r.premium_hasta ? '<span class="pill vio">Premium</span><span class="sub">hasta ' + fdate(r.premium_hasta) + "</span>" : '<span class="pill">Gratis</span>';
          return '<span class="pill ok">Institución</span>';
        } },
        { label: "Carrera", render: function (r) { return r.carrera ? nameCell(r.carrera, r.universidad_sigla || r.universidad) : "—"; } },
        { label: "Código", render: function (r) { return esc(r.codigo); } },
        { label: "Semestre", cls: "num", render: function (r) { return num(r.semestre); } },
        { label: "Prácticas", cls: "num", render: function (r) { return num(r.practicas); } },
        { label: "Estado", render: function (r) { return pill(L.activo, +r.activo); } }
      ],
      fields: function (isNew) {
        var inst = function (v) { return v.tipo !== "independiente"; };
        return [{ k: "tipo", label: "Tipo de estudiante", type: "select", req: true, full: true, opts: function () { return [["institucional", "De una institución (por carrera)"], ["independiente", "Independiente (freemium)"]]; } }]
          .concat(userFields(isNew)).concat([
            { k: "carrera_id", label: "Carrera", type: "select", req: true, show: inst, opts: function () { return optCarreras(); } },
            { k: "codigo", label: "Código de estudiante", req: true, show: inst },
            { k: "semestre", label: "Semestre", type: "number", show: inst },
            { k: "fecha_ingreso", label: "Fecha de ingreso", type: "date", show: inst },
            { k: "activo", label: "Cuenta activa", type: "check" }
          ]);
      },
      defaults: { tipo: "institucional", activo: true },
      delMsg: function (r) { return "Se eliminará la cuenta de " + r.nombre + " " + r.apellido + " con sus inscripciones y prácticas."; },
      reloadOpts: true
    },
    clases: {
      title: "Clases", sub: "Materias o paralelos de cada carrera. Abre una clase para inscribir estudiantes y asignar laboratorios.", single: "clase", api: "clases",
      filters: [
        { k: "estado", label: "Todos los estados", opts: function () { return pairs(L.clase); } },
        { k: "carrera_id", label: "Todas las carreras", opts: function () { return optCarreras(); } }
      ],
      cols: [
        { label: "Clase", render: function (r) { return nameCell(r.nombre, r.codigo, "#/clases/" + r.id); } },
        { label: "Carrera", render: function (r) { return nameCell(r.carrera, ME.rol === "admin" ? (r.universidad_sigla || r.universidad) : ""); } },
        { label: "Docente", render: function (r) { return esc(r.docente || "Sin asignar"); }, admin: true },
        { label: "Periodo", render: function (r) { return esc(r.periodo); } },
        { label: "Inscritos", cls: "num", render: function (r) { return esc(r.inscritos) + (r.cupo ? " / " + esc(r.cupo) : ""); } },
        { label: "Laboratorios", render: function (r) { return esc(r.laboratorios || "—"); } },
        { label: "Estado", render: function (r) { return pill(L.clase, r.estado); } }
      ],
      fields: function () {
        var f = [
          { k: "carrera_id", label: "Carrera", type: "select", req: true, opts: function () { return optCarreras(); } },
          { k: "periodo", label: "Periodo", req: true, placeholder: "Ej.: 2026-II" },
          { k: "nombre", label: "Nombre de la clase", req: true, full: true },
          { k: "codigo", label: "Código", placeholder: "Ej.: IBM-410" },
          { k: "estado", label: "Estado", type: "select", req: true, opts: function () { return pairs(L.clase); } },
          { k: "horario", label: "Horario", placeholder: "Ej.: Lun y Mié 08:00–10:00" },
          { k: "aula", label: "Aula" },
          { k: "cupo", label: "Cupo", type: "number" },
          { k: "descripcion", label: "Descripción", type: "textarea" }
        ];
        if (ME.rol === "admin") {
          f.splice(1, 0, { k: "docente_id", label: "Docente", type: "select", dep: "carrera_id", blank: "Sin asignar", opts: function (v) {
            var c = (OPTS.carreras || []).filter(function (x) { return +x.id === +v.carrera_id; })[0];
            return (OPTS.docentes || []).filter(function (d) { return !c || +d.universidad_id === +c.universidad_id; }).map(function (d) { return [d.id, d.nombre]; });
          } });
        }
        return f;
      },
      defaults: { estado: "activa" },
      delMsg: function (r) { return "Se eliminará la clase «" + r.nombre + "» con sus inscripciones."; },
      canEdit: function(){return ME.rol!=="director";}, canDelete: function(){return ME.rol!=="director";}, canCreate: function () { return ME.rol === "admin" || ME.rol === "docente"; }
    },
    laboratorios: {
      title: "Laboratorios", sub: "Hoy en 3D desde el navegador; con espacio para la versión en Realidad Virtual. Cada laboratorio se habilita por carrera.", single: "laboratorio", api: "laboratorios",
      filters: [
        { k: "estado", label: "Todos los estados", opts: function () { return pairs(L.lab); } },
        { k: "carrera_id", label: "Todas las carreras", opts: function () { return optCarreras(); } }
      ],
      cols: [
        { label: "Laboratorio", render: function (r) { return thumbCell(r.imagen_url, r.nombre, r.equipo, "#/laboratorios/" + r.id); } },
        { label: "Carreras", render: function (r) { return esc(r.carreras || "Ninguna"); } },
        { label: "Estado", render: function (r) { return pill(L.lab, r.estado); } },
        { label: "Modalidad", render: function (r) { return modal3d(r) + (r.modelo_url ? "" : '<span class="sub">Sin modelo 3D</span>'); } },
        { label: "Acceso freemium", render: acceso },
        { label: "Pedido por", render: function (r) { return esc(r.solicitante || "—"); } }
      ],
      fields: function () {
        return [
          { type: "section", k: "s1", label: "El laboratorio" },
          { k: "nombre", label: "Nombre", req: true, full: true },
          { k: "area", label: "Área", type: "select", req: true, opts: function () { return AREAS.map(function (a) { return [a, a]; }); } },
          { k: "equipo", label: "Equipo", placeholder: "Ej.: Dräger Savina 300" },
          { k: "estado", label: "Estado", type: "select", req: true, opts: function () { return pairs(L.lab); } },
          { k: "solicitado_por", label: "Pedido por", type: "select", blank: "Nadie (desarrollo propio)", opts: optUnis },
          { k: "descripcion", label: "Descripción", type: "textarea" },
          { type: "section", k: "s2", label: "Modelo 3D e imagen" },
          { k: "modelo_url", label: "Modelo 3D o simulador Unity", full: true, placeholder: "simuladores/m2/index.html", hint: "Para Unity M2 usa simuladores/m2/index.html. También admite un archivo .glb o el modelo subido aquí abajo." },
          { k: "modelo", label: "…o sube el modelo (.glb)", type: "file", accept: ".glb,.gltf", full: true },
          { k: "imagen_url", label: "Imagen de portada (enlace)", full: true, placeholder: "https://… o img/…" },
          { k: "vr_disponible", label: "Ya tiene versión en Realidad Virtual", type: "check", full: true },
          { type: "section", k: "s3", label: "Acceso" },
          { k: "carrera_ids", label: "Carreras con acceso", type: "checks", opts: function () { return optCarreras(); } },
          { k: "catalogo_publico", label: "Mostrar a estudiantes independientes (freemium)", type: "check", full: true },
          { k: "gratis", label: "Gratis para independientes (si no, requiere Premium)", type: "check", full: true, show: function (v) { return v.catalogo_publico; } }
        ];
      },
      toForm: function (r) { return Object.assign({}, r, { carrera_ids: ids(r.carrera_ids) }); },
      defaults: { estado: "en_desarrollo", area: "Salud" },
      afterSave: function (id, data, files) {
        if (!files.modelo) return;
        var fd = new FormData(); fd.append("archivo", files.modelo);
        return api("POST", "laboratorios/" + id + "/modelo", fd);
      },
      delMsg: function (r) { return "Se eliminará el laboratorio «" + r.nombre + "» con sus prácticas registradas."; },
      reloadOpts: true
    },
    libros: {
      title: "Libros AR", sub: "Libros con Realidad Aumentada: el estudiante apunta la cámara a cada página y un personaje 3D explica el tema. Cada libro se habilita por carrera.", single: "libro", api: "libros", icon: "i-book",
      filters: [{ k: "estado", label: "Todos los estados", opts: function () { return pairs(L.libro); } }],
      cols: [
        { label: "Libro", render: function (r) { return thumbCell(r.portada_url, r.titulo, r.autor, "#/libros/" + r.id, true); } },
        { label: "Temas", cls: "num", render: function (r) { return r.temas ? r.temas.split(/\n/).filter(Boolean).length : "—"; } },
        { label: "Carreras", render: function (r) { return esc(r.carreras || "Ninguna"); } },
        { label: "Contenido AR", render: function (r) {
          return '<span class="pills">' + (r.app_url ? '<span class="pill ar nodot">App</span>' : "") + (r.libro_url ? '<span class="pill nodot">PDF</span>' : "") + (r.modelo_url ? '<span class="pill vio nodot">3D</span>' : "") + "</span>" + (r.app_url || r.libro_url || r.modelo_url ? "" : '<span class="sub">Sin archivos aún</span>');
        } },
        { label: "Estado", render: function (r) { return pill(L.libro, r.estado); } },
        { label: "Acceso freemium", render: acceso }
      ],
      fields: function () {
        return [
          { type: "section", k: "s1", label: "El libro" },
          { k: "titulo", label: "Título", req: true, full: true },
          { k: "autor", label: "Autor" },
          { k: "materia", label: "Materia" },
          { k: "descripcion", label: "Descripción", type: "textarea" },
          { k: "temas", label: "Temas (uno por línea)", type: "textarea", placeholder: "Sublimación\nEllo, Yo y Superyó\nLos sueños", hint: "Cada tema es una página marcadora con su personaje y su quiz." },
          { k: "portada_url", label: "Portada (enlace a imagen)", full: true, placeholder: "https://… o img/…" },
          { type: "section", k: "s2", label: "Experiencia AR" },
          { k: "app_url", label: "Enlace de la app ORBIT AR", full: true, placeholder: "https://play.google.com/…", hint: "Donde el estudiante descarga la app que reconoce las páginas." },
          { k: "libro_url", label: "Libro o páginas marcadoras (PDF, enlace)", full: true, placeholder: "https://…" },
          { k: "pdf", label: "…o sube el PDF", type: "file", accept: ".pdf", full: true },
          { k: "modelo_url", label: "Modelo 3D para ver en AR desde el navegador (.glb, opcional)", full: true, placeholder: "https://… .glb", hint: "Con esto el estudiante abre el personaje en AR desde su celular sin instalar nada." },
          { k: "modelo", label: "…o sube el modelo .glb", type: "file", accept: ".glb,.gltf", full: true },
          { type: "section", k: "s3", label: "Acceso" },
          { k: "estado", label: "Estado", type: "select", req: true, opts: function () { return pairs(L.libro); } },
          { k: "carrera_ids", label: "Carreras con acceso", type: "checks", opts: function () { return optCarreras(); } },
          { k: "catalogo_publico", label: "Mostrar a estudiantes independientes (freemium)", type: "check", full: true },
          { k: "gratis", label: "Gratis para independientes (si no, requiere Premium)", type: "check", full: true, show: function (v) { return v.catalogo_publico; } }
        ];
      },
      toForm: function (r) { return Object.assign({}, r, { carrera_ids: ids(r.carrera_ids) }); },
      defaults: { estado: "en_desarrollo" },
      afterSave: function (id, data, files) {
        var jobs = [];
        if (files.pdf) { var a = new FormData(); a.append("archivo", files.pdf); jobs.push(api("POST", "libros/" + id + "/pdf", a)); }
        if (files.modelo) { var b = new FormData(); b.append("archivo", files.modelo); jobs.push(api("POST", "libros/" + id + "/modelo", b)); }
        return Promise.all(jobs);
      },
      delMsg: function (r) { return "Se eliminará el libro «" + r.titulo + "» con sus resultados de quiz."; }
    },
    licencias: {
      title: "Licencias", sub: "Pilotos, licencias institucionales (35 Bs por estudiante al mes) y proyectos a medida.", single: "licencia", api: "licencias",
      filters: [{ k: "estado", label: "Todos los estados", opts: function () { return pairs(L.lic); } }],
      cols: [
        { label: "Institución", render: function (r) { return nameCell(r.universidad, r.notas); } },
        { label: "Plan", render: function (r) { return esc(PLAN_LIC[r.plan]); } },
        { label: "Precio", render: function (r) { return bs(r.precio_estudiante_mes) + '<span class="sub">por estudiante al mes</span>'; } },
        { label: "Estudiantes", cls: "num", render: function (r) { return esc(r.estudiantes_actuales) + (r.estudiantes_max ? " / " + esc(r.estudiantes_max) : ""); } },
        { label: "Vigencia", render: function (r) { return fdate(r.fecha_inicio) + " – " + fdate(r.fecha_fin); } },
        { label: "Estado", render: function (r) { return pill(L.lic, r.estado); } }
      ],
      fields: function () {
        return [
          { k: "universidad_id", label: "Institución", type: "select", req: true, full: true, opts: optUnis },
          { k: "plan", label: "Plan", type: "select", req: true, opts: function () { return pairs(PLAN_LIC); } },
          { k: "estado", label: "Estado", type: "select", req: true, opts: function () { return pairs(L.lic); } },
          { k: "precio_estudiante_mes", label: "Precio por estudiante al mes (Bs)", type: "number", step: "0.01", req: true },
          { k: "estudiantes_max", label: "Máximo de estudiantes", type: "number" },
          { k: "fecha_inicio", label: "Inicio", type: "date", req: true },
          { k: "fecha_fin", label: "Fin", type: "date" },
          { k: "notas", label: "Notas", full: true }
        ];
      },
      defaults: { plan: "institucional", estado: "activa", precio_estudiante_mes: 35 },
      delMsg: function (r) { return "Se eliminará la licencia de " + r.universidad + "."; }
    },
    planes: {
      title: "Planes freemium", sub: "Lo que pagan los estudiantes independientes. El plan Gratis da acceso a los contenidos marcados como gratis.", single: "plan", api: "planes",
      cols: [
        { label: "Plan", render: function (r) { return nameCell(r.nombre, r.codigo); } },
        { label: "Precio mensual", render: function (r) { return +r.precio_mes ? bs(r.precio_mes) : "Gratis"; } },
        { label: "Descripción", render: function (r) { return esc(r.descripcion || "—"); } },
        { label: "Suscripciones vigentes", cls: "num", render: function (r) { return num(r.activas); } },
        { label: "Estado", render: function (r) { return pill(L.activo, +r.activo); } }
      ],
      fields: function () {
        return [
          { k: "nombre", label: "Nombre", req: true },
          { k: "precio_mes", label: "Precio mensual (Bs)", type: "number", step: "0.01", req: true },
          { k: "descripcion", label: "Descripción", full: true },
          { k: "activo", label: "Disponible", type: "check" }
        ];
      },
      canCreate: function () { return false; }, canDelete: function () { return false; }
    },
    pagos: {
      title: "Pagos", sub: "Pagos que reportan los estudiantes independientes. Al confirmar uno, su plan Premium se activa o se extiende.", single: "pago", api: "pagos",
      filters: [{ k: "estado", label: "Todos los estados", opts: function () { return pairs(L.pago); } }],
      cols: [
        { label: "Estudiante", render: function (r) { return personCell(r.estudiante, r.email); } },
        { label: "Monto", render: function (r) { return bs(r.monto) + '<span class="sub">' + r.meses + (+r.meses === 1 ? " mes" : " meses") + "</span>"; } },
        { label: "Pago", render: function (r) { return esc(METODO[r.metodo]) + '<span class="sub">' + esc(r.referencia || "") + "</span>"; } },
        { label: "Reportado", render: function (r) { return fdt(r.creado_en); } },
        { label: "Estado", render: function (r) { return pill(L.pago, r.estado) + (r.revisor ? '<span class="sub">' + esc(r.revisor) + "</span>" : ""); } }
      ],
      canCreate: function () { return false; }, canEdit: function () { return false; }, canDelete: function () { return false; },
      rowActions: function (r) {
        if (r.estado !== "pendiente") return "";
        return '<button class="btn btn-brand btn-sm" data-pay="confirmar" data-id="' + r.id + '">Confirmar</button> <button class="btn btn-line btn-sm" data-pay="rechazar" data-id="' + r.id + '">Rechazar</button>';
      },
      bind: function (box, reload) {
        box.addEventListener("click", function (e) {
          var b = e.target.closest("[data-pay]"); if (!b) return;
          var ok = b.dataset.pay === "confirmar";
          confirmBox(ok ? "Confirmar pago" : "Rechazar pago", ok ? "Verificaste que el dinero llegó? El plan Premium se activará o extenderá." : "El estudiante verá su pago como rechazado.", ok ? "Confirmar" : "Rechazar", !ok)
            .then(function (yes) { if (!yes) return; return api("PUT", "pagos/" + b.dataset.id, { accion: b.dataset.pay }).then(function () { toast(ok ? "Pago confirmado." : "Pago rechazado."); refreshBadges(); reload(); }); }).catch(fail);
        });
      }
    },
    solicitudes: {
      title: "Solicitudes de cotización", sub: "Lo que llega desde el formulario de contacto de la página.", single: "solicitud", api: "solicitudes",
      filters: [{ k: "estado", label: "Todos los estados", opts: function () { return pairs(L.sol); } }],
      cols: [
        { label: "Contacto", render: function (r) { return personCell(r.nombre, r.email); } },
        { label: "Institución", render: function (r) { return esc(r.institucion || "—"); } },
        { label: "Necesita", render: function (r) { return esc(r.tipo || "—"); } },
        { label: "Mensaje", render: function (r) { var m = r.mensaje || ""; return esc(m.length > 70 ? m.slice(0, 70) + "…" : m); } },
        { label: "Fecha", render: function (r) { return fdate(r.creado_en); } },
        { label: "Estado", render: function (r) {
          return '<select class="sel" data-sol="' + r.id + '" aria-label="Estado">' + pairs(L.sol).map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === r.estado ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>";
        } }
      ],
      canCreate: function () { return false; }, canEdit: function () { return false; },
      rowActions: function (r) { return '<button class="ibtn" data-ver="' + r.id + '" aria-label="Ver mensaje">' + ic("i-eye") + "</button>"; },
      bind: function (box, reload, rows) {
        box.addEventListener("change", function (e) {
          var s = e.target.closest("[data-sol]"); if (!s) return;
          api("PUT", "solicitudes/" + s.dataset.sol, { estado: s.value }).then(function () { toast("Estado actualizado."); refreshBadges(); }).catch(fail);
        });
        box.addEventListener("click", function (e) {
          var b = e.target.closest("[data-ver]"); if (!b) return;
          var r = rows().filter(function (x) { return +x.id === +b.dataset.ver; })[0]; if (!r) return;
          dlg.className = "modal";
          dlg.innerHTML = '<form method="dialog"><div class="mh"><h2>' + esc(r.nombre) + '</h2><button class="ibtn" value="x" aria-label="Cerrar">' + ic("i-close") + '</button></div><div class="mb">' +
            '<dl class="dl"><div><dt>Correo</dt><dd><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a></dd></div><div><dt>Institución</dt><dd>" + esc(r.institucion || "—") + "</dd></div><div><dt>Necesita</dt><dd>" + esc(r.tipo || "—") + "</dd></div><div><dt>Fecha</dt><dd>" + fdt(r.creado_en) + "</dd></div></dl>" +
            '<p style="margin-top:18px;white-space:pre-wrap">' + esc(r.mensaje) + '</p></div><div class="mf"><a class="btn btn-brand btn-sm" href="mailto:' + esc(r.email) + "?subject=" + encodeURIComponent("Cotización ORBIT") + '">Responder por correo</a></div></form>';
          dlg.showModal();
        });
      }
    }
  };

  function newLabel(cfg) { return (/^(director|docente|estudiante|plan|pago|laboratorio|libro)$/.test(cfg.single) ? "Nuevo " : "Nueva ") + cfg.single; }

  function crudView(cfg) {
    var canCreate = cfg.canCreate ? cfg.canCreate() : true;
    var canEdit = cfg.canEdit ? cfg.canEdit() : true;
    var canDelete = cfg.canDelete ? cfg.canDelete() : true;
    var cols = cfg.cols.filter(function (c) { return !c.admin || ME.rol === "admin"; });
    var state = {}, rows = [];
    page.innerHTML = '<div class="ph"><div><h1>' + esc(cfg.title) + "</h1><p>" + esc(cfg.sub || "") + '</p></div><div class="ph-actions">' +
      (canCreate ? '<button class="btn btn-brand btn-sm" id="newBtn">' + ic("i-plus") + newLabel(cfg) + "</button>" : "") + "</div></div>" +
      '<div class="toolbar"><div class="search">' + ic("i-search") + '<input class="inp" type="search" id="q" placeholder="Buscar" aria-label="Buscar"></div>' +
      (cfg.filters || []).map(function (f) {
        return '<select class="sel" data-f="' + f.k + '" aria-label="' + esc(f.label) + '"><option value="">' + esc(f.label) + "</option>" + f.opts().map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + (o[2] ? " · " + esc(o[2]) : "") + "</option>"; }).join("") + "</select>";
      }).join("") + '</div><div class="card" id="box"><div class="loading">Cargando…</div></div><p class="tcount" id="cnt"></p>';

    var box = $("#box");
    function load() {
      var qs = Object.keys(state).filter(function (k) { return state[k]; }).map(function (k) { return "&" + k + "=" + encodeURIComponent(state[k]); }).join("");
      api("GET", cfg.api + qs).then(function (d) {
        rows = d.items;
        var actions = (canEdit || canDelete || cfg.rowActions) ? function (r) {
          return (cfg.rowActions ? cfg.rowActions(r) : "") +
            (canEdit && !(cfg.api==="laboratorios" && ME.rol==="director" && +r.creado_por!==+ME.id) ? '<button class="ibtn" data-ed="' + r.id + '" aria-label="Editar">' + ic("i-edit") + "</button>" : "") +
            (canDelete && !(cfg.api==="laboratorios" && ME.rol==="director" && +r.creado_por!==+ME.id) ? '<button class="ibtn del" data-del="' + r.id + '" aria-label="Eliminar">' + ic("i-trash") + "</button>" : "");
        } : null;
        box.innerHTML = table(cols, rows, actions) || emptyBox("Sin resultados", state.q || Object.keys(state).length ? " Prueba con otra búsqueda o filtro." : " Todavía no hay registros.");
        $("#cnt").textContent = rows.length ? rows.length + (rows.length === 1 ? " registro" : " registros") : "";
      }).catch(function (e) { box.innerHTML = emptyBox("No se pudo cargar", " " + e.message); });
    }
    function edit(r) {
      var isNew = !r;
      openForm({
        title: isNew ? newLabel(cfg) : "Editar " + cfg.single, icon: isNew ? "i-plus" : "i-edit",
        fields: cfg.fields(isNew),
        values: isNew ? Object.assign({}, cfg.defaults || {}) : (cfg.toForm ? cfg.toForm(r) : r),
        submit: function (data, files) {
          return api(isNew ? "POST" : "PUT", cfg.api + (isNew ? "" : "/" + r.id), data).then(function (res) {
            var id = isNew ? res.id : r.id;
            return Promise.resolve(cfg.afterSave && cfg.afterSave(id, data, files)).then(function () { return isNew ? "Creado." : "Cambios guardados."; });
          });
        },
        done: function () { if (cfg.reloadOpts) loadOpts().then(load); else load(); }
      });
    }
    box.addEventListener("click", function (e) {
      var ed = e.target.closest("[data-ed]"), del = e.target.closest("[data-del]");
      if (ed) { edit(rows.filter(function (x) { return +x.id === +ed.dataset.ed; })[0]); }
      if (del) {
        var r = rows.filter(function (x) { return +x.id === +del.dataset.del; })[0];
        confirmBox("Eliminar " + cfg.single, cfg.delMsg ? cfg.delMsg(r) : "Esta acción no se puede deshacer.", "Eliminar", true).then(function (yes) {
          if (!yes) return;
          return api("DELETE", cfg.api + "/" + r.id).then(function () { toast("Eliminado."); if (cfg.reloadOpts) loadOpts(); load(); });
        }).catch(fail);
      }
    });
    if (cfg.bind) cfg.bind(box, load, function () { return rows; });
    if ($("#newBtn")) $("#newBtn").addEventListener("click", function () { edit(null); });
    $("#q").addEventListener("input", debounce(function (e) { state.q = e.target.value.trim(); load(); }, 250));
    $$("[data-f]").forEach(function (s) { s.addEventListener("change", function () { state[s.dataset.f] = s.value; load(); }); });
    load();
  }

  /* ---------- Resumen ---------- */
  function statTile(n, label, href, tone, icon, suffix, hl) {
    var tag = href ? "a" : "div";
    return "<" + tag + ' class="stat t-' + (tone || "vio") + (hl ? " hl" : "") + '"' + (href ? ' href="' + href + '"' : "") + '><span class="si">' + ic(icon || "i-chart") + "</span>" +
      "<span><b>" + (n == null ? "—" : esc(n)) + (suffix ? "<small>" + esc(suffix) + "</small>" : "") + '</b><span class="lb">' + esc(label) + "</span></span>" +
      (href ? '<svg class="go" aria-hidden="true"><use href="#i-arrow"/></svg>' : "") + "</" + tag + ">";
  }
  function bar(p) { p = Math.max(0, Math.min(100, +p || 0)); return '<span class="bar" aria-hidden="true"><i style="width:' + p + '%"></i></span>'; }
  function hero(o) {
    return '<section class="hero-p"><div class="hp-copy"><span class="hp-kicker">' + esc(o.kicker) + "</span><h1>" + esc(o.title) + "</h1><p>" + o.text + "</p>" +
      (o.actions ? '<div class="hp-actions">' + o.actions + "</div>" : "") + '</div><div class="hp-img"><img src="' + o.img + '" alt="" loading="eager">' +
      (o.badge ? '<span class="hp-badge">' + o.badge + "</span>" : "") + "</div></section>";
  }
  function saludo() { var h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; }
  var DONE = { 1: ["Completada", "ok"], 0: ["En curso", "warn"] };

  function viewHome() {
    if (ME.rol !== "estudiante") return viewAcademic();
    page.innerHTML = '<div class="loading">Cargando…</div>';
    api("GET", "dashboard").then(function (d) {
      var s = d.stats, h = "";
      if (d.rol === "admin") {
        h += hero({ kicker: "Panel de administración", title: saludo() + ", " + ME.nombre, img: "img/estudiantes-vr.webp",
          text: "Así va ORBIT hoy: " + esc(s.estudiantes) + " estudiantes de instituciones, " + esc(s.independientes) + " independientes y " + esc(s.labs_publicados) + " laboratorios publicados.",
          actions: '<a class="btn btn-white btn-sm" href="#/importar">' + ic("i-upload") + 'Importar listas</a><a class="btn btn-glass btn-sm" href="#/laboratorios">' + ic("i-cube") + "Laboratorios</a>",
          badge: ic("i-star") + "<span>Promedio de prácticas <b>" + (s.promedio != null ? esc(s.promedio) : "—") + "</b></span>" });
        h += '<div class="stats">' +
          statTile(s.universidades, "Instituciones", "#/universidades", "vio", "i-building") +
          statTile(s.estudiantes, "Estudiantes de instituciones", "#/estudiantes", "vio", "i-users") +
          statTile(s.independientes, "Estudiantes independientes", "#/estudiantes", "ar", "i-user") +
          statTile(s.premium, "Con plan Premium", "#/estudiantes", "ar", "i-star") +
          statTile(s.docentes, "Docentes", "#/docentes", "ink", "i-cap") +
          statTile(s.clases_activas, "Clases activas", "#/clases", "ink", "i-layers") +
          statTile(s.labs_publicados, "Laboratorios publicados", "#/laboratorios", "ok", "i-cube") +
          statTile(+s.labs_desarrollo + +s.labs_solicitados, "Laboratorios pedidos o en desarrollo", "#/laboratorios", "warn", "i-cube") +
          statTile(s.libros, "Libros AR publicados", "#/libros", "ar", "i-book") +
          statTile(s.pagos_pendientes, "Pagos por confirmar", "#/pagos", "warn", "i-card", "", +s.pagos_pendientes > 0) +
          statTile(s.solicitudes_nuevas, "Solicitudes nuevas", "#/solicitudes", "warn", "i-inbox", "", +s.solicitudes_nuevas > 0) +
          statTile(bs(s.ingreso_licencias), "Ingreso mensual estimado por licencias", "#/licencias", "ok", "i-key") +
          statTile(bs(s.cobrado_mes), "Cobrado este mes (Premium)", "#/pagos", "ok", "i-card") +
          "</div>";
        h += '<div class="cols-21" style="margin-top:24px"><section class="card"><div class="card-h"><h2>Laboratorios</h2><a href="#/laboratorios">Ver todos</a></div><div class="list">' +
          (d.laboratorios.map(function (l) { return "<div>" + '<span class="thumb-ph">' + ic("i-cube") + '</span><div class="grow"><b>' + esc(l.nombre) + "</b><span>" + esc(l.carreras || "Sin carreras") + " · " + l.practicas + " prácticas</span></div>" + pill(L.lab, l.estado) + "</div>"; }).join("") || emptyBox("Sin laboratorios", "", "i-cube")) +
          '</div></section><section class="card"><div class="card-h"><h2>Últimas solicitudes</h2><a href="#/solicitudes">Ver todas</a></div><div class="list">' +
          (d.solicitudes.map(function (x) { return "<div>" + av(x.institucion || x.nombre) + '<div class="grow"><b>' + esc(x.institucion || x.nombre) + "</b><span>" + esc(x.tipo || "") + " · " + fdate(x.creado_en) + "</span></div>" + pill(L.sol, x.estado) + "</div>"; }).join("") || emptyBox("Sin solicitudes", "", "i-inbox")) +
          "</div></section></div>";
      } else if (d.rol === "docente") {
        h += hero({ kicker: "Panel docente", title: saludo() + ", " + ME.nombre, img: "img/doctora-vr.webp",
          text: "Tienes " + esc(s.clases_activas) + (+s.clases_activas === 1 ? " clase activa" : " clases activas") + " y " + esc(s.estudiantes) + " estudiantes. Asígnales laboratorios y sigue su avance aquí.",
          actions: '<a class="btn btn-white btn-sm" href="#/clases">' + ic("i-layers") + 'Mis clases</a><a class="btn btn-glass btn-sm" href="#/laboratorios">' + ic("i-cube") + "Laboratorios</a>",
          badge: ic("i-star") + "<span>Promedio de tus estudiantes <b>" + (s.promedio != null ? esc(s.promedio) : "—") + "</b></span>" });
        h += '<div class="stats">' + statTile(s.clases_activas, "Clases activas", "#/clases", "vio", "i-layers") + statTile(s.estudiantes, "Estudiantes", null, "ar", "i-users") +
          statTile(s.practicas, "Prácticas registradas", null, "ok", "i-chart") + statTile(s.promedio, "Puntaje promedio", null, "warn", "i-star", s.promedio != null ? "/100" : "") + "</div>";
        h += '<div class="cols-2" style="margin-top:24px"><section class="card"><div class="card-h"><h2>Mis clases</h2><a href="#/clases">Ver todas</a></div><div class="list">' +
          (d.clases.map(function (k) { return '<div><span class="thumb-ph">' + ic("i-layers") + '</span><div class="grow"><a href="#/clases/' + k.id + '">' + esc(k.nombre) + "</a><span>" + esc(k.carrera) + " · " + k.inscritos + " estudiantes · " + k.practicas + " prácticas</span></div>" + (k.promedio != null ? bar(k.promedio) + '<span class="score">' + k.promedio + "</span>" : pill(L.clase, k.estado)) + "</div>"; }).join("") || emptyBox("Aún no tienes clases", " Crea la primera desde Mis clases.", "i-layers")) +
          '</div></section><section class="card"><div class="card-h"><h2>Prácticas recientes</h2></div><div class="list">' +
          (d.recientes.map(function (p) { return "<div>" + av(p.estudiante) + '<div class="grow"><b>' + esc(p.estudiante) + "</b><span>" + esc(p.laboratorio) + " · " + fdt(p.realizada_en) + "</span></div>" + (p.puntaje != null ? '<span class="score">' + p.puntaje + "</span>" : pill(DONE, +p.completada)) + "</div>"; }).join("") || emptyBox("Sin prácticas todavía", "", "i-chart")) +
          "</div></section></div>";
      } else {
        var indep = d.tipo === "independiente";
        h += hero({ kicker: indep ? (d.premium ? "Plan Premium" : "Plan Gratis") : (d.carrera || "Estudiante"), title: saludo() + ", " + ME.nombre, img: "img/estudiante-visor.webp",
          text: indep ? (d.premium ? "Tu plan Premium está activo hasta el " + fdate(d.premium.fecha_fin) + ". Todo el catálogo está abierto para ti." : "Practica con los laboratorios 3D y libros AR de muestra. Con Premium abres todo el catálogo.")
            : "Tus laboratorios en 3D y libros en Realidad Aumentada, listos para practicar cuando quieras.",
          actions: '<a class="btn btn-white btn-sm" href="#/laboratorios">' + ic("i-cube") + 'Laboratorios 3D</a><a class="btn btn-glass btn-sm" href="#/libros">' + ic("i-book") + "Libros AR</a>" +
            (indep && !d.premium ? '<a class="btn btn-glass btn-sm" href="#/plan">' + ic("i-star") + "Pasarme a Premium</a>" : ""),
          badge: ic("i-check") + "<span>Prácticas completadas <b>" + esc(s.completadas) + "</b></span>" });
        h += '<div class="stats">' + (!indep ? statTile(s.clases, "Mis clases", "#/clases", "ink", "i-layers") : "") +
          statTile(s.laboratorios, "Laboratorios 3D", "#/laboratorios", "vio", "i-cube") + statTile(s.libros, "Libros AR", "#/libros", "ar", "i-book") +
          statTile(s.practicas, "Prácticas", "#/practicas", "ok", "i-chart") + statTile(s.promedio, "Puntaje promedio", null, "warn", "i-star", s.promedio != null ? "/100" : "") + "</div>";
        if (d.pendientes.length) {
          h += '<section class="card" style="margin-top:24px"><div class="card-h"><h2>Laboratorios que te asignaron</h2></div><div class="list">' + d.pendientes.map(function (p) {
            return '<div><span class="thumb-ph">' + ic("i-cube") + '</span><div class="grow"><b>' + esc(p.laboratorio) + "</b><span>" + esc(p.clase) + (p.fecha_limite ? " · hasta el " + fdate(p.fecha_limite) : "") + " · " + p.intentos + (+p.intentos === 1 ? " práctica" : " prácticas") + (p.mejor != null ? " · mejor puntaje " + p.mejor : "") + '</span></div><a class="btn btn-brand btn-sm" href="#/laboratorios/' + p.laboratorio_id + '">Abrir</a></div>';
          }).join("") + "</div></section>";
        }
        h += '<section class="card" style="margin-top:18px"><div class="card-h"><h2>Prácticas recientes</h2><a href="#/practicas">Ver todas</a></div><div class="list">' +
          (d.recientes.map(function (p) { return '<div><span class="thumb-ph">' + ic("i-cube") + '</span><div class="grow"><b>' + esc(p.laboratorio) + "</b><span>" + fdt(p.realizada_en) + (p.duracion_min ? " · " + p.duracion_min + " min" : "") + " · " + p.modalidad + "</span></div>" + (p.puntaje != null ? '<span class="score">' + p.puntaje + "</span>" : pill(DONE, +p.completada)) + "</div>"; }).join("") || emptyBox("Aún no registras prácticas", " Abre un laboratorio para empezar.", "i-cube")) + "</div></section>";
      }
      page.innerHTML = h;
    }).catch(function (e) { page.innerHTML = emptyBox("No se pudo cargar el resumen", " " + e.message); });
  }

  /* ---------- Detalle de clase ---------- */
  function viewClase(id) {
    page.innerHTML = '<div class="loading">Cargando…</div>';
    api("GET", "clases/" + id).then(function (d) {
      var k = d.item, manage = ME.rol === "admin" || ME.rol === "docente";
      setCrumb('<a href="#/clases">' + (ME.rol === "admin" ? "Clases" : "Mis clases") + "</a> / " + esc(k.nombre));
      page.innerHTML = '<div class="ph"><div><h1>' + esc(k.nombre) + '</h1><p><span class="pills">' + pill(L.clase, k.estado) + (k.codigo ? '<span class="pill">' + esc(k.codigo) + "</span>" : "") + "</span></p></div>" +
        (manage ? '<div class="ph-actions"><button class="btn btn-line btn-sm" id="edK">' + ic("i-edit") + 'Editar</button><button class="btn btn-line btn-sm" id="delK">' + ic("i-trash") + "Eliminar</button></div>" : "") + "</div>" +
        '<div class="card card-pad"><dl class="dl">' +
        [["Carrera", k.carrera + (ME.rol === "admin" ? " · " + (k.universidad_sigla || k.universidad) : "")], ["Docente", k.docente || "Sin asignar"], ["Periodo", k.periodo], ["Horario", k.horario || "—"], ["Aula", k.aula || "—"], ["Inscritos", k.inscritos + (k.cupo ? " de " + k.cupo : "")]]
          .concat(ME.rol === "estudiante" ? [["Mi estado", L.insc[k.mi_estado] ? L.insc[k.mi_estado][0] + (k.mi_nota != null ? " · nota " + k.mi_nota : "") : "—"]] : [])
          .map(function (x) { return "<div><dt>" + x[0] + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl>" +
        (k.descripcion ? '<p style="margin-top:14px;color:var(--ink-2)">' + esc(k.descripcion) + "</p>" : "") + "</div>" +
        '<div class="tabs" role="tablist" style="margin-top:22px">' + (manage ? '<button role="tab" aria-selected="true" data-tab="est">Estudiantes</button>' : "") +
        '<button role="tab" aria-selected="' + !manage + '" data-tab="lab">Laboratorios</button></div><div id="tabBody"></div>';
      var tabBody = $("#tabBody");
      function showTab(t) { $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === t)); }); (t === "est" ? tabEst : tabLab)(); }
      $$("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });

      function tabEst() {
        tabBody.innerHTML = '<div class="toolbar"><button class="btn btn-brand btn-sm" id="addEst">' + ic("i-plus") + 'Inscribir estudiante</button><button class="btn btn-line btn-sm" id="sendSiu">Enviar al SIU</button><span class="sub">Integración pendiente · sin envío de notas</span></div><div class="card" id="estBox"><div class="loading">Cargando…</div></div>';
        $("#sendSiu").addEventListener("click",function(){toast("El envío al SIU aún no está conectado. No se enviaron notas.");});
        var list = [];
        function load() {
          api("GET", "clases/" + id + "/inscripciones").then(function (r) {
            list = r.items;
            $("#estBox").innerHTML = table([
              { label: "Estudiante", render: function (x) { return nameCell(x.nombre + " " + x.apellido, x.codigo, "#/seguimiento/estudiantes/"+x.estudiante_id); } },
              { label: "Progreso del curso", render: function(x){return +x.total_labs?progressMeter(Math.round(x.labs_completados*100/x.total_labs),x.labs_completados+" de "+x.total_labs+" laboratorios"):"Sin laboratorios asignados";} },
              { label: "Prácticas", cls: "num", render: function (x) { return num(x.practicas); } },
              { label: "Promedio", render: function (x) { return x.promedio != null ? '<span style="display:inline-flex;gap:8px;align-items:center">' + bar(x.promedio) + "<b>" + x.promedio + "</b></span>" : "—"; } },
              { label: "Última práctica", render: function (x) { return fdate(x.ultima_practica); } },
              { label: "Estado", render: function (x) { return pill(L.insc, x.estado); } },
              { label: "Nota", cls: "num", render: function (x) { return num(x.nota_final); } }
            ], list, function (x) {
              return '<button class="ibtn" data-ei="' + x.id + '" aria-label="Editar estado y nota">' + ic("i-edit") + '</button><button class="ibtn del" data-di="' + x.id + '" aria-label="Quitar de la clase">' + ic("i-trash") + "</button>";
            }) || emptyBox("Sin estudiantes inscritos", " Inscribe al primero con el botón de arriba.");
          }).catch(fail);
        }
        $("#addEst").addEventListener("click", function () {
          var taken = list.filter(function (x) { return x.estado !== "retirado"; }).map(function (x) { return +x.estudiante_id; });
          var opts = (OPTS.estudiantes || []).filter(function (e) { return +e.universidad_id === +k.universidad_id && taken.indexOf(+e.id) < 0; })
            .sort(function (a, b) { return (+b.carrera_id === +k.carrera_id) - (+a.carrera_id === +k.carrera_id); })
            .map(function (e) { return [e.id, e.nombre + " · " + e.codigo, e.carrera]; });
          openForm({ title: "Inscribir estudiante", small: true, submitLabel: "Inscribir",
            fields: [{ k: "estudiante_id", label: "Estudiante", type: "select", req: true, full: true, opts: function () { return opts; }, hint: opts.length ? "Primero aparecen los de la carrera de esta clase." : "No hay más estudiantes de esta institución." }],
            submit: function (data) { return api("POST", "clases/" + id + "/inscripciones", data).then(function () { return "Estudiante inscrito."; }); },
            done: load });
        });
        $("#estBox").addEventListener("click", function (e) {
          var ei = e.target.closest("[data-ei]"), di = e.target.closest("[data-di]");
          if (ei) {
            var x = list.filter(function (y) { return +y.id === +ei.dataset.ei; })[0];
            openForm({ title: x.nombre + " " + x.apellido, small: true, values: x,
              fields: [{ k: "estado", label: "Estado", type: "select", req: true, opts: function () { return pairs(L.insc); } }, { k: "nota_final", label: "Nota final (0 a 100)", type: "number", step: "0.01" }],
              submit: function (data) { return api("PUT", "clases/" + id + "/inscripciones/" + x.id, data); }, done: load });
          }
          if (di) {
            confirmBox("Quitar de la clase", "El estudiante dejará de ver esta clase. Sus prácticas se conservan.", "Quitar", true).then(function (yes) {
              if (yes) return api("DELETE", "clases/" + id + "/inscripciones/" + di.dataset.di).then(function () { toast("Estudiante quitado."); load(); });
            }).catch(fail);
          }
        });
        load();
      }

      function tabLab() {
        tabBody.innerHTML = (manage ? '<div class="toolbar"><button class="btn btn-brand btn-sm" id="addLab">' + ic("i-plus") + "Asignar laboratorio</button></div>" : "") + '<div id="labBox"><div class="loading">Cargando…</div></div>';
        var list = [];
        function load() {
          api("GET", "clases/" + id + "/laboratorios").then(function (r) {
            list = r.items;
            if (!list.length) { $("#labBox").innerHTML = '<div class="card">' + emptyBox("Sin laboratorios asignados", manage ? " Asigna los laboratorios que deben practicar en esta clase." : "") + "</div>"; return; }
            if (manage) {
              $("#labBox").innerHTML = '<div class="card">' + table([
                { label: "Laboratorio", render: function (x) { return nameCell(x.nombre, x.equipo, "#/laboratorios/" + x.id); } },
                { label: "Estado", render: function (x) { return pill(L.lab, x.estado); } },
                { label: "Modalidad", render: modal3d },
                { label: "Fecha límite", render: function (x) { return fdate(x.fecha_limite); } }
              ], list, function (x) { return '<button class="ibtn" data-el="' + x.id + '" aria-label="Cambiar fecha límite">' + ic("i-edit") + '</button><button class="ibtn del" data-dl="' + x.id + '" aria-label="Quitar">' + ic("i-trash") + "</button>"; }) + "</div>";
            } else {
              $("#labBox").innerHTML = '<div class="gcards">' + list.map(function (x) {
                return '<article class="lcard"><div class="lmedia">' + ic("i-cube") + '<span class="pills">' + modal3d(x).replace(/<\/?span class="pills">/g, "") + '</span></div><div class="lbody"><h3>' + esc(x.nombre) + '</h3><p class="meta">' +
                  (x.fecha_limite ? "Hasta el " + fdate(x.fecha_limite) + " · " : "") + x.mis_practicas + (+x.mis_practicas === 1 ? " práctica" : " prácticas") + (x.mi_mejor_puntaje != null ? " · mejor " + x.mi_mejor_puntaje : "") +
                  '</p><div class="gap"></div><a class="btn btn-brand btn-sm" href="#/laboratorios/' + x.id + '">' + ic("i-cube") + "Abrir en 3D</a></div></article>";
              }).join("") + "</div>";
            }
          }).catch(fail);
        }
        function assign(x) {
          var opts = (OPTS.laboratorios || []).filter(function (l) { return ids(l.carrera_ids).indexOf(+k.carrera_id) > -1; })
            .map(function (l) { return [l.id, l.nombre + (l.estado !== "publicado" ? " (" + L.lab[l.estado][0].toLowerCase() + ")" : "")]; });
          openForm({ title: x ? "Cambiar fecha límite" : "Asignar laboratorio", small: true, values: x ? { laboratorio_id: x.id, fecha_limite: x.fecha_limite } : {},
            fields: [
              { k: "laboratorio_id", label: "Laboratorio", type: "select", req: true, full: true, opts: function () { return opts; }, hint: opts.length ? "Solo aparecen los habilitados para la carrera de esta clase." : "Esta carrera aún no tiene laboratorios habilitados." },
              { k: "fecha_limite", label: "Fecha límite (opcional)", type: "date", full: true }
            ],
            submit: function (data) { return api("POST", "clases/" + id + "/laboratorios", data).then(function () { return "Laboratorio asignado."; }); }, done: load });
        }
        if (manage) {
          $("#addLab").addEventListener("click", function () { assign(null); });
          $("#labBox").addEventListener("click", function (e) {
            var el = e.target.closest("[data-el]"), dl = e.target.closest("[data-dl]");
            if (el) assign(list.filter(function (y) { return +y.id === +el.dataset.el; })[0]);
            if (dl) confirmBox("Quitar laboratorio", "Los estudiantes ya no lo verán como tarea de esta clase.", "Quitar", true).then(function (yes) {
              if (yes) return api("DELETE", "clases/" + id + "/laboratorios/" + dl.dataset.dl).then(function () { toast("Laboratorio quitado."); load(); });
            }).catch(fail);
          });
        }
        load();
      }

      if (manage) {
        $("#edK").addEventListener("click", function () {
          openForm({ title: "Editar clase", fields: RES.clases.fields(false), values: k,
            submit: function (data) { return api("PUT", "clases/" + id, data); }, done: function () { viewClase(id); } });
        });
        $("#delK").addEventListener("click", function () {
          confirmBox("Eliminar clase", RES.clases.delMsg(k), "Eliminar", true).then(function (yes) {
            if (yes) return api("DELETE", "clases/" + id).then(function () { toast("Clase eliminada."); location.hash = "#/clases"; });
          }).catch(fail);
        });
      }
      showTab(manage ? "est" : "lab");
    }).catch(function (e) { page.innerHTML = emptyBox("No se pudo abrir la clase", " " + e.message); });
  }

  /* Lista de clases del estudiante (solo lectura) */
  function viewMisClases() {
    page.innerHTML = '<div class="ph"><div><h1>Mis clases</h1><p>Las clases en las que estás inscrito y sus laboratorios.</p></div></div><div class="card" id="box"><div class="loading">Cargando…</div></div>';
    api("GET", "clases").then(function (d) {
      $("#box").innerHTML = table([
        { label: "Clase", render: function (r) { return nameCell(r.nombre, r.codigo, "#/clases/" + r.id); } },
        { label: "Docente", render: function (r) { return esc(r.docente || "—"); } },
        { label: "Horario", render: function (r) { return esc(r.horario || "—"); } },
        { label: "Laboratorios", render: function (r) { return esc(r.laboratorios || "—"); } },
        { label: "Mi estado", render: function (r) { return pill(L.insc, r.mi_estado) + (r.mi_nota != null ? '<span class="sub">Nota ' + esc(r.mi_nota) + "</span>" : ""); } }
      ], d.items) || emptyBox("Aún no estás inscrito en clases", " Tu docente te inscribirá.");
    }).catch(fail);
  }

  /* ---------- Laboratorios y libros (tarjetas) ---------- */
  function viewCards(kind) {
    var lab = kind === "lab", route = lab ? "laboratorios" : "libros";
    var intro = lab
      ? (ME.rol === "docente" ? "Los laboratorios habilitados para tus carreras. Asígnalos a tus clases desde cada clase." : isIndep() ? "Laboratorios en 3D para practicar por tu cuenta, desde el navegador." : "Los laboratorios de tu carrera, en 3D desde el navegador. Pronto también en Realidad Virtual.")
      : "Apunta la cámara de tu celular a las páginas del libro y un personaje 3D te explica cada tema. Al final de cada tema hay un quiz.";
    page.innerHTML = '<div class="ph"><div><span class="eyebrow' + (lab ? "" : " ar") + '">' + ic(lab ? "i-cube" : "i-scan") + (lab ? "Laboratorios 3D" : "Realidad Aumentada") + "</span><h1>" + (lab ? "Laboratorios" : "Libros AR") + "</h1><p>" + intro + "</p></div></div>" +
      '<div class="toolbar"><div class="search">' + ic("i-search") + '<input class="inp" type="search" id="q" placeholder="Buscar" aria-label="Buscar"></div></div>' +
      (isIndep() && !ME.premium_hasta ? '<div style="margin-bottom:18px">' + note("ar", "Los contenidos con candado son parte del plan <b>Premium</b>. <a href=\"#/plan\">Ver planes</a>", "i-lock") + "</div>" : "") +
      '<div id="box"><div class="loading">Cargando…</div></div>';
    function load(q) {
      api("GET", route + (q ? "&q=" + encodeURIComponent(q) : "")).then(function (d) {
        $("#box").innerHTML = d.items.length ? '<div class="gcards">' + d.items.map(function (r) { return lab ? labCard(r) : bookCard(r); }).join("") + "</div>"
          : '<div class="card">' + emptyBox(lab ? "Todavía no hay laboratorios para ti" : "Todavía no hay libros para ti", q ? " Prueba con otra búsqueda." : " Cuando ORBIT publique uno para tu carrera aparecerá aquí.", lab ? "i-cube" : "i-book") + "</div>";
      }).catch(fail);
    }
    $("#q").addEventListener("input", debounce(function (e) { load(e.target.value.trim()); }, 250));
    load("");
  }
  function media(r, book) {
    var img = book ? r.portada_url : r.imagen_url;
    var badges = book ? '<span class="pill ar nodot">' + ic("i-scan") + "AR</span>" : '<span class="pill vio nodot">' + ic("i-cube") + "3D</span>" + (+r.vr_disponible ? '<span class="pill nodot">' + ic("i-vr") + "VR</span>" : "");
    if (ME.rol === "docente" && r.estado !== "publicado") badges += pill(book ? L.libro : L.lab, r.estado);
    return '<div class="lmedia' + (book ? " book" : "") + (img ? " has-img" : "") + '">' + ic(book ? "i-book" : "i-cube") + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : "") +
      '<span class="pills">' + badges + "</span>" +
      (+r.bloqueado ? '<span class="lock">' + ic("i-lock") + "Premium</span>" : (isIndep() && +r.gratis ? '<span class="lock free">Gratis</span>' : "")) + "</div>";
  }
  function labCard(r) {
    var open = !+r.bloqueado && r.estado === "publicado";
    var btn = +r.bloqueado ? '<a class="btn btn-ink btn-sm" href="#/plan">' + ic("i-lock") + "Desbloquear</a>"
      : open ? '<a class="btn btn-brand btn-sm" href="#/laboratorios/' + r.id + '">' + ic("i-cube") + "Abrir en 3D</a>" : '<span class="pill">Aún no publicado</span>';
    var prog = isStudent() && +r.mis_practicas ? r.mis_practicas + (+r.mis_practicas === 1 ? " práctica" : " prácticas") + (r.mi_mejor_puntaje != null ? " · mejor " + r.mi_mejor_puntaje : "") : "";
    return '<article class="lcard' + (+r.bloqueado ? " locked" : "") + '">' + media(r) + '<div class="lbody"><span class="meta">' + esc([r.area, r.equipo].filter(Boolean).join(" · ")) + "</span>" +
      "<h3>" + (open ? '<a href="#/laboratorios/' + r.id + '">' + esc(r.nombre) + "</a>" : esc(r.nombre)) + "</h3>" + (r.descripcion ? "<p>" + esc(r.descripcion) + "</p>" : "") +
      '<div class="gap"></div><div class="lfoot">' + btn + '<span class="prog">' + esc(prog) + "</span></div></div></article>";
  }
  function temasDe(r) { return String(r.temas || "").split(/\r?\n/).map(function (t) { return t.trim(); }).filter(Boolean); }
  function bookCard(r) {
    var n = temasDe(r).length;
    var btn = +r.bloqueado ? '<a class="btn btn-ink btn-sm" href="#/plan">' + ic("i-lock") + "Desbloquear</a>"
      : '<a class="btn btn-ar btn-sm" href="#/libros/' + r.id + '">' + ic("i-scan") + "Usar en AR</a>";
    return '<article class="lcard' + (+r.bloqueado ? " locked" : "") + '">' + media(r, true) + '<div class="lbody"><span class="meta">' + esc([r.materia, r.autor].filter(Boolean).join(" · ")) + "</span>" +
      "<h3>" + (+r.bloqueado ? esc(r.titulo) : '<a href="#/libros/' + r.id + '">' + esc(r.titulo) + "</a>") + "</h3>" + (r.descripcion ? "<p>" + esc(r.descripcion) + "</p>" : "") +
      '<div class="gap"></div><div class="lfoot">' + btn + '<span class="prog">' + (n ? n + (n === 1 ? " tema" : " temas") : "") + "</span></div></div></article>";
  }

  /* ---------- Visor 3D de un laboratorio ---------- */
  var viewerLoaded = false;
  function loadViewer() {
    if (viewerLoaded || window.customElements && customElements.get("model-viewer")) return;
    viewerLoaded = true;
    var s = document.createElement("script"); s.type = "module"; s.src = VIEWER_SRC; document.head.appendChild(s);
  }
  function lockedBox(what) {
    return '<div class="card">' + emptyBox(what + " es parte del plan Premium", " Con Premium abres todos los laboratorios 3D y libros AR del catálogo.", "i-lock") + '<p style="text-align:center;padding-bottom:30px"><a class="btn btn-brand" href="#/plan">' + ic("i-star") + "Ver planes</a></p></div>";
  }
  function viewLab(id) {
    page.innerHTML = '<div class="loading">Cargando…</div>';
    api("GET", "laboratorios/" + id).then(function (d) {
      var r = d.item;
      setCrumb('<a href="#/laboratorios">Laboratorios</a> / ' + esc(r.nombre));
      if (+r.bloqueado) { page.innerHTML = lockedBox("Este laboratorio"); return; }
      var unitySimulator = /^simuladores\/[a-z0-9_-]+\/index\.html$/.test(r.modelo_url || "");
      if (r.modelo_url && !unitySimulator) loadViewer();
      var stage = unitySimulator
        ? '<iframe src="' + esc(r.modelo_url) + '" title="Simulador Unity: ' + esc(r.nombre) + '" allow="fullscreen"></iframe><a class="btn btn-line btn-sm" href="' + esc(r.modelo_url) + '" target="_blank" rel="noopener">Abrir simulador en ventana completa</a>'
        : r.modelo_url
        ? '<model-viewer src="' + esc(r.modelo_url) + '" alt="Modelo 3D de ' + esc(r.nombre) + '" camera-controls touch-action="pan-y" auto-rotate shadow-intensity="1" exposure="1" interaction-prompt="auto"></model-viewer><span class="hint3d">Arrastra para girar · rueda o pellizco para acercar</span>'
        : '<div class="ph3d">' + (r.imagen_url ? '<img src="' + esc(r.imagen_url) + '" alt="">' : "") + "<div>" + ic("i-cube") + "<b>El modelo 3D está en preparación</b><p>Cuando el equipo de ORBIT lo publique, lo verás aquí para girarlo y explorarlo.</p></div></div>";
      var practice = "";
      if (isStudent()) {
        practice = '<div class="card card-pad" style="margin-top:16px"><h2 class="h-sec" style="margin:0 0 8px">Tu práctica</h2><p style="color:var(--ink-2);font-size:14.5px">Tiempo en este laboratorio</p><p class="timer" id="timer">0:00</p>' +
          '<form id="prForm" class="fg" style="margin-top:14px">' +
          (r.clases && r.clases.length ? '<div class="fld full"><label for="prClase">Clase</label><select id="prClase"><option value="">Práctica libre</option>' + r.clases.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nombre) + (c.fecha_limite ? " (hasta el " + fdate(c.fecha_limite) + ")" : "") + "</option>"; }).join("") + "</select></div>" : "") +
          '<div class="fld full"><label class="chk"><input type="checkbox" id="prDone" checked>Completé el recorrido</label></div>' +
          '<div class="fld full"><button class="btn btn-brand" type="submit">' + ic("i-check") + "Guardar práctica</button></div></form>" +
          '<p style="margin-top:10px;font-size:13.5px;color:var(--ink-3)">' + (+r.mis_practicas ? "Llevas " + r.mis_practicas + (+r.mis_practicas === 1 ? " práctica" : " prácticas") + " en este laboratorio." : "Aún no registras prácticas aquí.") + "</p></div>";
      }
      page.innerHTML = '<div class="ph"><div><span class="eyebrow">' + ic("i-cube") + "Laboratorio 3D</span><h1>" + esc(r.nombre) + "</h1><p>" + esc([r.area, r.equipo].filter(Boolean).join(" · ")) + "</p></div>" +
        '<div class="ph-actions"><a class="btn btn-line btn-sm" href="#/laboratorios">' + ic("i-back") + "Volver</a></div></div>" +
        '<div class="viewer' + (unitySimulator ? ' unity-viewer' : '') + '"><div class="stage' + (unitySimulator ? ' unity-stage' : '') + '">' + stage + "</div><aside>" +
        '<div class="card card-pad"><span class="pills"><span class="pill vio nodot">' + ic("i-cube") + "3D en el navegador</span>" + (+r.vr_disponible ? '<span class="pill ok nodot">' + ic("i-vr") + "También en visor VR</span>" : '<span class="pill nodot">' + ic("i-vr") + "VR próximamente</span>") + "</span>" +
        (r.descripcion ? '<p style="margin-top:14px">' + esc(r.descripcion) + "</p>" : "") +
        '<dl class="dl" style="margin-top:16px"><div><dt>Carreras</dt><dd>' + esc(r.carreras || "—") + "</dd></div>" + (ME.rol !== "estudiante" ? "<div><dt>Estado</dt><dd>" + pill(L.lab, r.estado) + "</dd></div>" : "") + "</dl></div>" +
        practice + "</aside></div>";
      if (isStudent()) {
        var start = Date.now(), timer = $("#timer");
        var iv = setInterval(function () { var s = Math.floor((Date.now() - start) / 1000); timer.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }, 1000);
        cleanup.push(function () { clearInterval(iv); });
        $("#prForm").addEventListener("submit", function (e) {
          e.preventDefault();
          var btn = $('[type="submit"]', e.target), cl = $("#prClase");
          btn.setAttribute("aria-busy", "true");
          api("POST", "practicas", { laboratorio_id: r.id, clase_id: cl && cl.value ? +cl.value : null, modalidad: "3D", duracion_min: Math.max(1, Math.round((Date.now() - start) / 60000)), completada: $("#prDone").checked })
            .then(function () { toast("Práctica guardada."); start = Date.now(); r.mis_practicas = (+r.mis_practicas || 0) + 1; })
            .catch(fail).then(function () { btn.removeAttribute("aria-busy"); });
        });
      }
    }).catch(function (e) { page.innerHTML = '<div class="card">' + emptyBox("No se pudo abrir el laboratorio", " " + e.message, "i-cube") + "</div>"; });
  }

  /* ---------- Libro AR ---------- */
  function viewLibro(id) {
    page.innerHTML = '<div class="loading">Cargando…</div>';
    api("GET", "libros/" + id).then(function (d) {
      var r = d.item, temas = temasDe(r), res = r.resultados || [];
      setCrumb('<a href="#/libros">Libros AR</a> / ' + esc(r.titulo));
      if (+r.bloqueado) { page.innerHTML = lockedBox("Este libro"); return; }
      var best = {};
      res.forEach(function (x) { if (best[x.tema] == null || +x.puntaje > best[x.tema]) best[x.tema] = x.puntaje == null ? best[x.tema] || 0 : +x.puntaje; });
      var hechos = temas.filter(function (t) { return best[t] != null; }).length;
      if (r.modelo_url) loadViewer();

      var pasos = '<ol class="steps-n ar">' +
        "<li><div><b>Descarga la app ORBIT AR</b><p>Es la app que reconoce las páginas del libro con la cámara.</p>" + (r.app_url ? '<a class="btn btn-ar btn-sm" href="' + esc(r.app_url) + '" target="_blank" rel="noopener">' + ic("i-phone") + "Descargar la app</a>" : '<span class="pill" style="margin-top:8px">El enlace de la app estará disponible pronto</span>') + "</div></li>" +
        "<li><div><b>Ten el libro a mano</b><p>Usa tu libro impreso, o abre las páginas marcadoras en otra pantalla o imprímelas.</p>" + (r.libro_url ? '<a class="btn btn-line btn-sm" href="' + esc(r.libro_url) + '" target="_blank" rel="noopener">' + ic("i-file") + "Abrir páginas (PDF)</a>" : "") + "</div></li>" +
        "<li><div><b>Apunta la cámara a cada página</b><p>Aparece el personaje en 3D, explica el tema y tú eliges qué preguntas explorar. Al terminar, responde el quiz.</p></div></li></ol>";

      var arNow = r.modelo_url
        ? '<section class="card" style="margin-top:18px"><div class="card-h"><h2>Pruébalo ahora en AR</h2><span class="pill ar nodot">' + ic("i-phone") + "Desde el celular</span></div>" +
          '<div class="card-pad"><div class="stage" style="aspect-ratio:16/10"><model-viewer src="' + esc(r.modelo_url) + '" alt="Personaje 3D de ' + esc(r.titulo) + '" ar ar-modes="webxr scene-viewer quick-look" camera-controls touch-action="pan-y" auto-rotate shadow-intensity="1">' +
          '<button slot="ar-button" class="btn btn-ar btn-sm ar-btn">' + ic("i-scan") + "Ver en mi espacio</button></model-viewer></div>" +
          '<p style="margin-top:10px;font-size:13.5px;color:var(--ink-3)">En el celular, toca «Ver en mi espacio» para colocar el personaje sobre tu mesa. En la computadora puedes girarlo con el mouse.</p></div></section>'
        : "";

      var temasHtml = temas.length ? '<div class="chips-t">' + temas.map(function (t) {
        var done = best[t] != null;
        return '<span class="chip-t' + (done ? " done" : "") + '">' + (done ? ic("i-check") : "") + esc(t) + (done && best[t] ? " <small>" + best[t] + "</small>" : "") + "</span>";
      }).join("") + "</div>" : '<p style="color:var(--ink-3)">Los temas se mostrarán aquí.</p>';

      var quiz = "";
      if (isStudent() && temas.length) {
        quiz = '<section class="card card-pad" style="margin-top:18px"><h2 class="h-sec" style="margin:0 0 6px">Registrar un quiz</h2><p style="color:var(--ink-2);font-size:14.5px">Si la app no lo envió sola, anota tu resultado.</p>' +
          '<form id="qzForm" class="fg" style="margin-top:12px"><div class="fld"><label for="qzTema">Tema</label><select id="qzTema">' + temas.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + "</option>"; }).join("") + "</select></div>" +
          '<div class="fld"><label for="qzPts">Puntaje (0 a 100)</label><input id="qzPts" type="number" min="0" max="100"></div><div class="fld full"><button class="btn btn-ar btn-sm" type="submit">' + ic("i-check") + "Guardar resultado</button></div></form></section>";
      }

      page.innerHTML = '<div class="ph"><div><span class="eyebrow ar">' + ic("i-scan") + "Libro en Realidad Aumentada</span></div>" +
        '<div class="ph-actions"><a class="btn btn-line btn-sm" href="#/libros">' + ic("i-back") + "Volver</a>" + (ME.rol === "admin" ? '<a class="btn btn-line btn-sm" href="#/libros" id="edBook">' + ic("i-edit") + "Editar</a>" : "") + "</div></div>" +
        '<div class="book-hero"><div class="book-cover">' + (r.portada_url ? '<img src="' + esc(r.portada_url) + '" alt="Portada de ' + esc(r.titulo) + '">' : ic("i-book")) + '<span class="pill ar nodot">' + ic("i-scan") + "AR</span></div>" +
        '<div><h1 style="font-size:clamp(28px,3vw,40px);font-stretch:122%;font-weight:770;letter-spacing:-0.035em;line-height:1.02">' + esc(r.titulo) + "</h1>" +
        '<p style="margin-top:8px;color:var(--ink-3);font-weight:600">' + esc([r.autor, r.materia].filter(Boolean).join(" · ")) + "</p>" +
        (r.descripcion ? '<p style="margin-top:14px;color:var(--ink-2);max-width:62ch">' + esc(r.descripcion) + "</p>" : "") +
        '<h2 class="h-sec" style="margin-top:22px">Temas' + (isStudent() && temas.length ? '<span class="pill ok nodot">' + hechos + " de " + temas.length + " con quiz</span>" : "") + "</h2>" + temasHtml + "</div></div>" +
        '<div class="cols-21"><div><section class="card card-pad"><h2 class="h-sec" style="margin:0 0 16px">Cómo usarlo</h2>' + pasos + "</section>" + arNow + "</div><div>" +
        (isStudent() ? '<section class="card"><div class="card-h"><h2>Mis resultados</h2></div><div class="list">' +
          (res.map(function (x) { return '<div><span class="thumb-ph ar">' + ic("i-star") + '</span><div class="grow"><b>' + esc(x.tema) + "</b><span>" + fdt(x.realizado_en) + "</span></div>" + (x.puntaje != null ? '<span class="score">' + x.puntaje + "</span>" : "") + "</div>"; }).join("") || emptyBox("Aún no hay resultados", " Responde el quiz al final de cada tema.", "i-star")) +
          "</div></section>" + quiz
          : '<section class="card card-pad"><dl class="dl" style="grid-template-columns:1fr"><div><dt>Carreras</dt><dd>' + esc(r.carreras || "—") + "</dd></div><div><dt>Estado</dt><dd>" + pill(L.libro, r.estado) + "</dd></div><div><dt>Acceso freemium</dt><dd>" + acceso(r) + "</dd></div></dl></section>") +
        "</div></div>";

      var q = $("#qzForm");
      if (q) q.addEventListener("submit", function (e) {
        e.preventDefault();
        var pts = $("#qzPts").value;
        api("POST", "libros/" + id + "/resultados", { tema: $("#qzTema").value, puntaje: pts === "" ? null : +pts }).then(function () { toast("Resultado guardado."); viewLibro(id); }).catch(fail);
      });
      var eb = $("#edBook");
      if (eb) eb.addEventListener("click", function (e) {
        e.preventDefault();
        openForm({ title: "Editar libro", icon: "i-book", fields: RES.libros.fields(false), values: RES.libros.toForm(r),
          submit: function (data, files) { return api("PUT", "libros/" + id, data).then(function () { return RES.libros.afterSave(id, data, files); }).then(function () { return "Cambios guardados."; }); },
          done: function () { viewLibro(id); } });
      });
    }).catch(function (e) { page.innerHTML = '<div class="card">' + emptyBox("No se pudo abrir el libro", " " + e.message, "i-book") + "</div>"; });
  }

  /* ---------- Prácticas del estudiante ---------- */
  function viewPracticas() {
    page.innerHTML = '<div class="ph"><div><h1>Mis prácticas</h1><p>Todo lo que registraste en los laboratorios.</p></div></div><div class="card" id="box"><div class="loading">Cargando…</div></div>';
    api("GET", "practicas").then(function (d) {
      $("#box").innerHTML = table([
        { label: "Laboratorio", render: function (r) { return nameCell(r.laboratorio, r.clase || "Práctica libre", "#/laboratorios/" + r.laboratorio_id); } },
        { label: "Fecha", render: function (r) { return fdt(r.realizada_en); } },
        { label: "Modalidad", render: function (r) { return '<span class="pill vio">' + esc(r.modalidad) + "</span>"; } },
        { label: "Duración", render: function (r) { return r.duracion_min ? r.duracion_min + " min" : "—"; } },
        { label: "Puntaje", cls: "num", render: function (r) { return num(r.puntaje); } },
        { label: "Estado", render: function (r) { return pill({ 1: ["Completada", "ok"], 0: ["Incompleta", "warn"] }, +r.completada); } }
      ], d.items) || emptyBox("Aún no registras prácticas", " Abre un laboratorio y guarda tu práctica al terminar.");
    }).catch(fail);
  }

  /* ---------- Mi plan (freemium) ---------- */
  function viewPlan() {
    page.innerHTML = '<div class="loading">Cargando…</div>';
    api("GET", "suscripcion").then(function (d) {
      var premium = d.planes.filter(function (p) { return p.codigo === "premium"; })[0], gratis = d.planes.filter(function (p) { return p.codigo === "gratis"; })[0];
      var h = '<div class="ph"><div><span class="eyebrow">' + ic("i-star") + "Versión freemium</span><h1>Mi plan</h1><p>Con Premium abres todos los laboratorios 3D y libros AR del catálogo. Se paga mes a mes, sin contratos.</p></div></div>";
      if (d.actual) h += '<div style="margin-bottom:18px">' + note("ok", "Tu plan <b>Premium</b> está activo hasta el <b>" + fdate(d.actual.fecha_fin) + "</b>. Puedes pagar más meses para extenderlo.", "i-check") + "</div>";
      if (d.pendiente) h += '<div style="margin-bottom:18px">' + note("warn", "Recibimos tu pago de <b>" + bs(d.pendiente.monto) + "</b> (" + esc(METODO[d.pendiente.metodo]) + " " + esc(d.pendiente.referencia) + "). Lo estamos revisando; tu plan se activará apenas lo confirmemos.", "i-info") + "</div>";
      var cur = '<span class="pill ok nodot cur">' + ic("i-check") + "Tu plan</span>";
      var li = function (t) { return "<li>" + ic("i-check") + "<span>" + t + "</span></li>"; };
      h += '<div class="plans-mini">' +
        (gratis ? '<div class="pm">' + (!d.actual ? cur : "") + "<h3>" + esc(gratis.nombre) + '</h3><p class="price"><b>Bs 0</b><span>siempre</span></p><p>' + esc(gratis.descripcion || "") + "</p><ul>" + li("Laboratorios 3D de muestra") + li("Libros AR de muestra") + li("Registro de tus prácticas") + "</ul></div>" : "") +
        (premium ? '<div class="pm prem">' + (d.actual ? cur : "") + "<h3>" + esc(premium.nombre) + '</h3><p class="price"><b>' + bs(premium.precio_mes) + "</b><span>al mes</span></p><p>" + esc(premium.descripcion || "") + "</p><ul>" + li("Todos los laboratorios 3D del catálogo") + li("Todos los libros AR con sus quiz") + li("Nuevos contenidos cada mes") + "</ul></div>" : "") + "</div>";
      if (premium && !d.pendiente) {
        h += '<h2 class="h-sec">' + (d.actual ? "Extender Premium" : "Pasarme a Premium") + '</h2><div class="card card-pad"><div class="cols-2"><div>' +
          '<ol class="steps-n"><li><div><b>Paga por QR o transferencia</b><p>A nombre de ' + esc(PAGO_INFO.titular) + ".</p>" +
          '<div style="display:flex;gap:18px;align-items:center;margin-top:14px;flex-wrap:wrap">' + (PAGO_INFO.qr ? '<img src="' + esc(PAGO_INFO.qr) + '" alt="QR de pago de ORBIT" width="140" height="140" style="border-radius:16px">' : '<div class="qr">Aquí va el QR de cobro de ORBIT</div>') +
          '<dl class="dl" style="grid-template-columns:1fr"><div><dt>Banco</dt><dd>' + esc(PAGO_INFO.banco) + "</dd></div><div><dt>Cuenta</dt><dd>" + esc(PAGO_INFO.cuenta) + "</dd></div></dl></div></div></li></ol></div>" +
          '<form id="payForm" class="fg" style="align-content:start"><ol class="steps-n full" start="2" style="counter-reset:st 1"><li><div><b>Cuéntanos tu pago</b><p>Lo revisamos y activamos tu plan.</p></div></li></ol>' +
          '<div class="fld"><label for="pMeses">Meses</label><select id="pMeses">' + [1, 3, 6, 12].map(function (m) { return '<option value="' + m + '">' + m + (m === 1 ? " mes" : " meses") + " · " + bs(premium.precio_mes * m) + "</option>"; }).join("") + "</select></div>" +
          '<div class="fld"><label for="pMetodo">Método</label><select id="pMetodo"><option value="qr">QR</option><option value="transferencia">Transferencia</option></select></div>' +
          '<div class="fld full"><label for="pRef">Número de transacción <span class="req">*</span></label><input id="pRef" maxlength="80" placeholder="Lo encuentras en el comprobante"><span class="err" hidden></span></div>' +
          '<div class="fld full"><button class="btn btn-brand" type="submit">Enviar pago para revisión</button></div></form></div></div>';
      }
      if (d.pagos.length) {
        h += '<h2 class="h-sec">Mis pagos</h2><div class="card">' + table([
          { label: "Fecha", render: function (p) { return fdt(p.creado_en); } },
          { label: "Monto", render: function (p) { return bs(p.monto) + '<span class="sub">' + p.meses + (+p.meses === 1 ? " mes" : " meses") + "</span>"; } },
          { label: "Pago", render: function (p) { return esc(METODO[p.metodo]) + '<span class="sub">' + esc(p.referencia || "") + "</span>"; } },
          { label: "Estado", render: function (p) { return pill(L.pago, p.estado); } }
        ], d.pagos) + "</div>";
      }
      page.innerHTML = h;
      var f = $("#payForm");
      if (f) f.addEventListener("submit", function (e) {
        e.preventDefault();
        var ref = $("#pRef"), err = $(".err", ref.parentNode), btn = $('[type="submit"]', f);
        err.hidden = true; ref.removeAttribute("aria-invalid");
        if (!ref.value.trim()) { err.textContent = "Escribe el número de transacción."; err.hidden = false; ref.setAttribute("aria-invalid", "true"); ref.focus(); return; }
        btn.setAttribute("aria-busy", "true");
        api("POST", "suscripcion/pago", { meses: +$("#pMeses").value, metodo: $("#pMetodo").value, referencia: ref.value.trim() })
          .then(function () { toast("Pago enviado. Te avisaremos al confirmarlo."); viewPlan(); })
          .catch(function (x) { btn.removeAttribute("aria-busy"); fail(x); });
      });
    }).catch(function (e) { page.innerHTML = emptyBox("No se pudo cargar tu plan", " " + e.message); });
  }

  /* ---------- Importar listas ---------- */
  var IMPORT = {
    estudiantes: { label: "Estudiantes", req: ["nombre", "apellido", "email", "codigo", "carrera"], cols: ["nombre", "apellido", "email", "codigo", "carrera", "semestre", "telefono"],
      help: "Una fila por estudiante. Cada uno recibe una contraseña inicial que podrás descargar al terminar." },
    laboratorios: { label: "Laboratorios pedidos", req: ["nombre"], cols: ["nombre", "carreras", "equipo", "descripcion", "area"],
      help: "Una fila por laboratorio. En «carreras» separa varias con punto y coma o barra (Medicina | Enfermería). Entran como «Solicitado»." },
    carreras: { label: "Carreras", req: ["nombre"], cols: ["nombre", "codigo", "area", "duracion_semestres"], help: "Una fila por carrera." }
  };
  var ALIAS = {
    nombre: ["nombre", "nombres", "laboratorio", "carrera_nombre", "name"], apellido: ["apellido", "apellidos", "last_name"],
    email: ["email", "correo", "correo_electronico", "e_mail", "mail"], codigo: ["codigo", "cod", "codigo_estudiante", "matricula", "registro", "ru"],
    carrera: ["carrera", "programa"], carreras: ["carreras", "carrera", "para_carreras"], semestre: ["semestre", "sem", "nivel"],
    telefono: ["telefono", "celular", "cel", "whatsapp"], equipo: ["equipo", "marca", "modelo"], descripcion: ["descripcion", "detalle", "notas", "objetivo"],
    area: ["area"], duracion_semestres: ["duracion_semestres", "duracion", "semestres"]
  };
  function normH(s) { return String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    var first = text.split(/\r?\n/)[0] || "", counts = [";", ",", "\t"].map(function (d) { return [d, first.split(d).length]; }).sort(function (a, b) { return b[1] - a[1]; });
    var d = counts[0][0], rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === d) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ""; }); });
  }
  function readFileText(file) {
    return file.arrayBuffer().then(function (buf) {
      try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { return new TextDecoder("windows-1252").decode(buf); } // Excel en Windows guarda en ANSI
    });
  }
  function downloadCSV(name, header, rows) {
    var csv = "﻿" + [header].concat(rows).map(function (r) { return r.map(function (x) { x = String(x == null ? "" : x); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(";"); }).join("\r\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function viewImportar() {
    var tipo = "estudiantes", filas = [];
    page.innerHTML = '<div class="ph"><div><span class="eyebrow">' + ic("i-upload") + 'Piloto e instituciones</span><h1>Importar listas</h1><p>Carga las listas que te envía cada institución (por ejemplo, Univalle para el piloto): estudiantes con su carrera, carreras y los laboratorios que piden.</p></div></div>' +
      '<div class="card card-pad steps-imp">' +
      '<div class="fg"><div class="fld"><label for="impTipo">Qué vas a importar</label><select id="impTipo">' + Object.keys(IMPORT).map(function (k) { return '<option value="' + k + '">' + IMPORT[k].label + "</option>"; }).join("") + "</select></div>" +
      '<div class="fld"><label for="impUni">Institución</label><select id="impUni"><option value="">Elige…</option>' + optUnis().map(function (u) { return '<option value="' + u[0] + '">' + esc(u[1]) + "</option>"; }).join("") + "</select></div>" +
      '<div class="fld full"><label class="chk"><input type="checkbox" id="impCrear" checked>Crear las carreras que no existan</label></div></div>' +
      '<div class="note" id="impHelpBox">' + ic("i-info") + '<div id="impHelp"></div></div>' +
      '<label class="drop" id="drop"><span class="em-ic">' + ic("i-upload") + '</span><b>Elige el archivo CSV o arrástralo aquí</b><span class="hint">En Excel: Archivo › Guardar como › CSV. La primera fila debe tener los encabezados.</span><input type="file" id="impFile" accept=".csv,text/csv" hidden></label>' +
      '<div id="impPrev"></div></div><div id="impRes"></div>';
    function help() {
      var c = IMPORT[tipo];
      $("#impHelp").innerHTML = esc(c.help) + " Columnas: " + c.cols.map(function (x) { return c.req.indexOf(x) > -1 ? "<b>" + x + "</b>" : x; }).join(", ") +
        ' (en negrita, obligatorias). <a href="plantillas/' + tipo + '.csv" download>Descargar plantilla</a>';
      $("#impPrev").innerHTML = ""; $("#impRes").innerHTML = ""; filas = []; $("#impFile").value = "";
    }
    function handle(file) {
      if (!file) return;
      readFileText(file).then(function (text) {
        var rows = parseCSV(text), c = IMPORT[tipo];
        if (rows.length < 2) { $("#impPrev").innerHTML = '<p class="formerr">El archivo no tiene filas de datos.</p>'; return; }
        var head = rows[0].map(normH), map = {};
        c.cols.forEach(function (col) { (ALIAS[col] || [col]).some(function (a) { var i = head.indexOf(a); if (i > -1) { map[col] = i; return true; } return false; }); });
        if (tipo === "laboratorios" && map.carreras === undefined && map.carrera !== undefined) map.carreras = map.carrera;
        var missing = c.req.filter(function (r) { return map[r] === undefined; });
        if (missing.length) { $("#impPrev").innerHTML = '<p class="formerr">Faltan columnas: ' + esc(missing.join(", ")) + ". Revisa los encabezados o usa la plantilla.</p>"; return; }
        filas = rows.slice(1).map(function (r) { var o = {}; Object.keys(map).forEach(function (k) { o[k] = (r[map[k]] || "").trim(); }); return o; });
        var cols = c.cols.filter(function (k) { return map[k] !== undefined; });
        $("#impPrev").innerHTML = "<p><b>" + filas.length + "</b> filas listas en «" + esc(file.name) + "». Vista previa:</p>" +
          '<div class="preview" style="margin-top:8px"><table class="tbl"><thead><tr>' + cols.map(function (k) { return "<th>" + esc(k) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          filas.slice(0, 8).map(function (o) { return "<tr>" + cols.map(function (k) { return "<td>" + esc(o[k]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" +
          '<div style="margin-top:14px"><button class="btn btn-brand" id="impGo">' + ic("i-upload") + "Importar " + filas.length + " filas</button></div>";
        $("#impGo").addEventListener("click", run);
      }).catch(function () { $("#impPrev").innerHTML = '<p class="formerr">No se pudo leer el archivo.</p>'; });
    }
    function run() {
      var uni = $("#impUni").value, btn = $("#impGo");
      if (!uni) { toast("Elige la institución.", true); $("#impUni").focus(); return; }
      btn.setAttribute("aria-busy", "true"); btn.lastChild.textContent = "Importando…";
      api("POST", "importar/" + tipo, { universidad_id: +uni, crear_carreras: $("#impCrear").checked, filas: filas }).then(function (r) {
        var h = '<div class="card card-pad" style="margin-top:16px"><h2 class="h-sec" style="margin-top:0">Resultado</h2><div class="note ok">' + ic("i-check") + '<div><b>' + r.creados + "</b> creados" +
          (r.actualizados ? " · <b>" + r.actualizados + "</b> ya existían (se agregaron sus carreras)" : "") + (r.omitidas.length ? " · <b>" + r.omitidas.length + "</b> filas con avisos" : "") +
          (r.carreras_creadas && r.carreras_creadas.length ? "<br>Carreras nuevas: " + esc(r.carreras_creadas.join(", ")) + ". Revisa su área en Carreras." : "") + "</div></div>";
        if (r.omitidas.length) h += '<h3 class="h-sec">Filas no importadas o con avisos</h3><div class="preview">' + table([{ label: "Fila", render: function (o) { return o.fila; } }, { label: "Motivo", render: function (o) { return esc(o.motivo); } }], r.omitidas) + "</div>";
        if (r.credenciales && r.credenciales.length) h += '<h3 class="h-sec">Contraseñas iniciales</h3>' + note("warn", "Descárgalas ahora: por seguridad no se vuelven a mostrar. Entrégaselas a la institución para que cada estudiante entre y la cambie.", "i-lock") + '<p style="margin-top:12px"><button class="btn btn-brand btn-sm" id="credBtn">' + ic("i-download") + "Descargar contraseñas (CSV)</button></p>";
        h += "</div>";
        $("#impRes").innerHTML = h; $("#impPrev").innerHTML = ""; filas = [];
        if ($("#credBtn")) $("#credBtn").addEventListener("click", function () {
          downloadCSV("orbit-contrasenas-" + new Date().toISOString().slice(0, 10) + ".csv", ["nombre", "email", "codigo", "carrera", "contrasena"], r.credenciales.map(function (c) { return [c.nombre, c.email, c.codigo, c.carrera, c.password]; }));
        });
        loadOpts();
      }).catch(function (e) { btn.removeAttribute("aria-busy"); btn.lastChild.textContent = "Importar " + filas.length + " filas"; fail(e); });
    }
    $("#impTipo").addEventListener("change", function (e) { tipo = e.target.value; help(); });
    $("#impFile").addEventListener("change", function (e) { handle(e.target.files[0]); });
    var drop = $("#drop");
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { handle(e.dataTransfer.files[0]); });
    help();
  }

  /* ---------- Mi cuenta ---------- */
  function viewCuenta() {
    page.innerHTML = '<div class="ph"><div><h1>Mi cuenta</h1><p>' + esc(ME.email) + (ME.universidad ? " · " + esc(ME.universidad) : "") + '</p></div></div><div class="cols-2">' +
      '<section class="card card-pad"><h2 class="h-sec" style="margin-top:0">Mis datos</h2><form id="fMe" class="fg">' +
      '<div class="fld"><label for="mNom">Nombre</label><input id="mNom" value="' + esc(ME.nombre) + '"></div><div class="fld"><label for="mApe">Apellido</label><input id="mApe" value="' + esc(ME.apellido) + '"></div>' +
      '<div class="fld full"><label for="mTel">Teléfono</label><input id="mTel" value="' + esc(ME.telefono || "") + '"></div><div class="fld full"><button class="btn btn-brand btn-sm" type="submit">Guardar</button></div></form></section>' +
      '<section class="card card-pad"><h2 class="h-sec" style="margin-top:0">Cambiar contraseña</h2><form id="fPw" class="fg">' +
      '<div class="fld full"><label for="pA">Contraseña actual</label><input id="pA" type="password" autocomplete="current-password"><span class="err" hidden></span></div>' +
      '<div class="fld"><label for="pN">Nueva contraseña</label><input id="pN" type="password" autocomplete="new-password"><span class="err" hidden></span></div>' +
      '<div class="fld"><label for="pC">Repítela</label><input id="pC" type="password" autocomplete="new-password"><span class="err" hidden></span></div>' +
      '<div class="fld full"><button class="btn btn-brand btn-sm" type="submit">Cambiar contraseña</button></div></form></section></div>';
    $("#fMe").addEventListener("submit", function (e) {
      e.preventDefault();
      var data = { nombre: $("#mNom").value.trim(), apellido: $("#mApe").value.trim(), telefono: $("#mTel").value.trim() };
      api("PUT", "auth/me", data).then(function () { Object.assign(ME, data); renderUser(); toast("Datos guardados."); }).catch(fail);
    });
    $("#fPw").addEventListener("submit", function (e) {
      e.preventDefault();
      $$("#fPw .err").forEach(function (x) { x.hidden = true; });
      var setErr = function (sel, msg) { var x = $(".err", $(sel).parentNode); x.textContent = msg; x.hidden = false; $(sel).focus(); };
      if ($("#pN").value.length < 8) return setErr("#pN", "Mínimo 8 caracteres.");
      if ($("#pN").value !== $("#pC").value) return setErr("#pC", "No coincide con la nueva contraseña.");
      api("POST", "auth/password", { actual: $("#pA").value, nueva: $("#pN").value }).then(function () { e.target.reset(); toast("Contraseña cambiada."); })
        .catch(function (x) { if (x.fields && x.fields.actual) setErr("#pA", x.fields.actual); else if (x.fields && x.fields.nueva) setErr("#pN", x.fields.nueva); else fail(x); });
    });
  }


  /* Seguimiento académico: datos reales de cursos y evidencias. */
  RES.directores = {
    title: 'Directores de carrera', sub: 'Cada director administra los laboratorios y el seguimiento de una carrera.', single: 'director', api: 'directores',
    cols: [
      {label:'Director',render:function(r){return nameCell(r.nombre+' '+r.apellido,r.email);}},
      {label:'Carrera',render:function(r){return nameCell(r.carrera,r.universidad);}},
      {label:'Acceso',render:function(r){return pill(L.activo,r.activo);}},
      {label:'Último acceso',render:function(r){return fdt(r.ultimo_acceso);}}
    ],
    fields:function(isNew){return [
      {k:'nombre',label:'Nombre',req:true},{k:'apellido',label:'Apellido',req:true},
      {k:'email',label:'Correo',type:'email',req:true},{k:'telefono',label:'Teléfono'},
      {k:'carrera_id',label:'Carrera a cargo',type:'select',req:true,opts:function(){return optCarreras();},full:true},
      {k:'password',label:isNew?'Contraseña inicial':'Nueva contraseña (vacía para conservar)',type:'password',req:isNew},
      {k:'activo',label:'Cuenta activa',type:'check'}
    ];},defaults:{activo:true},canDelete:function(){return false;}
  };
  function progressMeter(value,label){value=Math.max(0,Math.min(100,+value||0));return '<div class="ac-progress"><div><span>'+esc(label||'Avance')+'</span><b>'+value+'%</b></div><progress max="100" value="'+value+'" aria-label="'+esc(label||'Avance')+'">'+value+'%</progress></div>';}
  function acMetric(value,label,detail){return '<article class="ac-metric"><span>'+esc(label)+'</span><strong>'+esc(value==null?'—':value)+'</strong><small>'+esc(detail||'')+'</small></article>';}
  function inscTable(list,certificate){return table([
    {label:'Estudiante / curso',render:function(r){return nameCell(r.estudiante,r.clase);}},
    {label:'Avance',render:function(r){return +r.total?progressMeter(r.progreso,r.completados+' de '+r.total+' laboratorios'):'<span class="sub">Sin laboratorios asignados</span>';}},
    {label:'Intentos',render:function(r){return num(r.intentos);}},
    {label:'Tiempo',render:function(r){return r.minutos+' min';}},
    {label:'Nota final',render:function(r){return '<b>'+num(r.nota_final)+'</b><span class="sub">'+(L.insc[r.estado]||[r.estado])[0]+'</span>';}},
    {label:'Última práctica',render:function(r){return fdt(r.ultima_practica);}},
    {label:certificate?'Certificado':'Detalle',render:function(r){if(!certificate)return '<a class="btn btn-line btn-sm" href="#/seguimiento/estudiantes/'+r.estudiante_id+'">Ver estudiante</a>';if(r.certificado_id)return '<a class="btn btn-brand btn-sm" target="_blank" rel="noopener" href="api/index.php?r=certificados/'+r.certificado_id+'/documento">Ver certificado</a>';return r.certificable?'<button class="btn btn-brand btn-sm" data-cert="'+r.id+'">Generar certificado</button>':'<span class="sub">Pendiente de completar o aprobar</span>';}}
  ],list)||emptyBox('Sin inscripciones','No hay estudiantes inscritos en este ámbito.');}
  function wireCertificates(container){$$('[data-cert]',container).forEach(function(b){b.addEventListener('click',function(){b.disabled=true;b.textContent='Generando…';api('POST','certificados',{inscripcion_id:+b.dataset.cert}).then(function(r){b.outerHTML='<a class="btn btn-brand btn-sm" target="_blank" rel="noopener" href="api/index.php?r=certificados/'+r.id+'/documento">Abrir certificado / PDF</a>';toast('Certificado ORBIT generado.');}).catch(function(e){b.disabled=false;b.textContent='Generar certificado';fail(e);});});});}
  function viewCertificates(){
    page.innerHTML='<div class="loading">Cargando certificados…</div>';
    api('GET','academico').then(function(d){page.innerHTML='<div class="ph"><div><span class="eyebrow">ORBIT · Dirección académica</span><h1>Certificados de finalización</h1><p>Completa los laboratorios del curso y obtén la aprobación de tu docente.</p></div></div><div class="ac-note">Requisitos: todos los laboratorios asignados completados, estado aprobado y nota final de al menos 51/100. El documento se puede imprimir o guardar como PDF.</div><div class="card">'+inscTable(d.inscripciones,true)+'</div>';wireCertificates(page);}).catch(fail);
  }
  function viewAcademic(kind,personId){
    page.innerHTML='<div class="loading">Cargando seguimiento académico…</div>';
    var detail=kind&&personId;var endpoint='academico'+(detail?'/'+kind+'/'+personId:'');
    var requests=[api('GET',endpoint)];if(ME.rol==='admin'&&!detail)requests.push(api('GET','dashboard'));
    Promise.all(requests).then(function(results){var d=results[0],adminStats=results[1]&&results[1].stats;
      var profile=d.perfil;var title=profile?profile.nombre:ME.rol==='director'?'Dirección de carrera':ME.rol==='docente'?'Tu actividad docente':isStudent()?'Mi progreso':'Panorama académico';
      var subtitle=profile?(profile.tipo+' · seguimiento individual'):'Cursos, laboratorios y resultados de '+(ME.rol==='director'?'tu carrera':ME.rol==='docente'?'tus clases':isStudent()?'tu formación':'ORBIT')+'.';
      page.innerHTML='<section class="ac-heading"><div><span class="eyebrow">ORBIT / '+(profile?'Perfil académico':'Seguimiento')+'</span><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div><div class="ph-actions">'+(detail?'<a class="btn btn-line" href="#/seguimiento">Volver al seguimiento</a>':ME.rol==='director'?'<a class="btn btn-brand" href="#/laboratorios">Crear laboratorio</a>':ME.rol==='docente'?'<a class="btn btn-brand" href="#/clases">Gestionar mis clases</a>':'<a class="btn btn-brand" href="#/certificados">Certificados</a>')+'</div></section>'+
        '<div class="toolbar ac-filters"><label>Curso <select class="sel" id="acCourse"><option value="">Todos los cursos</option>'+d.clases.map(function(k){return '<option value="'+k.id+'">'+esc(k.nombre)+'</option>';}).join('')+'</select></label><label>Buscar estudiante <input class="inp" id="acSearch" type="search" placeholder="Nombre o código"></label><span class="sub">Avance = laboratorios completados / asignados. Los intentos repetidos no suman avance.</span></div><div id="acContent"></div>';
      function draw(){var course=$('#acCourse').value,q=$('#acSearch').value.toLowerCase();var en=d.inscripciones.filter(function(r){return (!course||+r.clase_id===+course)&&(!q||(r.estudiante+' '+r.codigo).toLowerCase().indexOf(q)>-1);});var ks=d.clases.filter(function(k){return !course||+k.id===+course;});var total=en.reduce(function(a,r){return a+(+r.total);},0),done=en.reduce(function(a,r){return a+(+r.completados);},0),pct=total?Math.round(done*100/total):0;var notes=en.filter(function(r){return r.nota_final!=null;});var avg=notes.length?Math.round(notes.reduce(function(a,r){return a+(+r.nota_final);},0)/notes.length*10)/10:null;var students=new Set(en.map(function(r){return r.estudiante_id;}));
      var h='<section class="ac-overview"><div class="ac-spot"><span class="eyebrow">Avance de laboratorios</span><strong>'+pct+'<small>%</small></strong>'+progressMeter(pct,done+' de '+total+' asignaciones completadas')+'<p>Se cuenta cada laboratorio una vez por estudiante y curso.</p></div><div class="ac-metrics">'+acMetric(ks.length,'Cursos',ks.filter(function(k){return k.estado==='activa';}).length+' activos')+acMetric(course||q?students.size:d.estudiantes.length,'Estudiantes',course||q?'Con inscripción en el filtro':'Cuentas de estudiantes en tu ámbito')+acMetric(avg,'Nota final media','Solo notas registradas, sobre 100')+acMetric(en.filter(function(r){return r.nota_final===null;}).length,'Notas pendientes','Inscripciones sin nota final')+acMetric(course||q?en.reduce(function(a,r){return a+(+r.intentos);},0):d.resumen_practicas.intentos,'Prácticas realizadas',course||q?'Intentos de cursos del filtro':'Incluye prácticas con y sin curso')+acMetric((course||q?en.reduce(function(a,r){return a+(+r.minutos);},0):d.resumen_practicas.minutos)+' min','Tiempo de práctica','Según prácticas registradas')+'</div></section>';
      h+='<section class="ac-section"><div class="ac-title"><h2>Cursos, uno por uno</h2><span>'+ks.length+' cursos</span></div><div class="ac-courses">'+(ks.map(function(k){var list=en.filter(function(r){return +r.clase_id===+k.id;});var progress=list.length?Math.round(list.reduce(function(a,r){return a+r.progreso;},0)/list.length):0;return '<article class="card ac-course"><span class="pill vio">'+esc(k.periodo)+'</span><h3>'+esc(k.nombre)+'</h3><p>'+esc(k.carrera)+'</p><p class="sub">Docente: '+esc(k.docente||'Sin asignar')+'</p>'+progressMeter(progress,'Avance de estudiantes')+'<div class="ac-course-foot"><span>'+list.length+' inscripciones</span><a class="btn btn-line btn-sm" href="#/clases/'+k.id+'">Ver clase</a></div></article>';}).join('')||emptyBox('Sin cursos','Crea una clase o revisa las inscripciones.'))+'</div></section>';
      if(!detail) h+='<section class="ac-section"><div class="ac-title"><h2>Estudiantes, uno por uno</h2><span>Incluye cuentas sin cursos inscritos</span></div><div class="card">'+(table([{label:'Estudiante',render:function(t){return nameCell(t.nombre,t.codigo,'#/seguimiento/estudiantes/'+t.id);}},{label:'Carrera',render:function(t){return esc(t.carrera||'Independiente');}},{label:'Cursos',render:function(t){return t.cursos;}},{label:'Avance medio por curso',render:function(t){return t.cursos?progressMeter(t.progreso):'Sin cursos';}},{label:'Último acceso',render:function(t){return fdt(t.ultimo_acceso);}}],d.estudiantes.filter(function(t){return (!q||(t.nombre+' '+t.codigo).toLowerCase().indexOf(q)>-1)&&(!course||en.some(function(r){return +r.estudiante_id===+t.id;}));}))||emptyBox('Sin estudiantes','No hay cuentas en este ámbito.'))+'</div></section>';
      h+='<section class="ac-section"><div class="ac-title"><h2>'+(profile&&profile.tipo==='Estudiante'?'Progreso por curso':'Estudiantes y resultados')+'</h2><a href="#/certificados">Ver certificados</a></div><div class="card">'+inscTable(en,false)+'</div></section>';
      if(!isStudent()&&!(profile&&profile.tipo==='Estudiante'))h+='<section class="ac-section"><div class="ac-title"><h2>Actividad de docentes</h2><span>En el ámbito que puedes consultar</span></div><div class="card">'+table([{label:'Docente',render:function(t){return '<a href="#/seguimiento/docentes/'+t.id+'">'+esc(t.nombre)+'</a>';}},{label:'Clases',render:function(t){return num(t.clases);}},{label:'Inscripciones',render:function(t){return num(t.inscripciones);}},{label:'Avance medio de sus clases',render:function(t){return progressMeter(t.progreso);}},{label:'Notas pendientes',render:function(t){return num(t.pendientes_nota);}},{label:'Último acceso',render:function(t){return fdt(t.ultimo_acceso);}}],d.docentes.filter(function(t){return (!profile||profile.tipo!=='Docente'||+t.id===+personId)&&(!course||ks.some(function(k){return +k.docente_id===+t.id;}));}).map(function(t){if(!course&&!q)return t;var tk=ks.filter(function(k){return +k.docente_id===+t.id;}),ti=en.filter(function(r){return +r.docente_id===+t.id;});return Object.assign({},t,{clases:tk.length,inscripciones:ti.length,progreso:tk.length?Math.round(tk.reduce(function(a,k){var ei=ti.filter(function(r){return +r.clase_id===+k.id;});return a+(ei.length?ei.reduce(function(n,r){return n+r.progreso;},0)/ei.length:0);},0)/tk.length):0,pendientes_nota:ti.filter(function(r){return r.nota_final==null;}).length});}))+'</div></section>';
      var events=d.actividad.filter(function(r){return (!course||+r.clase_id===+course)&&(!q||r.estudiante.toLowerCase().indexOf(q)>-1);});h+='<section class="ac-section"><div class="ac-title"><h2>Prácticas recientes</h2><span>Últimos 100 registros del ámbito</span></div><div class="card">'+(table([{label:'Estudiante',render:function(r){return esc(r.estudiante);}},{label:'Laboratorio',render:function(r){return nameCell(r.laboratorio,r.clase);}},{label:'Fecha',render:function(r){return fdt(r.realizada_en);}},{label:'Resultado',render:function(r){return (+r.completada?'Completada':'En progreso')+' · '+(r.puntaje==null?'Sin puntaje':r.puntaje+'/100');}}],events)||emptyBox('Sin actividad registrada','Las nuevas prácticas aparecerán aquí.'))+'</div></section>';
      if(!isStudent())h+='<section class="ac-section"><div class="ac-title"><h2>Historial de notas</h2><span>Últimos 100 cambios registrados</span></div><div class="card">'+(table([{label:'Fecha',render:function(r){return fdt(r.creado_en);}},{label:'Responsable',render:function(r){return esc(r.autor);}},{label:'Estudiante / curso',render:function(r){return nameCell(r.estudiante,r.clase);}},{label:'Cambio',render:function(r){var old=JSON.parse(r.anterior),next=JSON.parse(r.nueva);return esc(old.nota_final==null?'Sin nota':old.nota_final)+' → '+esc(next.nota_final==null?'Sin nota':next.nota_final)+' · '+esc(next.estado||old.estado);}}],d.notas_historial)||emptyBox('Sin cambios registrados','Las próximas ediciones de notas quedarán registradas con su responsable.'))+'</div></section>';
      if(adminStats)h+='<section class="ac-section"><div class="ac-title"><h2>Administración de ORBIT</h2><span>Totales generales de la plataforma</span></div><div class="ac-metrics">'+acMetric(adminStats.universidades,'Instituciones','Activas')+acMetric(adminStats.carreras,'Carreras','Activas')+acMetric(adminStats.directores,'Directores de carrera','Cuentas asignadas a una carrera')+acMetric(adminStats.docentes,'Docentes','Cuentas registradas')+acMetric(adminStats.labs_publicados,'Laboratorios','Publicados')+acMetric(adminStats.libros,'Libros AR','Publicados')+acMetric(adminStats.pagos_pendientes,'Pagos pendientes','Por confirmar')+acMetric(bs(adminStats.ingreso_licencias),'Ingreso mensual estimado','Licencias activas')+acMetric(bs(adminStats.cobrado_mes),'Cobrado este mes','Planes Premium')+'</div></section>';
      $('#acContent').innerHTML=h;}
      $('#acCourse').addEventListener('change',draw);$('#acSearch').addEventListener('input',debounce(draw,150));draw();
    }).catch(function(e){page.innerHTML=emptyBox('No se pudo cargar el seguimiento',' '+e.message);});
  }

  /* ---------- Navegación ---------- */
  function navFor() {
    var r = ME.rol;
    if (r === "director") return [["Dirección", [["", "Resumen", "i-home"], ["seguimiento", "Seguimiento académico", "i-chart"], ["laboratorios", "Mis laboratorios", "i-cube"], ["clases", "Cursos de la carrera", "i-layers"], ["certificados", "Certificados", "i-cap"], ["cuenta", "Mi cuenta", "i-gear"]]]];
    if (r === "admin") return [
      [null, [["", "Resumen", "i-home"], ["seguimiento", "Seguimiento académico", "i-chart"], ["certificados", "Certificados", "i-cap"]]],
      ["Académico", [["universidades", "Instituciones", "i-building"], ["carreras", "Carreras", "i-cap"], ["directores", "Directores de carrera", "i-user"], ["docentes", "Docentes", "i-user"], ["estudiantes", "Estudiantes", "i-users"], ["clases", "Clases", "i-layers"]]],
      ["Contenidos", [["laboratorios", "Laboratorios", "i-cube"], ["libros", "Libros AR", "i-book"]]],
      ["Negocio", [["licencias", "Licencias", "i-key"], ["planes", "Planes freemium", "i-tag"], ["pagos", "Pagos", "i-card", "pagos"], ["solicitudes", "Solicitudes", "i-inbox", "solicitudes"]]],
      ["Herramientas", [["importar", "Importar listas", "i-upload"], ["cuenta", "Mi cuenta", "i-gear"]]]
    ];
    if (r === "docente") return [[null, [["", "Resumen", "i-home"], ["seguimiento", "Progreso académico", "i-chart"], ["certificados", "Certificados", "i-cap"], ["clases", "Mis clases", "i-layers"], ["laboratorios", "Laboratorios", "i-cube"], ["libros", "Libros AR", "i-book"], ["cuenta", "Mi cuenta", "i-gear"]]]];
    if (isIndep()) return [[null, [["", "Resumen", "i-home"], ["seguimiento", "Mi progreso", "i-chart"], ["certificados", "Certificados", "i-cap"], ["laboratorios", "Laboratorios", "i-cube"], ["libros", "Libros AR", "i-book"], ["practicas", "Mis prácticas", "i-chart"], ["plan", "Mi plan", "i-tag"], ["cuenta", "Mi cuenta", "i-gear"]]]];
    return [[null, [["", "Resumen", "i-home"], ["seguimiento", "Progreso académico", "i-chart"], ["certificados", "Certificados", "i-cap"], ["clases", "Mis clases", "i-layers"], ["laboratorios", "Laboratorios", "i-cube"], ["libros", "Libros AR", "i-book"], ["practicas", "Mis prácticas", "i-chart"], ["cuenta", "Mi cuenta", "i-gear"]]]];
  }
  var ROLE = { director: "Director de carrera", admin: "Administrador", docente: "Docente", estudiante: "Estudiante" };
  function renderNav() {
    $("#snav").innerHTML = navFor().map(function (g) {
      return (g[0] ? '<div class="snav-g">' + esc(g[0]) + "</div>" : "") + g[1].map(function (it) {
        var b = it[3] && BADGES[it[3]] ? '<span class="count">' + BADGES[it[3]] + "</span>" : "";
        return '<a href="#/' + it[0] + '" data-nav="' + it[0] + '">' + ic(it[2]) + "<span>" + esc(it[1]) + "</span>" + b + "</a>";
      }).join("");
    }).join("");
    markNav();
  }
  function renderUser() {
    var sub = ROLE[ME.rol] + (isIndep() ? (ME.premium_hasta ? " · Premium" : " · Gratis") : "");
    $("#sideTag").textContent = ME.rol === "admin" ? "Administración" : ME.rol === "director" ? "Dirección de carrera" : ME.rol === "docente" ? "Docente" : isIndep() ? (ME.premium_hasta ? "Premium" : "Plan Gratis") : "Estudiante";
    $("#sideUser").innerHTML = '<span class="avatar" aria-hidden="true">' + esc(initials(ME)) + '</span><span class="who"><b>' + esc(ME.nombre + " " + ME.apellido) + "</b><small>" + esc(sub) + "</small></span>" +
      '<button class="tool" type="button" id="logout" aria-label="Cerrar sesión" title="Cerrar sesión">' + ic("i-logout") + "</button>";
    $("#logout").addEventListener("click", function () { api("POST", "auth/logout").catch(function () {}).then(function () { location.href = "login.html"; }); });
  }
  function markNav() {
    var cur = (location.hash.replace(/^#\/?/, "").split("/")[0]) || "";
    $$("[data-nav]").forEach(function (a) { if (a.dataset.nav === cur) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  }
  function setCrumb(html) { $("#crumb").innerHTML = html; }
  function refreshBadges() {
    if (ME.rol !== "admin") return;
    api("GET", "dashboard").then(function (d) { BADGES = { pagos: +d.stats.pagos_pendientes, solicitudes: +d.stats.solicitudes_nuevas }; renderNav(); }).catch(function () {});
  }

  function route() {
    cleanup.forEach(function (f) { f(); }); cleanup = [];
    closeSide(); if (dlg.open) closeModal();
    var parts = location.hash.replace(/^#\/?/, "").split("/"), r = parts[0] || "", id = parts[1] && /^\d+$/.test(parts[1]) ? +parts[1] : null;
    var allowed = navFor().reduce(function (a, g) { return a.concat(g[1].map(function (x) { return x[0]; })); }, []);
    if (allowed.indexOf(r) < 0) { location.hash = "#/"; return; }
    var title = "";
    navFor().forEach(function (g) { g[1].forEach(function (x) { if (x[0] === r) title = x[1]; }); });
    setCrumb(esc(title)); markNav();
    document.title = title + " | ORBIT";
    window.scrollTo(0, 0);
    if (r === "") return viewHome();
    if (r === "seguimiento") return viewAcademic(parts[1],parts[2]);
    if (r === "certificados") return viewCertificates();
    if (r === "clases") return id ? viewClase(id) : isStudent() ? viewMisClases()
      : crudView(ME.rol === "docente" ? Object.assign({}, RES.clases, { title: "Mis clases", sub: "Crea tus clases, inscribe estudiantes y asigna laboratorios de tus carreras." }) : RES.clases);
    if (r === "laboratorios") return id ? viewLab(id) : (ME.rol === "admin" || ME.rol === "director" ? crudView(ME.rol === "director" ? Object.assign({},RES.laboratorios,{sub:"Crea y administra los laboratorios de tu carrera.",fields:function(){return RES.laboratorios.fields().filter(function(f){return ["s3","solicitado_por","catalogo_publico","gratis","carrera_ids"].indexOf(f.k)<0;});},defaults:{area:"Ingeniería y técnica",estado:"en_desarrollo"}}) : RES.laboratorios) : viewCards("lab"));
    if (r === "libros") return id ? viewLibro(id) : ME.rol === "admin" ? crudView(RES.libros) : viewCards("libro");
    if (r === "practicas") return viewPracticas();
    if (r === "plan") return viewPlan();
    if (r === "importar") return viewImportar();
    if (r === "cuenta") return viewCuenta();
    if (RES[r]) return crudView(RES[r]);
  }

  /* Menú lateral en móvil */
  var side = $("#side"), menuBtn = $("#menuBtn"), scrim = null;
  function closeSide() { side.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); if (scrim) { scrim.remove(); scrim = null; } }
  menuBtn.addEventListener("click", function () {
    if (side.classList.contains("open")) return closeSide();
    side.classList.add("open"); menuBtn.setAttribute("aria-expanded", "true");
    scrim = document.createElement("div"); scrim.className = "scrim"; scrim.addEventListener("click", closeSide); document.body.appendChild(scrim);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSide(); });

  /* Tema */
  $("#themeBtn").addEventListener("click", function () {
    var h = document.documentElement; h.dataset.theme = h.dataset.theme === "dark" ? "light" : "dark"; store("orbit-theme", h.dataset.theme);
    var m = $('meta[name="theme-color"]'); if (m) m.content = h.dataset.theme === "dark" ? "#100E27" : "#F7F6FC";
  });

  function loadOpts() {
    if (ME.rol === "estudiante") return Promise.resolve();
    return api("GET", "opciones").then(function (o) { OPTS = o; });
  }

  /* Arranque */
  if (location.protocol === "file:") {
    page.innerHTML = emptyBox("El panel necesita el servidor", " Abre el sitio desde http://localhost (XAMPP) y no como archivo. Revisa LEEME.md.");
    return;
  }
  api("GET", "auth/me").then(function (d) {
    ME = d.user; CSRF = d.csrf;
    renderUser(); renderNav();
    return loadOpts();
  }).then(function () {
    refreshBadges();
    window.addEventListener("hashchange", route);
    route();
  }).catch(function (e) {
    if (e.message !== "Sesión cerrada") page.innerHTML = emptyBox("No se pudo abrir el panel", " " + e.message);
  });
})();
