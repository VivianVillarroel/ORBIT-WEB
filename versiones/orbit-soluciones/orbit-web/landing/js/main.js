(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var html = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  /* ---------- Idiomas ----------
     Spanish lives in the HTML. Other languages are dictionaries keyed by the Spanish text (js/i18n.js),
     so every visible string, alt, aria-label and placeholder is swapped in place. */
  var DICT = window.ORBIT_I18N || {}, lang = "es";
  function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }
  function tr(s) { if (lang === "es") return s; var d = DICT[lang], k = norm(s); return d && d[k] != null ? d[k] : s; }
  function keepWs(src, out) { return src.match(/^\s*/)[0] + out + src.match(/\s*$/)[0]; }
  var SKIP = "script,style,[data-noi18n],[data-split],[data-t],[data-count]";
  var tNodes = [], tAttrs = [];
  (function collect() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      var p = n.parentElement;
      if (!norm(n.nodeValue) || !p || p.closest(SKIP)) continue;
      tNodes.push({ n: n, s: n.nodeValue, k: p.dataset.ctx });
    }
    ["alt", "aria-label", "placeholder", "title"].forEach(function (a) {
      $$("[" + a + "]").forEach(function (el) {
        var v = el.getAttribute(a);
        if (v && norm(v) && !el.closest("[data-noi18n]")) tAttrs.push({ el: el, a: a, s: v });
      });
    });
  })();
  function setT(el) { el.textContent = el.dataset.t ? tr(el.dataset.t) : ""; }
  var metaDesc = $('meta[name="description"]'), metaSrc = metaDesc.getAttribute("content");

  /* Word splitting (headlines rise word by word; the problem statement fills in as you scroll) */
  var splitEls = $$("[data-split]"), stWords = [];
  splitEls.forEach(function (el) { el._src = el.innerHTML; });
  function splitWords(el) {
    var cls = el.dataset.split === "words" ? "w" : "wd", out = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 1) return walk(c);
        if (c.nodeType !== 3) return;
        var frag = document.createDocumentFragment();
        c.nodeValue.split(/(\s+)/).forEach(function (w) {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
          var sp = document.createElement("span"); sp.className = cls; sp.textContent = w;
          sp.style.setProperty("--wi", out.length); frag.appendChild(sp); out.push(sp);
        });
        node.replaceChild(frag, c);
      });
    })(el);
    if (cls === "w") stWords = out;
    return out;
  }
  function translateTree(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) if (norm(n.nodeValue)) n.nodeValue = keepWs(n.nodeValue, tr(n.nodeValue));
  }
  splitEls.forEach(splitWords);

  var langBtn = $("#langBtn"), langMenu = $("#langMenu"), afterLang = [];
  function applyLang(l, animate) {
    var next = l === "es" || DICT[l] ? l : "es";
    function run() {
      lang = next; html.lang = lang;
      tNodes.forEach(function (t) { t.n.nodeValue = keepWs(t.s, t.k && lang !== "es" && DICT[lang][t.k] ? DICT[lang][t.k] : tr(t.s)); });
      tAttrs.forEach(function (t) { t.el.setAttribute(t.a, tr(t.s)); });
      splitEls.forEach(function (el) { el.innerHTML = el._src; translateTree(el); splitWords(el); });
      $$("[data-t]").forEach(setT);
      metaDesc.setAttribute("content", tr(metaSrc));
      $("#langCur").textContent = lang.toUpperCase();
      $$("[data-lang]", langMenu).forEach(function (b) { b.setAttribute("aria-checked", String(b.dataset.lang === lang)); });
      $$(".sheet-langs [data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.lang === lang)); });
      afterLang.forEach(function (f) { f(); });
    }
    if (animate && document.startViewTransition && !reduce && !document.hidden) quiet(document.startViewTransition(run)); else run();
  }
  // A view transition can be skipped (tab hidden, another one started); that is not an error.
  function quiet(vt) { var no = function () {}; vt.ready.catch(no); vt.finished.catch(no); vt.updateCallbackDone.catch(no); return vt; }
  function closeLangMenu() { langMenu.hidden = true; langBtn.setAttribute("aria-expanded", "false"); }
  langBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = langMenu.hidden; langMenu.hidden = !open; langBtn.setAttribute("aria-expanded", String(open));
    if (open) $("[aria-checked=true]", langMenu).focus();
  });
  langMenu.addEventListener("keydown", function (e) {
    var items = $$("button", langMenu), i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); }
    if (e.key === "Escape") { closeLangMenu(); langBtn.focus(); }
  });
  $$("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () { store("orbit-lang", b.dataset.lang); applyLang(b.dataset.lang, true); closeLangMenu(); });
  });
  document.addEventListener("click", function (e) { if (!langMenu.hidden && !e.target.closest(".lang")) closeLangMenu(); });

  /* ---------- Tema claro / oscuro ---------- */
  var themeBtn = $("#themeBtn");
  function themeLabel() { themeBtn.setAttribute("aria-label", tr(html.dataset.theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro")); }
  afterLang.push(themeLabel);
  themeBtn.addEventListener("click", function () {
    var t = html.dataset.theme === "dark" ? "light" : "dark";
    function apply() { html.dataset.theme = t; store("orbit-theme", t); themeLabel(); }
    if (!document.startViewTransition || reduce || document.hidden) return apply();
    // The new theme spreads out from the button as a circle.
    var r = themeBtn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    var end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    var vt = quiet(document.startViewTransition(apply));
    vt.ready.then(function () {
      html.animate({ clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + end + "px at " + x + "px " + y + "px)"] },
        { duration: 750, easing: "cubic-bezier(0.77, 0, 0.175, 1)", pseudoElement: "::view-transition-new(root)" });
    }, function () {});
  });
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
    if (!read("orbit-theme")) { html.dataset.theme = e.matches ? "dark" : "light"; themeLabel(); }
  });

  /* ---------- Header, menú y progreso ---------- */
  var hero = $("#inicio"), hdr = $(".hdr"), sheet = $("#sheet"), menuBtn = $("#menuBtn"), sprog = $("#sprog");
  var vcard = $("#vcard"), bgfx = $("#bgfx"), scrollTick = false;
  function onScroll() {
    if (scrollTick) return; scrollTick = true;
    requestAnimationFrame(function () {
      scrollTick = false;
      var y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
      hdr.classList.toggle("scrolled", y > 8);
      hdr.classList.toggle("dark", sheet.hidden && hero.getBoundingClientRect().bottom > hdr.offsetHeight);
      sprog.style.setProperty("--p", max > 0 ? (y / max).toFixed(4) : 0);
      if (!reduce) bgfx.style.setProperty("--sy", y.toFixed(0));
      fillStatement();
      if (!reduce) {
        var r = vcard.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) vcard.style.setProperty("--py", (((r.top + r.height / 2) / innerHeight - 0.5) * -40).toFixed(1) + "px");
      }
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  function setSheet(open) {
    sheet.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("lock", open); onScroll();
  }
  menuBtn.addEventListener("click", function () { setSheet(sheet.hidden); });
  sheet.addEventListener("click", function (e) { if (e.target.closest("a, [data-login]")) setSheet(false); });

  var navA = $$(".nav a");
  if ("IntersectionObserver" in window) {
    var so = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) navA.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id); }); });
    }, { rootMargin: "-45% 0px -50% 0px" });
    ["inicio", "problema", "soluciones", "como-funciona", "video", "resultados", "para-quien", "planes", "ruta", "preguntas", "contacto"].forEach(function (id) { var section=document.getElementById(id);if(section)so.observe(section); });
  }

  /* Segmented control helper */
  function moveInd(seg, btn) {
    var ind = $(".seg-ind", seg); if (!ind || !btn) return;
    ind.style.width = btn.offsetWidth + "px";
    ind.style.transform = "translateX(" + btn.offsetLeft + "px)";
  }

  /* ---------- Hero: visor AR / VR (cambia solo hasta que el visitante elige) ---------- */
  var modeSeg = $("#mode"), modeBtns = $$("button", modeSeg), scenes = $$(".scene", hero), heroVisible = true;
  function setMode(m, user, focus) {
    if (user) modeSeg.classList.remove("auto");
    if (hero.dataset.mode === m) return;
    hero.dataset.mode = m;
    modeBtns.forEach(function (b) {
      var on = b.dataset.mode === m; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1;
      if (on) { moveInd(modeSeg, b); if (focus) b.focus(); }
    });
    scenes.forEach(function (sc) {
      var on = sc.dataset.mode === m;
      if (!on && sc.classList.contains("on")) { sc.classList.add("prev"); setTimeout(function () { sc.classList.remove("prev"); }, 1050); }
      sc.classList.toggle("on", on); sc.setAttribute("aria-hidden", String(!on));
    });
  }
  modeBtns.forEach(function (b, i) {
    b.addEventListener("click", function () { setMode(b.dataset.mode, true); });
    b.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return;
      e.preventDefault(); setMode(modeBtns[(i + d + modeBtns.length) % modeBtns.length].dataset.mode, true, true);
    });
    // The progress bar under the active tab drives the auto-cycle, so hover-pause and timing stay in sync.
    b.addEventListener("animationend", function (e) {
      if (e.animationName !== "fill" || !modeSeg.classList.contains("auto")) return;
      setMode(hero.dataset.mode === "ar" ? "vr" : "ar");
    });
  });
  if (reduce) modeSeg.classList.remove("auto");
  if (/[?&]modo=vr(&|$)/.test(location.search)) setMode("vr", true);

  var visStage = $("#visStage"), cvMx = 0, cvMy = 0;
  if (fine && !reduce) {
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      visStage.style.setProperty("--ry", (x * 14).toFixed(2) + "deg");
      visStage.style.setProperty("--rx", (-y * 10).toFixed(2) + "deg");
      hero.style.setProperty("--gx", (e.clientX - r.left) + "px");
      hero.style.setProperty("--gy", (e.clientY - r.top) + "px");
      cvMx = x; cvMy = y;
    });
    hero.addEventListener("pointerleave", function () { visStage.style.setProperty("--ry", "0deg"); visStage.style.setProperty("--rx", "0deg"); cvMx = cvMy = 0; });
  }

  /* Hero: campo de órbitas (canvas). Eco del anillo del logo. */
  var cv = $("#heroCv"), ctx = cv.getContext ? cv.getContext("2d") : null;
  var cvW = 0, cvH = 0, stars = [], orbits = [], pX = 0, pY = 0, tint = 0, cvRaf = 0, cvRun = false;
  function cvSize() {
    if (!ctx) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cvW = cv.clientWidth; cvH = cv.clientHeight;
    cv.width = Math.round(cvW * dpr); cv.height = Math.round(cvH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.min(170, Math.round(cvW * cvH / 8000));
    stars = [];
    for (var i = 0; i < n; i++) stars.push({ x: Math.random() * cvW, y: Math.random() * cvH, z: Math.random() * 0.8 + 0.2, p: Math.random() * 6.283 });
    var wide = cvW > 1040, vis = $(".device").getBoundingClientRect(), hr = hero.getBoundingClientRect();
    var cx = vis.left - hr.left + vis.width / 2, cy = vis.top - hr.top + vis.height / 2, sz = Math.max(vis.width, 300) * (wide ? 0.62 : 0.66);
    orbits = [
      { cx: cx, cy: cy, rx: sz * 1.25, ry: sz * 0.36, rot: -0.3, sp: 0.00016, n: 26 },
      { cx: cx, cy: cy, rx: sz * 1.0, ry: sz * 0.62, rot: 0.55, sp: -0.00022, n: 18 },
      { cx: cx, cy: cy, rx: sz * 1.7, ry: sz * 0.52, rot: 0.14, sp: 0.0001, n: 34 }
    ];
  }
  function mix(a, b, t) { return [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * t); }).join(","); }
  function cvFrame(t) {
    if (!ctx) return;
    pX += (cvMx - pX) * 0.05; pY += (cvMy - pY) * 0.05;
    tint += ((hero.dataset.mode === "vr" ? 1 : 0) - tint) * 0.04;
    ctx.clearRect(0, 0, cvW, cvH);
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i], a = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(t * 0.0012 + st.p)) * st.z;
      var x = ((st.x - pX * 40 * st.z + t * 0.006 * st.z) % cvW + cvW) % cvW, y = st.y - pY * 30 * st.z;
      ctx.fillStyle = "rgba(220,215,255," + a.toFixed(3) + ")";
      ctx.fillRect(x, y, st.z * 1.7, st.z * 1.7);
    }
    var cHot = mix([255, 92, 170], [124, 108, 255], tint), cCool = mix([182, 156, 255], [111, 211, 255], tint);
    orbits.forEach(function (o, oi) {
      ctx.save();
      ctx.translate(o.cx - pX * 24, o.cy - pY * 18);
      ctx.rotate(o.rot + pX * 0.06);
      ctx.strokeStyle = "rgba(" + cCool + ",0.13)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, o.rx, o.ry, 0, 0, 6.2832); ctx.stroke();
      for (var k = 0; k < o.n; k++) {
        var ang = k / o.n * 6.2832 + t * o.sp, d = (Math.sin(ang) + 1) / 2, hot = k % 6 === 0;
        ctx.fillStyle = "rgba(" + (hot ? cHot : cCool) + "," + (0.12 + d * (hot ? 0.8 : 0.45)).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(Math.cos(ang) * o.rx, Math.sin(ang) * o.ry, (hot ? 1.4 : 0.7) + d * (hot ? 2.2 : 1.1), 0, 6.2832); ctx.fill();
      }
      var head = t * o.sp * 2.4 + oi * 2.1;
      for (var j = 0; j < 22; j++) {
        var ca = head - j * 0.022 * Math.sign(o.sp), cd = (Math.sin(ca) + 1) / 2;
        ctx.fillStyle = "rgba(" + (j < 2 ? "255,255,255" : cHot) + "," + ((1 - j / 22) * (0.35 + cd * 0.6)).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(Math.cos(ca) * o.rx, Math.sin(ca) * o.ry, (2.6 - j * 0.1) * (0.6 + cd * 0.6), 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    });
  }
  function cvLoop(t) { cvFrame(t); cvRaf = cvRun ? requestAnimationFrame(cvLoop) : 0; }
  function cvPlay() {
    var on = !reduce && !document.hidden && heroVisible;
    modeSeg.classList.toggle("paused", !on && !reduce);
    if (on && !cvRun) { cvRun = true; cvRaf = requestAnimationFrame(cvLoop); }
    if (!on) { cvRun = false; cancelAnimationFrame(cvRaf); }
  }
  cvSize(); cvFrame(0);
  var cvT;
  window.addEventListener("resize", function () { clearTimeout(cvT); cvT = setTimeout(function () { cvSize(); cvFrame(performance.now()); }, 150); });
  document.addEventListener("visibilitychange", cvPlay);
  if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { heroVisible = en[0].isIntersecting; cvPlay(); }).observe(hero);
  else cvPlay();

  /* ---------- Simuladores ---------- */
  var seg = $("#seg"), tabs = $$("[role=tab]", seg), stages = $$(".stage"), infos = $$(".info > div"), studio = $("#studio");
  function closePops() {
    $$(".hs[aria-expanded=true]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    $$(".pop.open").forEach(function (p) { p.classList.remove("open"); });
  }
  function select(k, focus) {
    closePops();
    if (!reduce) { studio.classList.remove("swept"); void studio.offsetWidth; studio.classList.add("swept"); }
    tabs.forEach(function (t) {
      var on = t.dataset.k === k; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1;
      if (on) { moveInd(seg, t); if (focus) t.focus(); $("#stName").textContent = $("b", t).textContent; }
    });
    stages.forEach(function (s) {
      var on = s.dataset.k === k; s.classList.toggle("on", on); s.setAttribute("aria-hidden", String(!on));
      $$(".hs", s).forEach(function (h) { h.tabIndex = on ? 0 : -1; });
    });
    infos.forEach(function (d) {
      var on = d.id === "p-" + k; d.classList.toggle("on", on); d.setAttribute("aria-hidden", String(!on));
      $$("a", d).forEach(function (a) { a.tabIndex = on ? 0 : -1; });
    });
  }
  if (!reduce) seg.classList.add("auto");
  tabs.forEach(function (t, i) {
    $(".pbar", t).addEventListener("animationend", function () { if (seg.classList.contains("auto")) select(tabs[(i + 1) % tabs.length].dataset.k); });
    t.addEventListener("click", function () { seg.classList.remove("auto"); select(t.dataset.k); });
    t.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return;
      e.preventDefault(); seg.classList.remove("auto"); select(tabs[(i + d + tabs.length) % tabs.length].dataset.k, true);
    });
  });
  $$("[data-k]", $(".ftr")).forEach(function (a) { a.addEventListener("click", function () { seg.classList.remove("auto"); select(a.dataset.k); }); });
  $$(".hs").forEach(function (h) {
    h.addEventListener("click", function (e) {
      e.stopPropagation();
      var pop = document.getElementById(h.getAttribute("aria-controls")), was = h.getAttribute("aria-expanded") === "true";
      closePops();
      seg.classList.remove("auto");
      if (!was) { h.setAttribute("aria-expanded", "true"); pop.classList.add("open"); }
    });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".pop")) closePops(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePops(); });
  if (fine && !reduce) {
    studio.addEventListener("pointermove", function (e) {
      var r = studio.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      $$(".imgbox", studio).forEach(function (b) { b.style.setProperty("--ry", (x * 10).toFixed(2) + "deg"); b.style.setProperty("--rx", (-y * 7).toFixed(2) + "deg"); });
    });
    studio.addEventListener("pointerleave", function () {
      $$(".imgbox", studio).forEach(function (b) { b.style.setProperty("--ry", "0deg"); b.style.setProperty("--rx", "0deg"); });
    });
  }

  /* ---------- Cómo funciona: pasos que avanzan solos ---------- */
  var steps = $("#steps"), sbs = $$(".sb", steps), sms = $$(".sm", steps);
  if (!reduce) steps.classList.add("auto");
  function setStep(i, user, focus) {
    if (user) steps.classList.remove("auto");
    sbs.forEach(function (b, j) { var on = j === i; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    sms.forEach(function (m, j) {
      var on = j === i;
      if (!on && m.classList.contains("on")) { m.classList.add("prev"); setTimeout(function () { m.classList.remove("prev"); }, 1050); }
      m.classList.toggle("on", on); m.setAttribute("aria-hidden", String(!on));
      $$("button", m).forEach(function (b) { b.tabIndex = on ? 0 : -1; });
    });
  }
  sbs.forEach(function (b, i) {
    b.addEventListener("click", function () { setStep(i, true); });
    b.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0; if (!d) return;
      e.preventDefault(); setStep((i + d + sbs.length) % sbs.length, true, true);
    });
    $(".sbar", b).addEventListener("animationend", function () { if (steps.classList.contains("auto")) setStep((i + 1) % sbs.length); });
  });

  /* ---------- Para quién: sistema orbital ---------- */
  var osys = $("#osys"), oVis = $("#osysVis"), nodes = $$(".onode", osys), ocards = $$(".ocard", osys), oLink = $("#osLink");
  var sats = $$(".osats i", osys), satT = 0;
  var oAng = Math.PI / 2, oTarget = null, oActive = 0, oRun = false, oLast = 0, oRaf = 0, oVisible = false;
  var TAU = Math.PI * 2, STEP = TAU / 4;
  if (!reduce) osys.classList.add("auto");
  function oLayout() {
    var w = oVis.clientWidth, h = oVis.clientHeight, rx = w * 0.42, ry = h * 0.30, cx = w / 2, cy = h / 2;
    nodes.forEach(function (n, i) {
      var a = oAng - i * STEP, x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a), d = (Math.sin(a) + 1) / 2;
      n.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) translate(-50%, -33px) scale(" + (0.74 + 0.32 * d).toFixed(3) + ")";
      n.style.zIndex = d > 0.45 ? 3 : 1;
      n.style.opacity = (0.5 + 0.5 * d).toFixed(2);
      if (i === oActive) { oLink.setAttribute("x1", cx); oLink.setAttribute("y1", cy); oLink.setAttribute("x2", x.toFixed(1)); oLink.setAttribute("y2", y.toFixed(1)); }
    });
  }
  // Small satellites travel along the two inner orbits so the rings read as orbits, not static lines.
  function oSats() {
    var w = oVis.clientWidth, h = oVis.clientHeight, cx = w / 2, cy = h / 2;
    sats.forEach(function (sat, k) {
      var inner = k % 2, rx = w * (inner ? 0.26 : 0.42), ry = h * (inner ? 0.17 : 0.30);
      var a = satT * (inner ? -0.00042 : 0.00026) + k * 0.785, d = (Math.sin(a) + 1) / 2;
      sat.style.transform = "translate(" + (cx + rx * Math.cos(a)).toFixed(1) + "px," + (cy + ry * Math.sin(a)).toFixed(1) + "px) scale(" + (0.6 + 0.6 * d).toFixed(2) + ")";
      sat.style.opacity = (0.35 + 0.65 * d).toFixed(2);
    });
  }
  function oFrame(t) {
    var dt = Math.min(64, t - (oLast || t)); oLast = t; satT += dt; oSats();
    if (oTarget !== null) {
      var diff = oTarget - oAng; oAng += diff * Math.min(1, dt * 0.0045);
      if (Math.abs(diff) < 0.002) { oAng = oTarget; oTarget = null; }
    } else oAng += dt * 0.00005;
    oLayout();
    oRaf = oRun ? requestAnimationFrame(oFrame) : 0;
  }
  function oPlay() {
    var on = !reduce && oVisible && !document.hidden;
    if (on && !oRun) { oRun = true; oLast = 0; oRaf = requestAnimationFrame(oFrame); }
    if (!on) { oRun = false; cancelAnimationFrame(oRaf); }
  }
  function setNode(i, user) {
    if (user) osys.classList.remove("auto");
    oActive = i;
    nodes.forEach(function (n, j) { n.classList.toggle("on", j === i); n.setAttribute("aria-pressed", String(j === i)); });
    ocards.forEach(function (c, j) { c.classList.toggle("on", j === i); c.setAttribute("aria-hidden", String(j !== i)); });
    // Rotate the system so the chosen node comes to the front (bottom of the ellipse).
    var want = Math.PI / 2 + i * STEP, k = Math.round((oAng - want) / TAU);
    oTarget = want + k * TAU; if (oTarget < oAng - Math.PI) oTarget += TAU;
    if (reduce || !oRun) { oAng = oTarget; oTarget = null; oLayout(); }
  }
  nodes.forEach(function (n, i) { n.addEventListener("click", function () { setNode(i, true); }); });
  ocards.forEach(function (c, i) { $(".obar", c).addEventListener("animationend", function () { if (osys.classList.contains("auto")) setNode((i + 1) % nodes.length); }); });
  oLayout(); oSats();
  window.addEventListener("resize", function () { oLayout(); oSats(); });
  document.addEventListener("visibilitychange", oPlay);
  if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { oVisible = en[0].isIntersecting; osys.classList.toggle("paused", !oVisible); oPlay(); }).observe(osys);

  /* Autoplay only while visible */
  if ("IntersectionObserver" in window) {
    var po = new IntersectionObserver(function (en) { en.forEach(function (e) { e.target.classList.toggle("paused", !e.isIntersecting); }); }, { threshold: 0.2 });
    po.observe(steps); po.observe($("#seg"));
  }

  /* ---------- Equipo: tarjetas con inclinación 3D ---------- */
  if (fine && !reduce) {
    $$(".tm-card").forEach(function (c) {
      c.addEventListener("pointermove", function (e) {
        var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        c.style.setProperty("--ry", (x * 16).toFixed(2) + "deg"); c.style.setProperty("--rx", (-y * 12).toFixed(2) + "deg");
      });
      c.addEventListener("pointerleave", function () { c.style.setProperty("--ry", "0deg"); c.style.setProperty("--rx", "0deg"); });
    });
  }

  /* Mini quiz */
  var quizBtns = $$("#quiz button");
  quizBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      steps.classList.remove("auto");
      quizBtns.forEach(function (o) { o.classList.remove("ok", "no"); var s = $("span", o); s.dataset.t = ""; setT(s); });
      var ok = b.dataset.ok === "1", s = $("span", b);
      void b.offsetWidth; b.classList.add(ok ? "ok" : "no");
      s.dataset.t = ok ? "Correcto" : "Intenta otra"; setT(s);
    });
  });

  /* ---------- Contadores y anillos ---------- */
  var counted = false;
  function count() {
    if (counted) return; counted = true;
    if (reduce) return;
    $$("[data-count]").forEach(function (el) {
      var end = parseFloat(el.dataset.count), dec = +el.dataset.dec, t0 = performance.now(), dur = 1800;
      (function f(now) { var p = Math.min(1, (now - t0) / dur), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; el.textContent = (end * e).toFixed(dec); if (p < 1) requestAnimationFrame(f); })(t0);
    });
  }

  /* FAQ */
  $$("#faq .qa").forEach(function (qa) {
    var b = $("button", qa);
    b.addEventListener("click", function () {
      var open = !qa.classList.contains("open");
      $$("#faq .qa").forEach(function (o) { o.classList.remove("open"); $("button", o).setAttribute("aria-expanded", "false"); });
      if (open) { qa.classList.add("open"); b.setAttribute("aria-expanded", "true"); }
    });
  });

  /* ---------- Copiar ---------- */
  function copy(text, btn, label, node) {
    function back() { setTimeout(function () { setT(btn); }, 1700); }
    function ok() { btn.textContent = tr(label); back(); }
    function fb() { try { var r = document.createRange(); r.selectNodeContents(node); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} btn.textContent = tr("Seleccionado"); back(); }
    try { navigator.clipboard.writeText(text).then(ok, fb); } catch (e) { fb(); }
  }
  $("#copyMail").addEventListener("click", function () { copy("orbitunivalle@gmail.com", this, "Copiado", $("#mail")); });

  /* ---------- Formulario de demo ---------- */
  var form = $("#demoForm"), ready = $("#ready"), err = $("#formErr"), lastMiss = null, lastReq = null;
  function showErr() { err.textContent = tr("Para preparar la solicitud falta") + " " + lastMiss.map(tr).join(", ") + "."; err.hidden = false; }
  function buildReq() {
    var r = lastReq, t = tr("Hola equipo ORBIT,") + "\n\n" + tr("Quiero solicitar una demo.") + "\n\n" + tr("Nombre") + ": " + r.n + "\n" + tr("Institución") + ": " + r.o + "\n" + tr("Tipo") + ": " + tr(r.k) + "\n" + tr("Correo") + ": " + r.m + (r.msg ? "\n\n" + tr("Mensaje") + ":\n" + r.msg : "") + "\n\n" + tr("Gracias.");
    $("#demoText").textContent = t;
    $("#mailDemo").href = "mailto:orbitunivalle@gmail.com?subject=" + encodeURIComponent(tr("Solicitud de demo ORBIT") + " - " + r.o) + "&body=" + encodeURIComponent(t);
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var n = form.nombre.value.trim(), o = form.institucion.value.trim(), m = form.correo.value.trim(), miss = [];
    if (!n) miss.push("tu nombre"); if (!o) miss.push("tu institución"); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) miss.push("un correo válido");
    if (miss.length) { lastMiss = miss; showErr(); return; }
    lastMiss = null; err.hidden = true;
    var opt = form.tipo.options[form.tipo.selectedIndex];
    lastReq = { n: n, o: o, m: m, k: tNodes.filter(function (t) { return t.n.parentElement === opt; }).map(function (t) { return norm(t.s); })[0] || opt.text, msg: form.mensaje.value.trim() };
    var submit=form.querySelector('[type="submit"]');submit.disabled=true;
    fetch("api/index.php?r=solicitudes",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({nombre:lastReq.n,institucion:lastReq.o,email:lastReq.m,tipo:lastReq.k,mensaje:lastReq.msg,sitio_web:""})}).then(function(res){return res.json().then(function(data){if(!res.ok)throw new Error(data.error||"No se pudo guardar la solicitud.");return data;});}).then(function(){buildReq();form.hidden=true;ready.hidden=false;$("#copyDemo").focus();}).catch(function(error){err.textContent=error.message;err.hidden=false;}).finally(function(){submit.disabled=false;});
  });
  afterLang.push(function () { if (lastMiss && !err.hidden) showErr(); if (lastReq && !ready.hidden) buildReq(); });
  $("#copyDemo").addEventListener("click", function () { copy($("#demoText").textContent, this, "Solicitud copiada", $("#demoText")); });
  $("#editDemo").addEventListener("click", function () { ready.hidden = true; form.hidden = false; form.nombre.focus(); });

  /* ---------- Acceso a la plataforma ORBIT ---------- */
  var lg = $("#lg"), lgForm = $("#lgForm"), lgDone = $("#lgDone"), lmsg = $("#lmsg"), last = null;
  function openLg() {
    last = document.activeElement; lg.hidden = false; document.body.classList.add("lock");
    lgForm.hidden = false; lgDone.hidden = true; lmsg.hidden = true;
    requestAnimationFrame(function () { lg.classList.add("show"); });
    setTimeout(function () { $("#l-mail").focus(); }, 60);
  }
  function closeLg() {
    lg.classList.remove("show"); document.body.classList.remove("lock");
    setTimeout(function () { lg.hidden = true; }, reduce ? 0 : 200);
    if (last && last.focus) last.focus();
  }
  $$("[data-login]").forEach(function (b) { b.addEventListener("click", openLg); });
  $("#lgClose").addEventListener("click", closeLg);
  lg.addEventListener("click", function (e) { if (e.target === lg) closeLg(); });
  document.addEventListener("keydown", function (e) {
    if (lg.hidden) return;
    if (e.key === "Escape") closeLg();
    if (e.key === "Tab") {
      var f = $$("button, input, a[href]", lg).filter(function (el) { return el.offsetParent !== null; });
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });
  var pass = $("#l-pass"), eye = $("#eye");
  eye.addEventListener("click", function () { var s = pass.type === "password"; pass.type = s ? "text" : "password"; eye.dataset.t = s ? "Ocultar" : "Mostrar"; setT(eye); });
  function msg(text, bad) { lmsg.className = bad ? "lmsg bad" : "lmsg"; lmsg.dataset.t = text; setT(lmsg); lmsg.hidden = false; }
  $("#forgot").addEventListener("click", function () { msg("Escríbenos a orbitunivalle@gmail.com desde el correo de tu cuenta y te ayudamos a recuperarla."); });
  lgForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("#l-mail").value.trim()) || !pass.value) { msg("Escribe tu correo y tu contraseña para ingresar.", true); return; }
    var btn = $("#lgSubmit"); btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + tr("Ingresando");
    fetch("api/index.php?r=auth/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("#l-mail").value.trim(),password:pass.value})}).then(function(res){return res.json().then(function(data){if(!res.ok)throw new Error(data.error||"No se pudo iniciar sesión.");return data;});}).then(function(){pass.value="";location.href="panel.html";}).catch(function(error){msg(error.message,true);}).finally(function(){btn.disabled=false;setT(btn);});
  });
  $("#lgBack").addEventListener("click", function () { lgDone.hidden = true; lgForm.hidden = false; lmsg.hidden = true; });
  $$("[data-contact]").forEach(function (b) { b.addEventListener("click", function () { closeLg(); document.getElementById("contacto").scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }); });
  if (location.hash === "#login") openLg();

  /* ---------- Movimiento al hacer scroll ---------- */
  var statement = $(".statement");
  if (!reduce) statement.classList.add("fill");
  function fillStatement() {
    if (reduce || !stWords.length) return;
    var r = statement.getBoundingClientRect(), vh = window.innerHeight;
    var p = Math.min(1, Math.max(0, (vh * 0.88 - r.top) / (vh * 0.5 + r.height * 0.4)));
    var n = Math.round(p * stWords.length);
    for (var i = 0; i < stWords.length; i++) stWords[i].classList.toggle("lit", i < n);
  }
  afterLang.push(fillStatement);

  if ("IntersectionObserver" in window) {
    var ro = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in"); ro.unobserve(e.target);
        if (e.target.classList.contains("gauge")) count();
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    $$(".kicker, .head > .lead, .statement, .pc, #seg, .showcase > *, .steps-list, .steps-media, .vframe, .vmeta, .gauge, .osys-vis, .osys-panel, .plan, .fine, .road li, .tm, .faq .lead, .qa, .contact > div:not(.blobs), .partners h2, .ftr-cta, .ftr-grid > div").forEach(function (el) {
      var sib = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.setProperty("--d", Math.min(sib, 5) * 90 + "ms");
      el.classList.add("rv"); ro.observe(el);
    });
    $$("[data-split]:not([data-split=words])").forEach(function (el) { el.classList.add("split-on"); ro.observe(el); });
    var road = $("#road"); road.classList.add("rv-line"); ro.observe(road);
  } else {
    html.classList.add("no-io"); count();
  }

  /* Spotlight on cards + magnetic buttons */
  if (fine && !reduce) {
    document.addEventListener("pointermove", function (e) {
      var c = e.target.closest && e.target.closest(".spot"); if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
    $$(".cta-row .btn, .hdr-actions .btn, .form-foot .btn, .vplay").forEach(function (b) {
      var el = b.classList.contains("vplay") ? b.parentNode : b;
      el.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
        b.style.translate = (x * 0.22).toFixed(1) + "px " + (y * 0.3).toFixed(1) + "px";
      });
      el.addEventListener("pointerleave", function () { b.style.translate = ""; });
    });
  }

  /* Ambient light that follows the cursor across the page */
  if (fine && !reduce) {
    var glow = document.createElement("div"), gx = -999, gy = -999, tx = -999, ty = -999, gRaf = 0;
    glow.className = "cglow"; glow.setAttribute("aria-hidden", "true"); document.body.insertBefore(glow, document.body.firstChild);
    function gStep() {
      gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12;
      glow.style.setProperty("--cx", gx.toFixed(1) + "px"); glow.style.setProperty("--cy", gy.toFixed(1) + "px");
      gRaf = Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5 ? requestAnimationFrame(gStep) : 0;
    }
    document.addEventListener("pointermove", function (e) {
      if (gx === -999) { gx = e.clientX; gy = e.clientY; }
      tx = e.clientX; ty = e.clientY; glow.classList.toggle("on", !hero.contains(e.target));
      if (!gRaf) gRaf = requestAnimationFrame(gStep);
    }, { passive: true });
    document.addEventListener("pointerleave", function () { glow.classList.remove("on"); });
  }

  /* ---------- Arranque ---------- */
  function relayout() {
    moveInd(seg, $("[aria-selected=true]", seg));
    moveInd(modeSeg, $("[aria-selected=true]", modeSeg));
   
  }
  afterLang.push(relayout);
  window.addEventListener("resize", relayout);
  var saved = read("orbit-lang"), nav = (navigator.language || "es").slice(0, 2).toLowerCase();
  var qLang = /[?&]lang=(es|en|pt)/.exec(location.search);
  applyLang(qLang ? qLang[1] : saved || (DICT[nav] ? nav : "es"), false);
  themeLabel();
  relayout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  onScroll();
})();
