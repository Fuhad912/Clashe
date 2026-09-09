(function () {
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let currentUserEmail = "";
  let deleteInFlight = false;
  let unsubscribePwaState = null;

  function setEmailFormDisabled(isDisabled) {
    const input = document.getElementById("settings-new-email");
    const submitBtn = document.getElementById("settings-email-submit");

    if (input instanceof HTMLInputElement) {
      input.disabled = Boolean(isDisabled);
    }
    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = Boolean(isDisabled);
    }
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function setEmailStatus(message, type) {
    const statusEl = document.getElementById("settings-email-status");
    if (!statusEl) return;

    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (type === "error") statusEl.classList.add("is-error");
    if (type === "success") statusEl.classList.add("is-success");
  }

  function setDeleteStatus(message, type) {
    const statusEl = document.getElementById("settings-delete-status");
    if (!statusEl) return;

    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (type === "error") statusEl.classList.add("is-error");
    if (type === "success") statusEl.classList.add("is-success");
  }

  function setInstallStatus(message, type) {
    const statusEl = document.getElementById("settings-install-status");
    if (!statusEl) return;

    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (type === "error") statusEl.classList.add("is-error");
    if (type === "success") statusEl.classList.add("is-success");
  }

  function getInstallElements() {
    return {
      card: document.getElementById("settings-install-card"),
      copy: document.getElementById("settings-install-copy"),
      trigger: document.getElementById("settings-install-trigger"),
      status: document.getElementById("settings-install-status"),
    };
  }

  function isIosLikeDevice() {
    const ua = window.navigator.userAgent || "";
    const platform = window.navigator.platform || "";
    return /iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  }

  function renderInstallState(state) {
    const { card, copy, trigger } = getInstallElements();
    if (!card || !copy || !trigger) return;

    const safeState = state || {};
    const isInstalled = Boolean(safeState.installed);
    const canInstall = Boolean(safeState.canInstall);
    const promptOutcome = String(safeState.promptOutcome || "");
    const secureContext = safeState.secureContext !== false;
    const serviceWorkerReady = safeState.serviceWorkerReady !== false;
    const promptCaptured = Boolean(safeState.promptCaptured);
    const iosLike = isIosLikeDevice();

    if (isInstalled) {
      card.hidden = false;
      copy.textContent = "Clashe is already installed on this device.";
      trigger.hidden = true;
      trigger.disabled = true;
      setInstallStatus("Installed.", "success");
      return;
    }

    if (canInstall) {
      card.hidden = false;
      copy.textContent = "Install Clashe for faster access and an app-like experience.";
      trigger.hidden = false;
      trigger.disabled = false;
      trigger.textContent = "Install Clashe";
      setInstallStatus("", "");
      return;
    }

    if (!secureContext) {
      card.hidden = false;
      copy.textContent = "Install is unavailable because this page is not running on HTTPS or localhost.";
      trigger.hidden = true;
      trigger.disabled = true;
      setInstallStatus("Use HTTPS or localhost to enable install.", "error");
      return;
    }

    if (iosLike) {
      card.hidden = false;
      copy.textContent = "On iPhone or iPad, install Clashe from Safari using Share, then Add to Home Screen.";
      trigger.hidden = true;
      trigger.disabled = true;
      setInstallStatus("Manual install is required on iOS.", "");
      return;
    }

    if (!serviceWorkerReady) {
      card.hidden = false;
      copy.textContent = "Clashe is preparing install support for this browser.";
      trigger.hidden = true;
      trigger.disabled = true;
      setInstallStatus("If you just opened Clashe for the first time, reload once after a moment.", "");
      return;
    }

    if (!promptCaptured) {
      card.hidden = false;
      copy.textContent =
        "This browser has not exposed the install prompt yet. Open Clashe in Chrome or Edge over HTTPS or localhost, visit the home page once, then reload Settings.";
      trigger.hidden = true;
      trigger.disabled = true;
      setInstallStatus("No install prompt has been captured from the browser yet.", "");
      return;
    }

    if (promptOutcome === "accepted") {
      card.hidden = false;
      copy.textContent = "Install accepted. Finishing setup on this device.";
      trigger.hidden = true;
      trigger.disabled = true;
      setInstallStatus("Waiting for install confirmation...", "success");
      return;
    }

    if (promptOutcome === "dismissed") {
      card.hidden = false;
      copy.textContent = "Install prompt dismissed for now. It will show again when the browser offers it again.";
      trigger.hidden = true;
      trigger.disabled = true;
      setInstallStatus("", "");
      return;
    }

    card.hidden = false;
    copy.textContent =
      "Install will appear here when this browser makes Clashe eligible. If this is your first visit, wait a moment and reload once. In Chrome or Edge, you can also check the browser menu for Install app.";
    trigger.hidden = true;
    trigger.disabled = true;
    setInstallStatus("", "");
  }

  async function handleInstallClick() {
    if (!window.ClashlyPWA) return;

    const { trigger } = getInstallElements();
    if (!(trigger instanceof HTMLButtonElement)) return;

    trigger.disabled = true;
    trigger.textContent = "Opening...";
    setInstallStatus("", "");

    try {
      const result = await window.ClashlyPWA.promptInstall();

      if (result && result.outcome === "accepted") {
        setInstallStatus("Install accepted. Finishing setup...", "success");
      } else if (result && result.outcome === "dismissed") {
        setInstallStatus("Install dismissed for now.", "");
      } else if (result && result.status === "unavailable") {
        setInstallStatus("Install is not available on this device right now.", "error");
      }
    } catch (error) {
      setInstallStatus("Could not open the install prompt.", "error");
      window.ClashlyUtils.reportError("PWA install prompt failed.", error, "Could not open install prompt.");
    } finally {
      renderInstallState(window.ClashlyPWA.getState());
    }
  }

  function getDeleteModalElements() {
    return {
      modal: document.getElementById("settings-delete-modal"),
      confirmBtn: document.getElementById("settings-delete-confirm"),
      cancelBtn: document.getElementById("settings-delete-cancel"),
    };
  }

  function openDeleteModal() {
    const { modal, confirmBtn } = getDeleteModalElements();
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("has-settings-confirm-open");
    window.requestAnimationFrame(() => {
      modal.classList.add("is-open");
      if (confirmBtn) confirmBtn.focus();
    });
  }

  function closeDeleteModal() {
    if (deleteInFlight) return;
    const { modal } = getDeleteModalElements();
    if (!modal) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("has-settings-confirm-open");
    window.setTimeout(() => {
      if (!modal.classList.contains("is-open")) {
        modal.hidden = true;
      }
    }, 180);
  }

  function getEmailUpdateErrorMessage(error) {
    const message = String((error && error.message) || "").toLowerCase();
    if (!message) return "Could not update email.";
    if (message.includes("same") || message.includes("already") || message.includes("in use")) {
      return "That email is already in use. Try another email address.";
    }
    if (message.includes("invalid")) {
      return "Enter a valid email address.";
    }
    if (message.includes("rate limit")) {
      return "Too many attempts. Please wait and try again.";
    }
    return "Could not update email.";
  }

  async function handleEmailChangeSubmit(event) {
    event.preventDefault();
    if (!window.ClashlyAuth) return;

    const input = document.getElementById("settings-new-email");
    const submitBtn = document.getElementById("settings-email-submit");
    if (!(input instanceof HTMLInputElement) || !(submitBtn instanceof HTMLButtonElement)) return;

    const nextEmail = normalizeEmail(input.value);
    if (!nextEmail || !EMAIL_PATTERN.test(nextEmail)) {
      setEmailStatus("Enter a valid email address.", "error");
      return;
    }

    if (currentUserEmail && nextEmail === normalizeEmail(currentUserEmail)) {
      setEmailStatus("Enter a different email address.", "error");
      return;
    }

    setEmailStatus("", "");
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    try {
      const currentUserResult = await window.ClashlyAuth.getCurrentUser();
      if (currentUserResult.error) {
        throw currentUserResult.error;
      }
      if (!window.ClashlyAuth.canChangeEmail(currentUserResult.user)) {
        throw new Error("Only accounts created with a Gmail address and password can change email address here.");
      }

      const result = await window.ClashlyAuth.updateEmail(nextEmail);
      if (result.error) {
        throw result.error;
      }

      setEmailStatus("Confirmation sent. Check your inbox to complete this email change.", "success");
      input.value = "";
    } catch (error) {
      setEmailStatus(getEmailUpdateErrorMessage(error), "error");
      window.ClashlyUtils.reportError("Settings email update failed.", error, "Could not update email.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send confirmation";
    }
  }

  async function handleDeleteAccount() {
    if (!window.ClashlyAuth) return;

    const deleteBtn = document.getElementById("settings-delete-account");
    const { confirmBtn, cancelBtn } = getDeleteModalElements();
    if (!(deleteBtn instanceof HTMLButtonElement) || !(confirmBtn instanceof HTMLButtonElement)) return;

    deleteInFlight = true;
    setDeleteStatus("", "");
    deleteBtn.disabled = true;
    confirmBtn.disabled = true;
    if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = true;
    confirmBtn.textContent = "Deleting...";
    deleteBtn.textContent = "Deleting...";

    try {
      const result = await window.ClashlyAuth.deleteOwnAccount();
      if (result.error) {
        throw result.error;
      }

      deleteInFlight = false;
      closeDeleteModal();
      setDeleteStatus("Account deleted. Redirecting...", "success");
      try {
        await window.ClashlyAuth.signOut();
      } catch {
        // Session may already be invalid after deletion.
      }
      window.location.replace("auth.html");
    } catch (error) {
      setDeleteStatus("Could not delete account. Please try again.", "error");
      window.ClashlyUtils.reportError("Delete account failed.", error, "Could not delete account.");
      deleteInFlight = false;
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete account";
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Yes";
      if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = false;
    }
  }


  async function initEmailNotificationSettings(userId) {
    const masterToggle = document.getElementById("settings-email-toggle");
    const followToggle = document.getElementById("settings-email-follow-toggle");
    const commentToggle = document.getElementById("settings-email-comment-toggle");
    const likeToggle = document.getElementById("settings-email-like-toggle");
    const suboptionsContainer = document.getElementById("settings-email-suboptions");
    const statusEl = document.getElementById("settings-email-pref-status");

    if (!masterToggle || !followToggle || !commentToggle || !likeToggle) return;

    function setSwitchState(el, isChecked) {
      if (!el) return;
      el.setAttribute("aria-checked", isChecked ? "true" : "false");
    }

    function getSwitchState(el) {
      return el ? el.getAttribute("aria-checked") === "true" : true;
    }

    function syncSuboptionsState(isEnabled) {
      if (suboptionsContainer) {
        suboptionsContainer.classList.toggle("is-disabled", !isEnabled);
      }
    }

    function showStatus(msg, type) {
      if (!statusEl) return;
      statusEl.hidden = !msg;
      statusEl.textContent = msg || "";
      statusEl.classList.remove("is-error", "is-success");
      if (type === "error") statusEl.classList.add("is-error");
      if (type === "success") statusEl.classList.add("is-success");
    }

    let currentPrefs = {
      email_notifications_enabled: true,
      email_on_follow: true,
      email_on_comment: true,
      email_on_reply: true,
      email_on_like: true,
    };

    if (window.ClashlyEmail && typeof window.ClashlyEmail.getEmailPreferences === "function") {
      try {
        currentPrefs = await window.ClashlyEmail.getEmailPreferences(userId);
      } catch (_e) {}
    }

    setSwitchState(masterToggle, currentPrefs.email_notifications_enabled !== false);
    setSwitchState(followToggle, currentPrefs.email_on_follow !== false);
    setSwitchState(commentToggle, currentPrefs.email_on_comment !== false);
    setSwitchState(likeToggle, currentPrefs.email_on_like !== false);
    syncSuboptionsState(currentPrefs.email_notifications_enabled !== false);

    async function persistChanges() {
      const updated = {
        email_notifications_enabled: getSwitchState(masterToggle),
        email_on_follow: getSwitchState(followToggle),
        email_on_comment: getSwitchState(commentToggle),
        email_on_reply: getSwitchState(commentToggle),
        email_on_like: getSwitchState(likeToggle),
      };

      if (window.ClashlyEmail && typeof window.ClashlyEmail.updateEmailPreferences === "function") {
        const result = await window.ClashlyEmail.updateEmailPreferences(userId, updated);
        if (result && result.error) {
          showStatus("Could not sync email preferences with cloud.", "error");
        } else {
          showStatus("Email preferences updated.", "success");
          setTimeout(() => showStatus("", ""), 3000);
        }
      }
    }

    masterToggle.addEventListener("click", () => {
      const next = !getSwitchState(masterToggle);
      setSwitchState(masterToggle, next);
      syncSuboptionsState(next);
      persistChanges().catch(() => {});
    });

    [followToggle, commentToggle, likeToggle].forEach((btn) => {
      btn.addEventListener("click", () => {
        setSwitchState(btn, !getSwitchState(btn));
        persistChanges().catch(() => {});
      });
    });
  }

  async function initSettingsPage() {
    try {
      if (!window.ClashlySession) return;

      const sessionState = await window.ClashlySession.resolveSession();
      const user = sessionState.user || null;
      if (!user) {
        window.location.replace("auth.html");
        return;
      }
      currentUserEmail = user.email || "";

      const emailEl = document.getElementById("settings-user-email");
      if (emailEl) {
        emailEl.textContent = currentUserEmail || "Unknown account";
      }

      let currentAuthUser = user;
      if (window.ClashlyAuth && typeof window.ClashlyAuth.getCurrentUser === "function") {
        try {
          const currentUserResult = await window.ClashlyAuth.getCurrentUser();
          if (!currentUserResult.error && currentUserResult.user) {
            currentAuthUser = currentUserResult.user;
          }
        } catch (_error) {
          // Fall back to the session user object.
        }
      }

      const canChangeEmail = window.ClashlyAuth && typeof window.ClashlyAuth.canChangeEmail === "function"
        ? window.ClashlyAuth.canChangeEmail(currentAuthUser)
        : false;
      setEmailFormDisabled(!canChangeEmail);
      if (!canChangeEmail) {
        setEmailStatus("Only accounts created with a Gmail address and password can change email address here.", "error");
      } else {
        setEmailStatus("", "");
      }

      const emailForm = document.getElementById("settings-email-form");
      if (emailForm && canChangeEmail) {
        emailForm.addEventListener("submit", handleEmailChangeSubmit);
      }

      const { trigger } = getInstallElements();
      if (trigger && window.ClashlyPWA) {
        trigger.addEventListener("click", () => {
          handleInstallClick().catch(() => {});
        });
        unsubscribePwaState = window.ClashlyPWA.subscribe(renderInstallState);
      } else {
        renderInstallState({
          installed: false,
          canInstall: false,
          promptOutcome: "",
          promptCaptured: false,
        });
      }

      const deleteBtn = document.getElementById("settings-delete-account");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", () => {
          openDeleteModal();
        });
      }

      // Initialise email notification toggles now that we have a user ID
      await initEmailNotificationSettings(user.id);

      const { modal, confirmBtn } = getDeleteModalElements();
      if (confirmBtn) {
        confirmBtn.addEventListener("click", () => {
          handleDeleteAccount().catch(() => {});
        });
      }

      if (modal) {
        document.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const closeTrigger = target.closest("[data-close-delete-modal='true']");
          if (!closeTrigger) return;
          event.preventDefault();
          closeDeleteModal();
        });

        document.addEventListener("keydown", (event) => {
          if (event.key !== "Escape") return;
          if (modal.hidden) return;
          closeDeleteModal();
        });
      }
    } finally {
      if (unsubscribePwaState) {
        window.addEventListener(
          "beforeunload",
          () => {
            unsubscribePwaState();
          },
          { once: true }
        );
      }
      if (window.ClasheLoader) {
        window.ClasheLoader.release("page-data");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", initSettingsPage);
})();
