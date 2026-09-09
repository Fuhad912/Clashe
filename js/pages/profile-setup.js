(function () {
  const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const ALLOWED_GENDERS = ["female", "male", "non_binary", "prefer_not_to_say", "other"];
  const REQUEST_TIMEOUT_MS = 12000;
  const USERNAME_CHECK_DEBOUNCE_MS = 450;
  const MIN_AGE_YEARS = 13;
  const MAX_AGE_YEARS = 120;
  let pageAnimated = false;

  function hasGsap() {
    return typeof window.gsap !== "undefined";
  }

  function animatePage() {
    if (pageAnimated) return;
    pageAnimated = true;
    if (!hasGsap()) return;

    const brand = document.querySelector("[data-anim='brand']");
    const panel = document.querySelector("[data-anim='panel']");
    const rail = document.querySelector("[data-anim='rail']");

    const tl = window.gsap.timeline({ defaults: { ease: "power3.out" } });
    if (brand) {
      tl.from(brand, { x: -18, opacity: 0, duration: 0.58 });
      tl.from(
        brand.querySelectorAll(
          ".setup-brand-title, .setup-brand-copy, .setup-metric, .setup-steps li, .setup-pill"
        ),
        {
          y: 12,
          opacity: 0,
          duration: 0.36,
          stagger: 0.06,
        },
        "-=0.34"
      );
    }

    if (panel) {
      tl.from(
        panel,
        {
          y: 22,
          opacity: 0,
          scale: 0.99,
          duration: 0.62,
        },
        "-=0.28"
      );
      tl.from(
        panel.querySelectorAll(".setup-head, .setup-field, .setup-actions"),
        {
          y: 10,
          opacity: 0,
          duration: 0.3,
          stagger: 0.05,
        },
        "-=0.28"
      );
    }

    if (rail) {
      tl.from(
        rail,
        {
          x: 18,
          opacity: 0,
          duration: 0.44,
        },
        "-=0.26"
      );
      tl.from(
        rail.querySelectorAll(".setup-live, .setup-rules"),
        {
          y: 8,
          opacity: 0,
          duration: 0.3,
          stagger: 0.08,
        },
        "-=0.24"
      );
    }
  }

  function setStatus(message, type) {
    const statusEl = document.getElementById("setup-status");
    if (!statusEl) return;

    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (type === "error") statusEl.classList.add("is-error");
    if (type === "success") statusEl.classList.add("is-success");
  }

  function setFieldStatus(statusEl, fieldEl, message, type) {
    if (statusEl) {
      statusEl.hidden = !message;
      statusEl.textContent = message || "";
      statusEl.classList.remove("is-error", "is-success", "is-pending");
      if (type) statusEl.classList.add(`is-${type}`);
    }

    if (fieldEl) {
      fieldEl.classList.remove("is-invalid", "is-valid", "is-pending");
      if (type === "error") fieldEl.classList.add("is-invalid");
      if (type === "success") fieldEl.classList.add("is-valid");
      if (type === "pending") fieldEl.classList.add("is-pending");
    }
  }

  function setPreview(previewEl, username, avatarFile) {
    if (avatarFile) {
      const url = URL.createObjectURL(avatarFile);
      previewEl.innerHTML = `<img src="${url}" alt="Profile photo preview" />`;
      return;
    }

    const initials = window.ClashlyProfiles.initialsFromUsername(username || "cl");
    previewEl.textContent = initials;
  }

  function validateAvatarFile(file) {
    if (!file) return "";

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      return "Unsupported profile photo format. Use JPG, PNG, WEBP, or GIF.";
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      return "Profile photo is too large. Maximum size is 5MB.";
    }

    return "";
  }

  function getDateBounds() {
    const now = new Date();
    const max = now.toISOString().split("T")[0];
    const minDate = new Date(now);
    minDate.setFullYear(minDate.getFullYear() - MAX_AGE_YEARS);
    return {
      max,
      min: minDate.toISOString().split("T")[0],
    };
  }

  function calculateAge(dateString) {
    const dob = new Date(dateString);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      age -= 1;
    }
    return age;
  }

  function resolveDateOfBirth(value) {
    const normalized = (value || "").trim();
    if (!normalized) {
      return { value: null, error: "Date of birth is required." };
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return { value: null, error: "Enter a valid date of birth." };
    }

    const { max, min } = getDateBounds();
    if (normalized > max) {
      return { value: null, error: "Date of birth cannot be in the future." };
    }

    if (normalized < min) {
      return { value: null, error: "Enter a realistic date of birth." };
    }

    const age = calculateAge(normalized);
    if (age < MIN_AGE_YEARS) {
      return { value: null, error: `You must be at least ${MIN_AGE_YEARS} years old to use Clashe.` };
    }

    return { value: normalized, error: null };
  }

  function resolveGender(value) {
    const normalized = (value || "").trim();
    if (!ALLOWED_GENDERS.includes(normalized)) {
      return null;
    }
    return normalized;
  }

  function setAvatarHandle(handleEl, username) {
    if (!handleEl) return;
    const normalized = window.ClashlyProfiles.normalizeUsername(username || "");
    handleEl.textContent = `@${normalized || "clashe"}`;
  }

  function redirectToHome() {
    window.location.replace("index.html");
  }

  function withTimeout(promise, errorMessage, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(new Error(errorMessage));
        }, timeoutMs || REQUEST_TIMEOUT_MS);
      }),
    ]);
  }

  async function resolveCurrentUser() {
    const sessionState = await withTimeout(
      window.ClashlySession.resolveSession(),
      "Timed out while checking your account session."
    );
    if (sessionState.error) {
      throw sessionState.error;
    }
    if (!sessionState.user) {
      window.location.replace("auth.html");
      return null;
    }
    return sessionState.user;
  }

  async function validateUsername(username, userId) {
    const normalized = window.ClashlyProfiles.normalizeUsername(username);
    if (!window.ClashlyProfiles.isUsernameValid(normalized)) {
      throw new Error("Username must be 3-20 characters using lowercase letters, numbers, or underscore.");
    }

    const availability = await window.ClashlyProfiles.isUsernameAvailable(normalized, userId);
    if (availability.error) {
      throw availability.error;
    }

    if (!availability.available) {
      throw new Error("Username already exists. Choose another one.");
    }

    return normalized;
  }

  function isUsernameConflictError(error) {
    const code = error && typeof error.code === "string" ? error.code.toLowerCase() : "";
    const message = error && typeof error.message === "string" ? error.message.toLowerCase() : "";
    const details = error && typeof error.details === "string" ? error.details.toLowerCase() : "";
    const hint = error && typeof error.hint === "string" ? error.hint.toLowerCase() : "";
    const combined = `${message} ${details} ${hint}`;

    return (
      code === "23505" ||
      combined.includes("username already exists") ||
      combined.includes("duplicate key") ||
      combined.includes("profiles_username_key")
    );
  }

  function resolveSubmitErrorMessage(error) {
    if (isUsernameConflictError(error)) {
      return "Username already exists. Choose another one.";
    }

    if (error && typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }

    return "Unable to complete setup.";
  }

  // ── Live username sanitize + availability check ──────────────

  function sanitizeUsernameInputValue(rawValue) {
    const lower = String(rawValue || "").toLowerCase();
    return lower.replace(/[^a-z0-9_]/g, "").slice(0, 20);
  }

  function createUsernameChecker(usernameInput, fieldEl, statusEl, indicatorEl, getUserId, getReservedUsername) {
    let timer = 0;
    let requestId = 0;

    function setIndicator(state) {
      if (!indicatorEl) return;
      indicatorEl.dataset.state = state || "";
    }

    function evaluateLocalFormat(normalized) {
      if (!normalized) {
        setFieldStatus(statusEl, fieldEl, "", "");
        setIndicator("");
        return null;
      }

      if (normalized.length < 3) {
        setFieldStatus(statusEl, fieldEl, "Username needs at least 3 characters.", "error");
        setIndicator("error");
        return false;
      }

      if (!window.ClashlyProfiles.isUsernameValid(normalized)) {
        setFieldStatus(statusEl, fieldEl, "Use only lowercase letters, numbers, and underscore.", "error");
        setIndicator("error");
        return false;
      }

      return true;
    }

    async function runCheck() {
      const normalized = window.ClashlyProfiles.normalizeUsername(usernameInput.value);
      const formatOk = evaluateLocalFormat(normalized);
      if (!formatOk) return;

      const reserved = typeof getReservedUsername === "function" ? getReservedUsername() : "";
      if (reserved && normalized === window.ClashlyProfiles.normalizeUsername(reserved)) {
        setFieldStatus(statusEl, fieldEl, "This is already your username.", "success");
        setIndicator("success");
        return;
      }

      requestId += 1;
      const thisRequestId = requestId;
      setFieldStatus(statusEl, fieldEl, "Checking availability...", "pending");
      setIndicator("pending");

      try {
        const userId = typeof getUserId === "function" ? getUserId() : "";
        const result = await window.ClashlyProfiles.isUsernameAvailable(normalized, userId);
        if (thisRequestId !== requestId) return;

        if (result.error) {
          setFieldStatus(statusEl, fieldEl, "", "");
          setIndicator("");
          return;
        }

        if (result.available) {
          setFieldStatus(statusEl, fieldEl, `@${normalized} is available.`, "success");
          setIndicator("success");
        } else {
          setFieldStatus(statusEl, fieldEl, "That username is already taken.", "error");
          setIndicator("error");
        }
      } catch (error) {
        if (thisRequestId !== requestId) return;
        setFieldStatus(statusEl, fieldEl, "", "");
        setIndicator("");
      }
    }

    function schedule() {
      window.clearTimeout(timer);
      const normalized = window.ClashlyProfiles.normalizeUsername(usernameInput.value);
      const formatOk = evaluateLocalFormat(normalized);
      if (!formatOk) return;
      timer = window.setTimeout(runCheck, USERNAME_CHECK_DEBOUNCE_MS);
    }

    return { schedule, runCheckNow: runCheck };
  }

  function bindUsernameLiveSanitize(usernameInput, onChanged) {
    usernameInput.addEventListener("input", () => {
      const cursorWasAtEnd = usernameInput.selectionStart === usernameInput.value.length;
      const sanitized = sanitizeUsernameInputValue(usernameInput.value);
      if (sanitized !== usernameInput.value) {
        usernameInput.value = sanitized;
        if (cursorWasAtEnd) {
          usernameInput.setSelectionRange(sanitized.length, sanitized.length);
        }
      }
      onChanged();
    });
  }

  function bindAvatarPreview(usernameInput, avatarInput, previewEl, handleEl, removeBtn) {
    const refresh = () => {
      const file = avatarInput.files && avatarInput.files[0] ? avatarInput.files[0] : null;
      const fileError = validateAvatarFile(file);
      if (fileError) {
        avatarInput.value = "";
        setStatus(fileError, "error");
        setPreview(previewEl, usernameInput.value, null);
        setAvatarHandle(handleEl, usernameInput.value);
        if (removeBtn) removeBtn.hidden = true;
        return;
      }
      setPreview(previewEl, usernameInput.value, file);
      setAvatarHandle(handleEl, usernameInput.value);
      if (removeBtn) removeBtn.hidden = !file && !previewEl.querySelector("img");
    };

    usernameInput.addEventListener("input", refresh);
    avatarInput.addEventListener("change", refresh);
    refresh();
  }

  function bindAvatarRemove(avatarInput, usernameInput, previewEl, removeBtn) {
    if (!removeBtn) return;

    removeBtn.addEventListener("click", () => {
      avatarInput.value = "";
      setPreview(previewEl, usernameInput.value, null);
      removeBtn.hidden = true;
      removeBtn.dataset.removeExisting = "true";
    });
  }

  function bindAvatarDropzone(dropzoneEl, avatarInput) {
    if (!dropzoneEl) return;

    let dragDepth = 0;

    const setDragState = (isActive) => {
      dropzoneEl.classList.toggle("is-dragover", isActive);
    };

    dropzoneEl.addEventListener("dragenter", (event) => {
      event.preventDefault();
      dragDepth += 1;
      setDragState(true);
    });

    dropzoneEl.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    dropzoneEl.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragState(false);
    });

    dropzoneEl.addEventListener("drop", (event) => {
      event.preventDefault();
      dragDepth = 0;
      setDragState(false);

      const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
      if (!file) return;

      try {
        avatarInput.files = event.dataTransfer.files;
        avatarInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (error) {
        // Some browsers may not allow assigning FileList directly; ignore gracefully.
      }
    });
  }

  function bindBioCounter(bioInput, counterEl) {
    if (!bioInput || !counterEl) return;
    const sync = () => {
      const count = bioInput.value ? bioInput.value.length : 0;
      counterEl.textContent = `${count}/160`;
      counterEl.classList.remove("is-warning", "is-limit");
      if (count >= 160) {
        counterEl.classList.add("is-limit");
      } else if (count >= 140) {
        counterEl.classList.add("is-warning");
      }
    };
    bioInput.addEventListener("input", sync);
    sync();
  }

  function bindDobLiveValidation(dobInput, fieldEl, statusEl) {
    const sync = () => {
      if (!dobInput.value) {
        setFieldStatus(statusEl, fieldEl, "", "");
        return;
      }

      const result = resolveDateOfBirth(dobInput.value);
      if (result.error) {
        setFieldStatus(statusEl, fieldEl, result.error, "error");
      } else {
        setFieldStatus(statusEl, fieldEl, "", "");
        fieldEl.classList.remove("is-invalid");
      }
    };

    dobInput.addEventListener("change", sync);
    dobInput.addEventListener("blur", sync);
  }

  async function initProfileSetupPage() {
    const form = document.getElementById("profile-setup-form");
    const submitBtn = document.getElementById("setup-submit");
    if (!form) return;
    window.__clashlyProfileSetupBound = true;

    if (!window.ClashlyProfiles || !window.ClashlySession) {
      setStatus("App scripts did not load correctly. Refresh and try again.", "error");
      return;
    }

    try {
      animatePage();

      const usernameInput = document.getElementById("setup-username");
      const usernameField = document.getElementById("setup-username-field");
      const usernameStatusEl = document.getElementById("setup-username-status");
      const usernameIndicatorEl = document.getElementById("setup-username-indicator");
      const bioInput = document.getElementById("setup-bio");
      const bioCountEl = document.getElementById("setup-bio-count");
      const dobInput = document.getElementById("setup-dob");
      const dobField = dobInput ? dobInput.closest(".setup-field") : null;
      const dobStatusEl = document.getElementById("setup-dob-status");
      const genderInput = document.getElementById("setup-gender");
      const avatarInput = document.getElementById("setup-avatar");
      const avatarRemoveBtn = document.getElementById("setup-avatar-remove");
      const avatarDropzoneEl = document.getElementById("setup-avatar-dropzone");
      const previewEl = document.getElementById("setup-avatar-preview");
      const avatarHandleEl = document.getElementById("setup-avatar-handle");
      if (
        !usernameInput ||
        !bioInput ||
        !dobInput ||
        !genderInput ||
        !avatarInput ||
        !previewEl ||
        !submitBtn
      ) {
        setStatus("Setup form is incomplete. Reload this page.", "error");
        return;
      }

      bindAvatarPreview(usernameInput, avatarInput, previewEl, avatarHandleEl, avatarRemoveBtn);
      bindAvatarRemove(avatarInput, usernameInput, previewEl, avatarRemoveBtn);
      bindAvatarDropzone(avatarDropzoneEl, avatarInput);
      bindBioCounter(bioInput, bioCountEl);
      bindDobLiveValidation(dobInput, dobField, dobStatusEl);
      const bounds = getDateBounds();
      dobInput.max = bounds.max;
      dobInput.min = bounds.min;
      let existingProfileData = null;
      let resolvedUserId = "";
      let userPromise = resolveCurrentUser();

      const usernameChecker = createUsernameChecker(
        usernameInput,
        usernameField,
        usernameStatusEl,
        usernameIndicatorEl,
        () => resolvedUserId,
        () => (existingProfileData ? existingProfileData.username : "")
      );
      bindUsernameLiveSanitize(usernameInput, () => usernameChecker.schedule());

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        setStatus("", "");

        const rawUsername = usernameInput.value;
        const bio = bioInput.value;
        const dobResult = resolveDateOfBirth(dobInput.value);
        const gender = resolveGender(genderInput.value);
        const avatarFile = avatarInput.files && avatarInput.files[0] ? avatarInput.files[0] : null;
        const avatarError = validateAvatarFile(avatarFile);
        if (avatarError) {
          setStatus(avatarError, "error");
          return;
        }
        if (dobResult.error) {
          setFieldStatus(dobStatusEl, dobField, dobResult.error, "error");
          setStatus(dobResult.error, "error");
          return;
        }
        if (!gender) {
          setStatus("Select a valid gender option.", "error");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";

        try {
          setStatus("Checking account...", "");
          const user = await withTimeout(userPromise, "Timed out while checking your account.");
          if (!user) {
            throw new Error("Your session expired. Log in again.");
          }

          setStatus("Validating username...", "");
          const normalizedUsername = await withTimeout(
            validateUsername(rawUsername, user.id),
            "Timed out while validating username."
          );

          let avatarUrl = existingProfileData && existingProfileData.avatar_url
            ? existingProfileData.avatar_url
            : "";

          if (avatarRemoveBtn && avatarRemoveBtn.dataset.removeExisting === "true" && !avatarFile) {
            avatarUrl = "";
          }

          if (avatarFile) {
            setStatus("Uploading profile photo...", "");
            const uploadResult = await withTimeout(
              window.ClashlyProfiles.uploadAvatar(avatarFile, user.id),
              "Timed out while uploading profile photo.",
              20000
            );
            if (uploadResult.error) {
              throw uploadResult.error;
            }
            avatarUrl = uploadResult.avatarUrl;
          }

          setStatus("Saving profile...", "");
          const saveResult = await withTimeout(
            window.ClashlyProfiles.upsertProfile({
              userId: user.id,
              username: normalizedUsername,
              bio,
              dateOfBirth: dobResult.value,
              gender,
              avatarUrl,
            }),
            "Timed out while saving profile."
          );

          if (saveResult.error) {
            if (saveResult.error.code === "23505") {
              throw new Error("Username already exists. Choose another one.");
            }
            throw saveResult.error;
          }

          if (window.ClashlyEmail && typeof window.ClashlyEmail.sendWelcomeEmail === "function") {
            window.ClashlyEmail.sendWelcomeEmail({
              email: user.email,
              username: normalizedUsername,
              userId: user.id,
            }).catch(() => {});
          }

          setStatus("Profile saved. Redirecting to Clashe...", "success");
          redirectToHome();
        } catch (error) {
          window.ClashlyUtils.reportError("Profile setup submit failed.", error, "Unable to complete setup.");
          const message = resolveSubmitErrorMessage(error);
          if (message.toLowerCase().includes("date_of_birth")) {
            setStatus("Database schema is outdated. Run supabase/phase2_setup.sql and try again.", "error");
            return;
          }
          if (isUsernameConflictError(error)) {
            setFieldStatus(usernameStatusEl, usernameField, message, "error");
          }
          setStatus(message, "error");
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "Finish setup";
        }
      });

      (async () => {
        try {
          const user = await withTimeout(userPromise, "Timed out while loading your account.");
          if (!user) return;
          resolvedUserId = user.id;

          const existingProfile = await withTimeout(
            window.ClashlyProfiles.getProfileById(user.id),
            "Timed out while loading current profile."
          );
          if (existingProfile.error) {
            setStatus(
              window.ClashlyUtils.reportError("Profile preload failed.", existingProfile.error, "Unable to load current profile."),
              "error"
            );
            return;
          }

          existingProfileData = existingProfile.profile || null;
          if (!existingProfileData) return;

          usernameInput.value = existingProfileData.username || "";
          bioInput.value = existingProfileData.bio || "";
          dobInput.value = existingProfileData.date_of_birth || "";
          genderInput.value = existingProfileData.gender || "prefer_not_to_say";
          if (bioCountEl) {
            bioCountEl.textContent = `${bioInput.value.length}/160`;
          }
          if (existingProfileData.avatar_url) {
            previewEl.innerHTML = `<img src="${existingProfileData.avatar_url}" alt="Current profile avatar" />`;
            if (avatarRemoveBtn) avatarRemoveBtn.hidden = false;
          } else {
            setPreview(previewEl, existingProfileData.username, null);
          }
          setAvatarHandle(avatarHandleEl, existingProfileData.username || "");
        } catch (error) {
          const message = window.ClashlyUtils.reportError("Profile preload failed.", error, "Unable to load current profile.");
          setStatus(message, "error");
        }
      })();
    } catch (error) {
      const message = window.ClashlyUtils.reportError("Profile setup init failed.", error, "Profile setup failed to initialize.");
      setStatus(message, "error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initProfileSetupPage();
    });
  } else {
    initProfileSetupPage();
  }
})();
