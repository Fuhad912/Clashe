const test = require("node:test");
const assert = require("node:assert/strict");

test("network errors in signup/profile-setup are mapped to friendly actionable messages with step context", () => {
  function isNetworkError(error) {
    if (!error) return false;
    const msg = String(
      typeof error === "string"
        ? error
        : error.message || error.msg || error.error_description || error.description || error.name || ""
    ).toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network request failed") ||
      msg.includes("networkerror") ||
      msg.includes("load failed") ||
      msg.includes("connection refused") ||
      msg.includes("authretryablefetcherror") ||
      msg.includes("offline")
    );
  }

  function resolveSubmitErrorMessage(error, currentStep = "", protocol = "http:") {
    const raw = error && typeof error.message === "string" ? error.message.trim() : "";
    if (isNetworkError(error)) {
      if (protocol === "file:") {
        return "Cannot connect from local file:// URL. Please open Clashe using a local server (e.g. VS Code Live Server or 'npx serve').";
      }
      const stepMsg = currentStep === "saving_profile" ? "while saving profile" : currentStep === "uploading_avatar" ? "while uploading photo" : currentStep === "validating_username" ? "while checking username" : "";
      return `Could not reach the server${stepMsg ? " " + stepMsg : ""}${raw ? ` (${raw})` : ""}. Check connection or browser shields, then try again.`;
    }

    return raw || "Unable to complete setup. Please try again.";
  }

  // 1. Raw TypeError: Failed to fetch
  const chromeError = new TypeError("Failed to fetch");
  assert.equal(isNetworkError(chromeError), true);
  assert.match(resolveSubmitErrorMessage(chromeError, "saving_profile", "http:"), /while saving profile/);
  assert.match(resolveSubmitErrorMessage(chromeError, "saving_profile", "file:"), /file:\/\/ URL/);

  // 2. Safari: Load failed
  const safariError = new TypeError("Load failed");
  assert.equal(isNetworkError(safariError), true);
  assert.match(resolveSubmitErrorMessage(safariError, "", "http:"), /Could not reach the server/);

  // 3. Supabase AuthRetryableFetchError
  const sbError = { name: "AuthRetryableFetchError", message: "Failed to fetch" };
  assert.equal(isNetworkError(sbError), true);
});

test("redirectAfterAuth safely defaults to profile-setup.html on profile check error", async () => {
  let redirectedTo = "";
  const mockProfiles = {
    hasCompletedProfile: async () => ({ completed: false, error: new Error("Failed to fetch") })
  };

  async function redirectAfterAuth(userId) {
    let isCompleted = false;
    try {
      const profileCheck = await mockProfiles.hasCompletedProfile(userId);
      if (!profileCheck.error && profileCheck.completed) {
        isCompleted = true;
      }
    } catch (_error) {
      isCompleted = false;
    }
    redirectedTo = isCompleted ? "index.html" : "profile-setup.html";
  }

  await redirectAfterAuth("user-123");
  assert.equal(redirectedTo, "profile-setup.html");
});

test("validateUsername does not throw on network availability failure", async () => {
  const mockProfiles = {
    normalizeUsername: (u) => String(u || "").trim().toLowerCase(),
    isUsernameValid: (u) => /^[a-z0-9_]{3,20}$/.test(u),
    isUsernameAvailable: async () => ({ available: false, error: new Error("Failed to fetch") })
  };

  async function validateUsername(username, userId) {
    const normalized = mockProfiles.normalizeUsername(username);
    if (!mockProfiles.isUsernameValid(normalized)) {
      throw new Error("Username must be 3-20 characters using lowercase letters, numbers, or underscore.");
    }

    try {
      const availability = await mockProfiles.isUsernameAvailable(normalized, userId);
      if (availability && !availability.error && availability.available === false) {
        throw new Error("Username already exists. Choose another one.");
      }
    } catch (err) {
      if (err.message && err.message.includes("already exists")) {
        throw err;
      }
    }

    return normalized;
  }

  const result = await validateUsername("cool_user", "u-1");
  assert.equal(result, "cool_user");
});
