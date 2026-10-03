(function () {
  const MIN_PASSWORD_LEN = 8;

  function setStatus(message, type) {
    const statusEl = document.getElementById("reset-status");
    if (!statusEl) return;

    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (type === "error") statusEl.classList.add("is-error");
    if (type === "success") statusEl.classList.add("is-success");
  }

  function setSubmitDisabled(isDisabled, text) {
    const submitBtn = document.getElementById("reset-submit");
    if (!submitBtn) return;
    submitBtn.disabled = Boolean(isDisabled);
    if (text) {
      submitBtn.textContent = text;
    }
  }

  function setResetFormDisabled(isDisabled) {
    const form = document.getElementById("reset-form");
    if (!form) return;

    form.querySelectorAll("input, [data-toggle-password]").forEach((field) => {
      if (field instanceof HTMLInputElement || field instanceof HTMLButtonElement) {
        field.disabled = Boolean(isDisabled);
      }
    });
  }

  function initPasswordToggles() {
    const toggleButtons = document.querySelectorAll("[data-toggle-password]");
    if (!toggleButtons.length) return;

    toggleButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-toggle-password");
        const targetInput = targetId ? document.getElementById(targetId) : null;
        if (!(targetInput instanceof HTMLInputElement)) return;

        const shouldShow = targetInput.type === "password";
        targetInput.type = shouldShow ? "text" : "password";
        button.classList.toggle("is-visible", shouldShow);
        button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
      });
    });
  }

  function getCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("code") || "").trim();
  }

  async function waitForRecoverySession(timeoutMs) {
    const initial = await window.ClashlyAuth.getSession();
    if (initial.error) {
      throw initial.error;
    }
    if (initial.session && initial.session.user) {
      return true;
    }

    return new Promise((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (subscription && subscription.data && subscription.data.subscription) {
          subscription.data.subscription.unsubscribe();
        }
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, timeoutMs);

      const subscription = window.ClashlyAuth.onAuthStateChange((event, session) => {
        if (settled) return;
        const isRecovery = event === "PASSWORD_RECOVERY" || event === "SIGNED_IN";
        if (!isRecovery || !session || !session.user) return;

        settled = true;
        window.clearTimeout(timer);
        if (subscription && subscription.data && subscription.data.subscription) {
          subscription.data.subscription.unsubscribe();
        }
        resolve(true);
      });
    });
  }

  async function resolveRecoveryAccess() {
    if (!window.ClashlySupabase || !window.ClashlySupabase.isConfigured()) {
      throw new Error("Supabase is not configured. Update js/env.js.");
    }

    const code = getCodeFromUrl();
    if (code) {
      const exchangeResult = await window.ClashlyAuth.exchangeCodeForSession(code);
      if (exchangeResult.error) {
        throw exchangeResult.error;
      }
    }

    const hasSession = await waitForRecoverySession(7000);
    if (!hasSession) {
      throw new Error("Reset link is invalid or expired. Request a new one from login.");
    }
  }

  function validatePasswords(password, confirmPassword) {
    if (!password || password.length < MIN_PASSWORD_LEN) {
      return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
    }

    if (password !== confirmPassword) {
      return "Passwords do not match.";
    }

    return "";
  }

  function mapResetError(error) {
    const raw = error instanceof Error ? error.message : "Could not update password.";
    const message = raw.toLowerCase();

    if (message.includes("expired") || message.includes("invalid")) {
      return "Reset link is invalid or expired. Request a new one from login.";
    }

    if (message.includes("password should be at least")) {
      return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
    }

    if (
      message.includes("failed to fetch") ||
      message.includes("network request failed") ||
      message.includes("networkerror") ||
      message.includes("load failed")
    ) {
      if (window.location.protocol === "file:") {
        return "Cannot connect from local file:// URL. Please open Clashe using a local server (e.g. VS Code Live Server or 'npx serve').";
      }
      return "Could not reach Supabase. Check your connection and try again.";
    }

    if (raw && raw !== "Could not update password.") {
      return raw;
    }

    return window.ClashlyUtils.reportError("Password reset failed.", error, "Could not update password.");
  }

  function initResetForm() {
    const form = document.getElementById("reset-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus("", "");

      const formData = new FormData(form);
      const password = String(formData.get("password") || "");
      const confirmPassword = String(formData.get("confirm_password") || "");
      const validationError = validatePasswords(password, confirmPassword);
      if (validationError) {
        setStatus(validationError, "error");
        return;
      }

      setSubmitDisabled(true, "Updating...");

      try {
        const currentUserResult = await window.ClashlyAuth.getCurrentUser();
        if (currentUserResult.error) {
          throw currentUserResult.error;
        }
        if (!window.ClashlyAuth.canChangePassword(currentUserResult.user)) {
          throw new Error("Only accounts created with a Gmail address and password can change password here.");
        }

        const updateResult = await window.ClashlyAuth.updatePassword(password);
        if (updateResult.error) {
          throw updateResult.error;
        }

        setStatus("Password updated successfully. Redirecting to login...", "success");
        window.setTimeout(() => {
          window.location.replace("auth.html");
        }, 700);
      } catch (error) {
        setStatus(mapResetError(error), "error");
      } finally {
        setSubmitDisabled(false, "Update password");
      }
    });
  }

  async function bootResetPage() {
    if (!window.ClashlyAuth) return;

    initPasswordToggles();
    initResetForm();
    setResetFormDisabled(true);

    let canSubmit = false;
    setSubmitDisabled(true, "Checking link...");
    try {
      await resolveRecoveryAccess();
      const currentUserResult = await window.ClashlyAuth.getCurrentUser();
      if (currentUserResult.error) {
        throw currentUserResult.error;
      }
      if (!window.ClashlyAuth.canChangePassword(currentUserResult.user)) {
        setStatus("Only accounts created with a Gmail address and password can change password here.", "error");
        return;
      }

      canSubmit = true;
      setStatus("Reset link verified. Enter your new password.", "success");
    } catch (error) {
      setStatus(mapResetError(error), "error");
    } finally {
      setResetFormDisabled(!canSubmit);
      setSubmitDisabled(!canSubmit, "Update password");
    }
  }

  document.addEventListener("DOMContentLoaded", bootResetPage);
})();
