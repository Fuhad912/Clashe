(function () {
  const FUNCTION_NAME = "clashe-push";
  const PROMPT_ID = "clashe-push-prompt";
  const PROMPT_DISMISSED_KEY = "clashe-push-prompt-dismissed-at";
  const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
  let configPromise = null;
  let configValue = null;
  let activeSubscription = false;

  function isSupported() {
    return Boolean(window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  }

  function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }

  function getClient() {
    return window.ClashlySupabase && window.ClashlySupabase.getClient();
  }

  async function invoke(body, method) {
    const client = getClient();
    if (!client) throw new Error("Sign in to manage notifications.");
    const { data, error } = await client.functions.invoke(FUNCTION_NAME, { method: method || "POST", body });
    if (error) {
      let serverMessage = "";
      try {
        const response = error.context;
        if (response && typeof response.json === "function") {
          const details = await response.json();
          serverMessage = details && details.error ? String(details.error) : "";
        }
      } catch (_) {}
      throw new Error(serverMessage || error.message || "Push service request failed.");
    }
    if (data && data.error) throw new Error(data.error);
    return data || {};
  }

  function getConfig() {
    if (!configPromise) {
      configPromise = invoke(undefined, "GET").then((config) => {
        configValue = config;
        return config;
      }).catch((error) => {
        configPromise = null;
        throw error;
      });
    }
    return configPromise;
  }

  function decodeVapidKey(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function getSubscription() {
    const registration = await getRegistration();
    return registration.pushManager.getSubscription();
  }

  async function getRegistration() {
    let timeoutId;
    try {
      return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error("Service worker is not ready.")), 5000);
        }),
      ]);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function getState() {
    if (!isSupported()) return { supported: false, enabled: false, permission: "unsupported", configured: false };
    let configured = false;
    let configError = "";
    try {
      const config = await getConfig();
      configured = Boolean(config.configured && config.publicKey);
    } catch (error) {
      configError = error.message || "Could not contact the push service.";
    }
    const subscription = await getSubscription().catch(() => null);
    let registrationError = "";
    activeSubscription = false;
    if (subscription && configured && Notification.permission === "granted") {
      try {
        await invoke({ action: "subscribe", subscription: subscription.toJSON() });
        activeSubscription = true;
      } catch (error) {
        activeSubscription = false;
        registrationError = error.message || "Could not register this device with the push service.";
      }
    }
    return {
      supported: true,
      configured,
      permission: Notification.permission,
      enabled: Boolean(configured && subscription && Notification.permission === "granted" && !registrationError),
      registrationError,
      configError,
    };
  }

  async function enable() {
    if (!isSupported()) throw new Error("Push notifications are not supported on this device.");
    const config = configValue;
    if (!config || !config.configured || !config.publicKey) throw new Error("Push notifications are not configured yet.");

    // This call must begin inside the button's user gesture, particularly on iOS.
    const permissionRequest = Notification.permission === "default" ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    const permission = await permissionRequest;
    if (permission !== "granted") throw new Error("Allow notifications in your browser or device settings to enable alerts.");

    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();
    let created = false;
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(config.publicKey),
      });
      created = true;
    }
    try {
      await invoke({ action: "subscribe", subscription: subscription.toJSON() });
    } catch (error) {
      if (created) await subscription.unsubscribe().catch(() => {});
      throw error;
    }
    dismissPrompt();
    activeSubscription = true;
    window.dispatchEvent(new Event("clashe:push-state"));
    return { enabled: true };
  }

  async function disable() {
    if (!isSupported()) return { enabled: false };
    const subscription = await getSubscription();
    if (subscription) {
      try { await invoke({ action: "unsubscribe", endpoint: subscription.endpoint }); } catch (_) {}
      await subscription.unsubscribe();
    }
    dismissPrompt();
    activeSubscription = false;
    window.dispatchEvent(new Event("clashe:push-state"));
    return { enabled: false };
  }

  async function sendNotification(notificationId) {
    if (!notificationId) return;
    try {
      return await invoke({ action: "send", notificationId });
    } catch (error) {
      console.warn("[Clashe Push] Could not deliver notification.", error);
      throw error;
    }
  }

  async function sendTestNotification() {
    if (Notification.permission !== "granted") throw new Error("Allow notifications on this device first.");
    const subscription = await getSubscription();
    if (!subscription) throw new Error("This device is not subscribed. Turn notifications off and on again.");
    await invoke({ action: "subscribe", subscription: subscription.toJSON() });
    const result = await invoke({ action: "test" });
    if (!result.sent) throw new Error("The push service did not accept a test notification.");
    return result;
  }

  function dismissPrompt() {
    document.getElementById(PROMPT_ID)?.remove();
  }

  function rememberDismissal() {
    try { localStorage.setItem(PROMPT_DISMISSED_KEY, String(Date.now())); } catch (_) {}
    dismissPrompt();
  }

  function recentlyDismissed() {
    try {
      return Date.now() - Number(localStorage.getItem(PROMPT_DISMISSED_KEY) || 0) < PROMPT_COOLDOWN_MS;
    } catch (_) {
      return false;
    }
  }

  async function maybeShowInstalledPrompt() {
    if (!isInstalled() || !isSupported() || Notification.permission !== "default" || recentlyDismissed()) return;
    if (["auth", "profile-setup", "settings"].includes(document.body.dataset.page) || document.getElementById(PROMPT_ID)) return;
    const session = window.ClashlySession && await window.ClashlySession.resolveSession();
    if (!session?.user) return;
    const state = await getState();
    if (!state.configured || state.enabled || document.body.classList.contains("has-onboarding-open") || document.body.classList.contains("has-onboarding-pending")) return;

    const prompt = document.createElement("aside");
    prompt.id = PROMPT_ID;
    prompt.className = "clashe-push-prompt";
    prompt.setAttribute("aria-label", "Turn on notifications");
    prompt.innerHTML = `
      <span class="clashe-push-prompt__icon" aria-hidden="true"><i class="app-icon fa-solid fa-bell"></i></span>
      <span class="clashe-push-prompt__copy"><strong>Stay in the conversation</strong><span>Get alerts when people interact with your takes, even when Clashe is closed.</span></span>
      <span class="clashe-push-prompt__actions"><button type="button" data-push-enable>Enable</button><button type="button" data-push-later>Later</button></span>
    `;
    prompt.querySelector("[data-push-enable]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await enable();
      } catch (error) {
        button.disabled = false;
        prompt.querySelector(".clashe-push-prompt__copy span").textContent = error.message || "Could not enable alerts. Try Settings.";
      }
    });
    prompt.querySelector("[data-push-later]").addEventListener("click", rememberDismissal);
    document.body.appendChild(prompt);
  }

  async function syncExistingSubscription() {
    if (!isSupported() || Notification.permission !== "granted" || !window.ClashlySession) {
      activeSubscription = false;
      return;
    }
    const session = await window.ClashlySession.resolveSession();
    if (session.error) return;
    const subscription = await getSubscription().catch(() => null);
    if (!subscription) {
      activeSubscription = false;
      return;
    }
    if (!session.user) {
      await subscription.unsubscribe().catch(() => {});
      activeSubscription = false;
      return;
    }
    const config = await getConfig().catch(() => null);
    if (config?.configured) {
      try {
        await invoke({ action: "subscribe", subscription: subscription.toJSON() });
        activeSubscription = true;
      } catch (_) {
        activeSubscription = false;
      }
    }
  }

  function start() {
    window.setTimeout(() => maybeShowInstalledPrompt().catch(() => {}), 2200);
    syncExistingSubscription().catch(() => {});
  }

  window.ClashlyPush = { isSupported, isActiveOnThisDevice: () => activeSubscription, getState, getConfig, enable, disable, sendNotification, sendTestNotification, maybeShowInstalledPrompt };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
  window.addEventListener("clashly:auth-state", () => syncExistingSubscription().catch(() => {}));
})();
