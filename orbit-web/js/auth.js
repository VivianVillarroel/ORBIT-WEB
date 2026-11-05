/* Account flows: verification codes never enter URLs or persistent browser storage. */
(function () {
  "use strict";
  var challenge = null,
    registration = document.getElementById("rgForm"),
    recovery = document.getElementById("resetForm");
  function notice(id, message, bad) {
    var el = document.getElementById(id);
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle("bad", !!bad);
  }
  async function call(route, body) {
    var response = await fetch("/api/auth/" + route, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "No se pudo completar la operación.");
    return result;
  }
  function codeForm(form) {
    var section = document.createElement("div");
    section.className = "lf";
    section.hidden = true;
    section.innerHTML =
      '<label for="verificationCode">Código de 6 dígitos</label><input id="verificationCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"><p>El código vence en 10 minutos. Revisa también la carpeta de spam.</p><button type="button" class="txtbtn" id="restartCode">Cambiar datos o solicitar otro código</button>';
    form.append(section);
    section
      .querySelector("#restartCode")
      .addEventListener("click", function () {
        challenge = null;
        section.hidden = true;
        form.querySelectorAll("[data-initial]").forEach(function (e) {
          e.hidden = false;
        });
        var btn = form.querySelector('[type="submit"]');
        btn.textContent = registration
          ? "Enviar código"
          : "Enviar código de recuperación";
      });
    return section;
  }
  if (registration) {
    var section = codeForm(registration),
      button = document.getElementById("rgSubmit");
    registration.querySelectorAll(".lf").forEach(function (e) {
      if (e !== section) e.dataset.initial = "true";
    });
    button.textContent = "Enviar código";
    registration.addEventListener("submit", async function (e) {
      e.preventDefault();
      button.disabled = true;
      try {
        if (!challenge) {
          var password = document.getElementById("r-pass").value;
          if (password.length < 12)
            throw new Error("Usa una contraseña de al menos 12 caracteres.");
          var result = await call("register", {
            nombre: document.getElementById("r-nom").value,
            apellido: document.getElementById("r-ape").value,
            email: document.getElementById("r-mail").value,
            password: password,
          });
          challenge = result.challenge;
          document.getElementById("r-pass").value = "";
          registration
            .querySelectorAll("[data-initial]")
            .forEach(function (el) {
              el.hidden = true;
            });
          section.hidden = false;
          button.textContent = "Verificar y crear cuenta";
          notice("rmsg", result.message, false);
          document.getElementById("verificationCode").focus();
        } else {
          await call("verify-register", {
            challenge: challenge,
            code: document.getElementById("verificationCode").value,
          });
          location.href =
            "panel.html" +
            (new URLSearchParams(location.search).get("plan") === "premium"
              ? "#/plan"
              : "");
        }
      } catch (err) {
        notice("rmsg", err.message, true);
      } finally {
        button.disabled = false;
      }
    });
  }
  if (recovery) {
    var codeSection = codeForm(recovery),
      btn = recovery.querySelector('[type="submit"]'),
      passwordBox = document.getElementById("newPasswordBox");
    recovery.addEventListener("submit", async function (e) {
      e.preventDefault();
      btn.disabled = true;
      try {
        if (!challenge) {
          var result = await call("forgot", {
            email: document.getElementById("resetEmail").value,
          });
          challenge = result.challenge;
          codeSection.hidden = false;
          passwordBox.hidden = false;
          btn.textContent = "Actualizar contraseña";
          notice("resetMessage", result.message, false);
        } else {
          var password = document.getElementById("resetPassword").value;
          if (password !== document.getElementById("resetConfirm").value)
            throw new Error("Las contraseñas no coinciden.");
          await call("reset", {
            challenge: challenge,
            code: document.getElementById("verificationCode").value,
            password: password,
          });
          recovery.reset();
          recovery.hidden = true;
          notice(
            "resetMessage",
            "Contraseña actualizada. Ya puedes iniciar sesión.",
            false,
          );
        }
      } catch (err) {
        notice("resetMessage", err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
