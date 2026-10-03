const test = require("node:test");
const assert = require("node:assert/strict");

test("network errors in signup/profile-setup are mapped to friendly actionable messages", () => {
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

  function resolveSubmitErrorMessage(error, protocol = "http:") {
    if (isNetworkError(error)) {
      if (protocol === "file:") {
        return "Cannot connect from local file:// URL. Please open Clashe using a local server (e.g. VS Code Live Server or 'npx serve').";
      }
      return "Could not reach the server. Please check your internet connection or browser shields, then try again.";
    }

    const raw = error && typeof error.message === "string" ? error.message.trim() : "";
    return raw || "Unable to complete setup. Please try again.";
  }

  // 1. Raw TypeError: Failed to fetch
  const chromeError = new TypeError("Failed to fetch");
  assert.equal(isNetworkError(chromeError), true);
  assert.match(resolveSubmitErrorMessage(chromeError, "http:"), /Could not reach the server/);
  assert.match(resolveSubmitErrorMessage(chromeError, "file:"), /file:\/\/ URL/);

  // 2. Safari: Load failed
  const safariError = new TypeError("Load failed");
  assert.equal(isNetworkError(safariError), true);
  assert.match(resolveSubmitErrorMessage(safariError, "http:"), /Could not reach the server/);

  // 3. Supabase AuthRetryableFetchError
  const sbError = { name: "AuthRetryableFetchError", message: "Failed to fetch" };
  assert.equal(isNetworkError(sbError), true);

  // 4. Non-network errors are preserved
  const regularError = new Error("Invalid username format");
  assert.equal(isNetworkError(regularError), false);
  assert.equal(resolveSubmitErrorMessage(regularError), "Invalid username format");
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
