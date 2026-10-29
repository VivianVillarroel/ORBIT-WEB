/* ORBIT — interacciones (sin librerías). Sirve para index.html y login.html. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var html = document.documentElement;
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Idiomas ----------
     El español vive en el HTML. Las traducciones (js/i18n-en.js, js/i18n-pt.js) se cargan solo si alguien las pide.
     La clave de cada traducción es el texto en español. */
  var lang = "es", dict = {}, cache = { es: {} }, onLang = [];
  var tNodes = [], tAttrs = [], baseTitle = document.title;
  var metaDesc = $('meta[name="description"]'), baseDesc = metaDesc ? metaDesc.content : "";
  function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }
  function tr(s) { if (lang === "es") return s; var v = dict[norm(s)]; return v != null ? v : s; }
  (function collect() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p || p.closest("script,style,[data-noi18n]")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (w.nextNode()) tNodes.push({ n: w.currentNode, s: w.currentNode.nodeValue });
    ["alt", "aria-label", "placeholder", "title", "data-alt"].forEach(function (a) {
      $$("[" + a + "]").forEach(function (el) { if (!el.closest("[data-noi18n]") && el.getAttribute(a)) tAttrs.push({ el: el, a: a, s: el.getAttribute(a) }); });
    });
  })();
  function applyLang(l) {
    lang = l; dict = cache[l] || {};
    html.lang = l;
    tNodes.forEach(function (t) {
      var lead = t.s.match(/^\s*/)[0], tail = t.s.match(/\s*$/)[0];
      t.n.nodeValue = l === "es" ? t.s : lead + tr(t.s) + tail;
    });
    tAttrs.forEach(function (t) { t.el.setAttribute(t.a, tr(t.s)); });
    document.title = tr(baseTitle);
    if (metaDesc) metaDesc.content = tr(baseDesc);
    $$(".lang-cur").forEach(function (e) { e.textContent = l.toUpperCase(); });
    $$("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.lang === l)); });
    onLang.forEach(function (f) { f(); });
  }
  function setLang(l) {
    if (cache[l]) { applyLang(l); return; }
    var s = document.createElement("script");
    s.src = "js/i18n-" + l + ".js";
    s.onload = function () { cache[l] = (window.ORBIT_I18N || {})[l] || {}; applyLang(l); };
    s.onerror = function () { applyLang("es"); };
    document.head.appendChild(s);
  }
  var startLang = read("orbit-lang");
  var q = /[?&]lang=(es|en|pt)/.exec(location.search); if (q) startLang = q[1];
  if (!startLang) { var nav = (navigator.language || "es").slice(0, 2); startLang = nav === "en" || nav === "pt" ? nav : "es"; }
  if (startLang !== "es") setLang(startLang);

  var langBtn = $("#langBtn"), langMenu = $("#langMenu");
  function closeLang() { if (langMenu) { langMenu.hidden = true; langBtn.setAttribute("aria-expanded", "false"); } }
  if (langBtn) {
    langBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = langMenu.hidden; langMenu.hidden = !open; langBtn.setAttribute("aria-expanded", String(open));
      if (open) { var cur = $('[aria-pressed="true"]', langMenu); if (cur) cur.focus(); }
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".lang")) closeLang(); });
  }
  $$("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () { store("orbit-lang", b.dataset.lang); setLang(b.dataset.lang); closeLang(); if (langBtn && langMenu.contains(b)) langBtn.focus(); });
  });

  /* ---------- Tema ---------- */
  var themeMeta = $('meta[name="theme-color"]');
  function syncTheme() {
    var dark = html.dataset.theme === "dark";
    if (themeMeta) themeMeta.content = dark ? "#100E27" : "#F7F6FC";
    $$("[data-theme-toggle]").forEach(function (b) { b.setAttribute("aria-label", tr(dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro")); });
  }
  $$("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      html.dataset.theme = html.dataset.theme === "dark" ? "light" : "dark";
      store("orbit-theme", html.dataset.theme); syncTheme();
    });
  });
  onLang.push(syncTheme); syncTheme();

  /* ---------- Encabezado y menú móvil ---------- */
  var hdr = $(".hdr");
  if (hdr) {
    var onScroll = function () { hdr.classList.toggle("scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }
  var menuBtn = $("#menuBtn"), sheet = $("#sheet");
  function setSheet(open) {
    if (!sheet) return;
    sheet.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", tr(open ? "Cerrar menú" : "Abrir menú"));
    $("use", menuBtn).setAttribute("href", open ? "#i-close" : "#i-menu");
  }
  if (menuBtn) {
    menuBtn.addEventListener("click", function () { setSheet(sheet.hidden); });
    sheet.addEventListener("click", function (e) { if (e.target.closest("a")) setSheet(false); });
    window.addEventListener("resize", function () { if (window.innerWidth > 1020) setSheet(false); });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    closeLang(); if (sheet && !sheet.hidden) { setSheet(false); menuBtn.focus(); }
    closePops();
  });

  /* ---------- Hero: escáner equipo real / modelo 3D ---------- */
  var scan = $("#scan"), range = $("#scanRange");
  if (scan && range) {
    if (!reduceMotion) {
      scan.classList.add("intro");
      scan.addEventListener("animationend", function () { scan.classList.remove("intro"); }, { once: true });
    }
    range.addEventListener("input", function () { scan.classList.remove("intro"); scan.style.setProperty("--p", range.value); });
  }

  /* ---------- Soluciones: la imagen sigue al elemento activo ---------- */
  var solImg = $("#solImg"), solItems = $$(".sol-item"), solT = 0;
  function pickSol(btn) {
    if (btn.getAttribute("aria-pressed") === "true") return;
    solItems.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
    var src = btn.dataset.img, alt = btn.getAttribute("data-alt") || "";
    var pre = new Image(); pre.src = src;
    solImg.classList.add("fade");
    clearTimeout(solT);
    solT = setTimeout(function () {
      var show = function () { solImg.src = src; solImg.alt = alt; requestAnimationFrame(function () { solImg.classList.remove("fade"); }); };
      if (pre.complete) show(); else { pre.onload = show; pre.onerror = show; }
    }, reduceMotion ? 0 : 180);
  }
  if (solImg) {
    var hoverable = window.matchMedia && matchMedia("(hover: hover)").matches;
    solItems.forEach(function (b) {
      b.addEventListener("click", function () { pickSol(b); });
      if (hoverable) b.addEventListener("mouseenter", function () { pickSol(b); });
    });
  }

  /* ---------- Proyectos: pestañas y puntos ---------- */
  function closePops() {
    $$(".hs[aria-expanded='true']").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    $$(".pop.show").forEach(function (p) { p.classList.remove("show"); });
  }
  var tabs = $$("#ptabs [role=tab]");
  function selectTab(tab, focus) {
    closePops();
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
    $$("#pstage .pimg").forEach(function (s) { s.hidden = s.dataset.k !== tab.dataset.k; });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t); });
    t.addEventListener("keydown", function (e) {
      var k = e.key, n = tabs.length, j = -1;
      if (k === "ArrowRight" || k === "ArrowDown") j = (i + 1) % n;
      else if (k === "ArrowLeft" || k === "ArrowUp") j = (i - 1 + n) % n;
      else if (k === "Home") j = 0; else if (k === "End") j = n - 1;
      if (j > -1) { e.preventDefault(); selectTab(tabs[j], true); }
    });
  });
  $$(".hs").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      var pop = $("#" + b.getAttribute("aria-controls")), open = b.getAttribute("aria-expanded") === "true";
      closePops();
      if (!open) { b.setAttribute("aria-expanded", "true"); pop.classList.add("show"); }
    });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".hs, .pop")) closePops(); });

  /* ---------- Copiar correo ---------- */
  function copyText(text, btn, label) {
    var done = function () { btn.textContent = tr("Copiado"); setTimeout(function () { btn.textContent = tr(label); }, 1600); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    else fallback();
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  }
  var MAIL = "orbitunivalle@gmail.com";
  var copyMail = $("#copyMail");
  if (copyMail) {
    copyMail.addEventListener("click", function () { copyText(MAIL, copyMail, "Copiar"); });
    onLang.push(function () { copyMail.textContent = tr("Copiar"); });
  }

  /* ---------- Formulario de cotización ---------- */
  var form = $("#quoteForm");
  var mailOk = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); };
  if (form) {
    var err = $("#formErr"), ok = $("#formOk");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("#f-name"), org = $("#f-org"), mail = $("#f-mail"), msg = $("#f-msg");
      var type = $('input[name="tipo"]:checked', form), typeText = type ? type.nextElementSibling.textContent : "-";
      [name, mail, msg].forEach(function (f) { f.removeAttribute("aria-invalid"); });
      var bad = null, text = "";
      if (!name.value.trim()) { bad = name; text = "Escribe tu nombre."; }
      else if (!mailOk(mail.value.trim())) { bad = mail; text = "Escribe un correo válido, por ejemplo nombre@institucion.edu.bo."; }
      else if (msg.value.trim().length < 5) { bad = msg; text = "Cuéntanos brevemente qué necesitas."; }
      ok.hidden = true;
      if (bad) { bad.setAttribute("aria-invalid", "true"); err.textContent = tr(text); err.hidden = false; bad.focus(); return; }
      err.hidden = true;
      var who = org.value.trim() || name.value.trim();
      var subject = tr("Solicitud de cotización") + " | " + who;
      var body = [
        tr("Nombre") + ": " + name.value.trim(),
        tr("Institución o empresa") + ": " + (org.value.trim() || "-"),
        tr("Correo") + ": " + mail.value.trim(),
        tr("Qué necesitas") + ": " + typeText,
        "",
        msg.value.trim()
      ].join("\n");
      // Además del correo, la solicitud queda guardada para verla en el panel de administración.
      if (location.protocol !== "file:") {
        fetch("api/index.php?r=solicitudes", {
          method: "POST", keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: name.value.trim(), institucion: org.value.trim(), email: mail.value.trim(), tipo: type ? type.value : "", mensaje: msg.value.trim(), sitio_web: (form.querySelector('[name="sitio_web"]') || {}).value || "" })
        }).catch(function () {});
      }
      window.location.href = "mailto:" + MAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      ok.textContent = tr("Abrimos tu correo con la solicitud lista. Si no se abrió, escríbenos a orbitunivalle@gmail.com.");
      ok.hidden = false;
    });
  }

  /* ---------- Inicio de sesión ---------- */
  var lform = $("#lgForm");
  if (lform) {
    var lmail = $("#l-mail"), lpass = $("#l-pass"), eye = $("#eye"), lmsg = $("#lmsg"), lbtn = $("#lgSubmit"), lastMsg = null;
    var say = function (text, isBad) { lastMsg = [text, isBad]; lmsg.textContent = tr(text); lmsg.classList.toggle("bad", !!isBad); lmsg.hidden = false; };
    onLang.push(function () { if (lastMsg && !lmsg.hidden) say(lastMsg[0], lastMsg[1]); eye.textContent = tr(lpass.type === "password" ? "Mostrar" : "Ocultar"); lbtn.textContent = tr("Ingresar"); });
    eye.addEventListener("click", function () {
      var show = lpass.type === "password";
      lpass.type = show ? "text" : "password";
      eye.textContent = tr(show ? "Ocultar" : "Mostrar");
      eye.setAttribute("aria-pressed", String(show));
    });
    $("#forgot").addEventListener("click", function () { say("Escríbenos a orbitunivalle@gmail.com desde el correo de tu cuenta y te ayudamos a recuperarla."); });
    lform.addEventListener("submit", function (e) {
      e.preventDefault();
      [lmail, lpass].forEach(function (f) { f.removeAttribute("aria-invalid"); });
      if (!mailOk(lmail.value.trim())) { lmail.setAttribute("aria-invalid", "true"); say("Escribe el correo con el que te registraron.", true); lmail.focus(); return; }
      if (!lpass.value) { lpass.setAttribute("aria-invalid", "true"); say("Escribe tu contraseña.", true); lpass.focus(); return; }
      if (location.protocol === "file:") { say("Para iniciar sesión abre el sitio desde el servidor (por ejemplo http://localhost/orbit-web), no como archivo.", true); return; }
      lmsg.hidden = true; lbtn.setAttribute("aria-busy", "true"); lbtn.textContent = tr("Ingresando…");
      fetch("api/index.php?r=auth/login", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: lmail.value.trim(), password: lpass.value })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || "No se pudo iniciar sesión.");
          // Solo se acepta volver a una sección del panel (#/...), nunca a otra página.
          var qs = location.search; try { qs = decodeURIComponent(qs); } catch (x) {}
          var next = /[?&]next=(#\/[\w\/-]*)/.exec(qs);
          location.href = "panel.html" + (next ? next[1] : "");
        });
      }).catch(function (err) {
        lbtn.removeAttribute("aria-busy"); lbtn.textContent = tr("Ingresar");
        say(err.message === "Failed to fetch" ? "No pudimos conectar con el servidor. Inténtalo de nuevo." : err.message, true);
      });
    });
  }

  /* ---------- Registro gratis (estudiantes independientes) ---------- */
  var rform = $("#rgForm");
  if (rform) {
    var rmsg = $("#rmsg"), rbtn = $("#rgSubmit");
    var rsay = function (text) { rmsg.textContent = tr(text); rmsg.classList.add("bad"); rmsg.hidden = false; };
    rform.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = { nombre: $("#r-nom"), apellido: $("#r-ape"), email: $("#r-mail"), password: $("#r-pass") };
      Object.keys(f).forEach(function (k) { f[k].removeAttribute("aria-invalid"); });
      var bad = null, text = "";
      if (!f.nombre.value.trim()) { bad = f.nombre; text = "Escribe tu nombre."; }
      else if (!f.apellido.value.trim()) { bad = f.apellido; text = "Escribe tu apellido."; }
      else if (!mailOk(f.email.value.trim())) { bad = f.email; text = "Escribe un correo válido."; }
      else if (f.password.value.length < 8) { bad = f.password; text = "La contraseña debe tener al menos 8 caracteres."; }
      if (bad) { bad.setAttribute("aria-invalid", "true"); rsay(text); bad.focus(); return; }
      if (location.protocol === "file:") { rsay("Para registrarte abre el sitio desde el servidor, no como archivo."); return; }
      rmsg.hidden = true; rbtn.setAttribute("aria-busy", "true");
      fetch("api/index.php?r=registro", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: f.nombre.value.trim(), apellido: f.apellido.value.trim(), email: f.email.value.trim(), password: f.password.value })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) { var msg = d.fields ? d.fields[Object.keys(d.fields)[0]] : d.error; throw new Error(msg || "No se pudo crear la cuenta."); }
          location.href = "panel.html" + (/[?&]plan=premium/.test(location.search) ? "#/plan" : "");
        });
      }).catch(function (err) { rbtn.removeAttribute("aria-busy"); rsay(err.message === "Failed to fetch" ? "No pudimos conectar con el servidor." : err.message); });
    });
  }

  /* ---------- Catálogo para estudiantes en la página principal ---------- */
  var cat = $("#catGrid");
  if (cat && location.protocol !== "file:") {
    fetch("api/index.php?r=catalogo").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      var items = d.laboratorios.map(function (l) { return { t: l.nombre, s: l.area + (l.equipo ? " · " + l.equipo : ""), g: +l.gratis, k: "3D" }; })
        .concat(d.libros.map(function (b) { return { t: b.titulo, s: b.materia || "", g: +b.gratis, k: "AR" }; }));
      var prem = (d.planes || []).filter(function (p) { return p.codigo === "premium"; })[0];
      if (prem) $$("[data-premium-price]").forEach(function (el) { el.textContent = Number(prem.precio_mes).toLocaleString("es-BO") + " Bs"; });
      if (!items.length) return;
      var e = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
      cat.innerHTML = items.slice(0, 6).map(function (it) {
        return '<li><span class="tags"><span class="tag ' + (it.k === "AR" ? "ar" : "vr") + '">' + it.k + "</span>" + (it.g ? '<span class="tag mix">' + e(tr("Gratis")) + "</span>" : "") + "</span><b>" + e(it.t) + "</b><span>" + e(it.s) + "</span></li>";
      }).join("");
      cat.hidden = false;
    }).catch(function () {});
  }

  /* El botón del encabezado lleva al panel si ya hay una sesión abierta */
  if (location.protocol !== "file:" && $(".login-btn")) {
    fetch("api/index.php?r=auth/me", { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) return;
      $$(".login-btn").forEach(function (a) { a.href = "panel.html"; a.lastChild.textContent = tr("Mi panel"); });
    }).catch(function () {});
  }
})();
