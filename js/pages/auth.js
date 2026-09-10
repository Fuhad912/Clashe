(function () {
  const MIN_PASSWORD_LEN = 8;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const OTP_PATTERN = /^[0-9]{6}$/;
  const OAUTH_INTENT_KEY = "clashe_oauth_intent";

  let mode = "login";
  let pendingOtpEmail = "";
  let pendingSignupPassword = "";
  let otpModalAnimation = null;
  let forgotModalAnimation = null;
  let forgotAutoCloseTimer = null;
  let pageAnimated = false;

  function hasGsap() {
    return typeof window.gsap !== "undefined";
  }

  function animatePage() {
    if (pageAnimated) return;
    pageAnimated = true;
    if (!hasGsap()) return;

    const brand = document.querySelector("[data-anim='brand']");
    const form = document.querySelector("[data-anim='form']");
    const rail = document.querySelector("[data-anim='rail']");
    const tl = window.gsap.timeline({ defaults: { ease: "power3.out" } });
    if (brand) {
      tl.from(brand, { y: 24, opacity: 0, duration: 0.62 });
      tl.from(
        brand.querySelectorAll(
          ".auth-title, .auth-copy, .auth-brand__stats, .auth-brand__signal, .auth-pill-row"
        ),
        {
          y: 14,
          opacity: 0,
          duration: 0.44,
          stagger: 0.08,
        },
        "-=0.35"
      );
    }
    if (form) {
      const formCard = form.querySelector(".auth-form-card");
      const formChildren = form.querySelectorAll(
        ".auth-form-head, .auth-switch, .auth-form .field-label, .auth-form input, .auth-form .password-toggle, .auth-form .auth-check, #auth-submit"
      );
      tl.from(
        formCard || form,
        {
          y: 30,
          opacity: 0,
          scale: 0.98,
          duration: 0.62,
        },
        "-=0.42"
      );
      if (formChildren.length) {
        tl.from(
          formChildren,
          {
            y: 12,
            opacity: 0,
            duration: 0.34,
            stagger: 0.045,
          },
          "-=0.34"
        );
      }
    }
    if (rail) {
      tl.from(
        rail,
        {
          x: 20,
          opacity: 0,
          duration: 0.46,
        },
        "-=0.36"
      );
    }

    if (hasGsap()) {
      const pills = document.querySelectorAll(".auth-pill");
      if (pills.length) {
        window.gsap.to(pills, {
          y: -3,
          duration: 1.6,
          ease: "sine.inOut",
          stagger: 0.12,
          repeat: -1,
          yoyo: true,
        });
      }

      const statValues = document.querySelectorAll(".brand-stat__value");
      if (statValues.length) {
        window.gsap.fromTo(
          statValues,
          { opacity: 0.85 },
          {
            opacity: 1,
            duration: 1.2,
            stagger: 0.2,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
          }
        );
      }
    }
  }

  function getOtpModal() {
    return document.getElementById("otp-modal");
  }

  function getForgotModal() {
    return document.getElementById("forgot-modal");
  }

  function closeOtpModal() {
    const otpModal = getOtpModal();
    if (!otpModal) return;
    if (!hasGsap()) {
      otpModal.hidden = true;
      return;
    }

    const panel = otpModal.querySelector(".otp-modal__panel");
    const backdrop = otpModal.querySelector(".otp-modal__backdrop");
    if (otpModalAnimation) otpModalAnimation.kill();
    otpModalAnimation = window.gsap.timeline({
      onComplete: () => {
        otpModal.hidden = true;
      },
    });
    if (backdrop) otpModalAnimation.to(backdrop, { opacity: 0, duration: 0.16, ease: "power2.out" }, 0);
    if (panel) otpModalAnimation.to(panel, { y: 16, opacity: 0, duration: 0.2, ease: "power2.inOut" }, 0);
  }

  function closeForgotModal() {
    const forgotModal = getForgotModal();
    if (!forgotModal) return;

    const statusEl = document.getElementById("forgot-status");
    if (statusEl) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.classList.remove("is-error", "is-success");
    }

    if (forgotAutoCloseTimer) {
      window.clearTimeout(forgotAutoCloseTimer);
      forgotAutoCloseTimer = null;
    }

    if (!hasGsap()) {
      forgotModal.hidden = true;
      return;
    }

    const panel = forgotModal.querySelector(".forgot-modal__panel");
    const backdrop = forgotModal.querySelector(".forgot-modal__backdrop");
    if (forgotModalAnimation) forgotModalAnimation.kill();
    forgotModalAnimation = window.gsap.timeline({
      onComplete: () => {
        forgotModal.hidden = true;
      },
    });
    if (backdrop) forgotModalAnimation.to(backdrop, { opacity: 0, duration: 0.16, ease: "power2.out" }, 0);
    if (panel) forgotModalAnimation.to(panel, { y: 16, opacity: 0, duration: 0.2, ease: "power2.inOut" }, 0);
  }

  function openOtpModal() {
    const otpModal = getOtpModal();
    if (!otpModal) return;
    otpModal.hidden = false;
    if (!hasGsap()) return;

    const panel = otpModal.querySelector(".otp-modal__panel");
    const backdrop = otpModal.querySelector(".otp-modal__backdrop");
    if (otpModalAnimation) otpModalAnimation.kill();
    if (backdrop) window.gsap.set(backdrop, { opacity: 0 });
    if (panel) window.gsap.set(panel, { y: 18, opacity: 0 });

    otpModalAnimation = window.gsap.timeline({ defaults: { ease: "power3.out" } });
    if (backdrop) otpModalAnimation.to(backdrop, { opacity: 1, duration: 0.2 }, 0);
    if (panel) otpModalAnimation.to(panel, { y: 0, opacity: 1, duration: 0.28 }, 0.02);
  }

  function openForgotModal(prefillEmail) {
    const forgotModal = getForgotModal();
    if (!forgotModal) return;

    const forgotInput = document.getElementById("forgot-email");
    const forgotSubmit = document.getElementById("forgot-submit");
    const forgotStatus = document.getElementById("forgot-status");
    if (forgotStatus) {
      forgotStatus.hidden = true;
      forgotStatus.textContent = "";
      forgotStatus.classList.remove("is-error", "is-success");
    }
    if (forgotAutoCloseTimer) {
      window.clearTimeout(forgotAutoCloseTimer);
      forgotAutoCloseTimer = null;
    }
    if (forgotSubmit) {
      forgotSubmit.disabled = false;
      forgotSubmit.textContent = "Send reset link";
    }
    if (forgotInput instanceof HTMLInputElement) {
      forgotInput.value = String(prefillEmail || "").trim().toLowerCase();
    }

    forgotModal.hidden = false;
    if (!hasGsap()) {
      if (forgotInput instanceof HTMLInputElement) forgotInput.focus();
      return;
    }

    const panel = forgotModal.querySelector(".forgot-modal__panel");
    const backdrop = forgotModal.querySelector(".forgot-modal__backdrop");
    if (forgotModalAnimation) forgotModalAnimation.kill();
    if (backdrop) window.gsap.set(backdrop, { opacity: 0 });
    if (panel) window.gsap.set(panel, { y: 18, opacity: 0 });

    forgotModalAnimation = window.gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: () => {
        if (forgotInput instanceof HTMLInputElement) forgotInput.focus();
      },
    });
    if (backdrop) forgotModalAnimation.to(backdrop, { opacity: 1, duration: 0.2 }, 0);
    if (panel) forgotModalAnimation.to(panel, { y: 0, opacity: 1, duration: 0.28 }, 0.02);
  }

  function setStatus(message, type) {
    const statusEl = document.getElementById("auth-status");
    if (!statusEl) return;

    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (type === "error") statusEl.classList.add("is-error");
    if (type === "success") statusEl.classList.add("is-success");
  }

  function animateModeChange() {
    if (!hasGsap()) return;

    const titleEl = document.querySelector(".auth-form-title");
    const submitBtn = document.getElementById("auth-submit");
    const signupFields = document.getElementById("signup-only-fields");
    const targets = [titleEl, submitBtn].filter(Boolean);

    if (targets.length) {
      window.gsap.fromTo(
        targets,
        { y: 10, opacity: 0.72 },
        { y: 0, opacity: 1, duration: 0.24, stagger: 0.04, ease: "power2.out", overwrite: true }
      );
    }

    if (signupFields) {
      window.gsap.fromTo(
        signupFields,
        { y: mode === "signup" ? -8 : 0, opacity: mode === "signup" ? 0.2 : 1 },
        { y: 0, opacity: 1, duration: 0.24, ease: "power2.out", overwrite: true }
      );
    }
  }

  function setMode(nextMode) {
    mode = nextMode;
    const form = document.getElementById("auth-form");
    const switchButtons = document.querySelectorAll(".auth-switch__btn");
    const submitBtn = document.getElementById("auth-submit");
    const titleEl = document.querySelector(".auth-form-title");
    const signupFields = document.getElementById("signup-only-fields");
    const confirmPasswordInput = document.getElementById("auth-confirm-password");
    const termsInput = document.getElementById("auth-terms");
    const googleLabel = document.getElementById("auth-google-btn-label");
    const xLabel = document.getElementById("auth-x-btn-label");

    switchButtons.forEach((button) => {
      const buttonMode = button.dataset.authMode;
      button.classList.toggle("auth-switch__btn--active", buttonMode === mode);
    });

    if (form) {
      form.classList.toggle("is-signup", mode === "signup");
    }

    if (signupFields) {
      signupFields.setAttribute("aria-hidden", mode === "signup" ? "false" : "true");
    }

    if (confirmPasswordInput) {
      confirmPasswordInput.required = mode === "signup";
      if (mode !== "signup") {
        confirmPasswordInput.value = "";
      }
    }

    if (termsInput) {
      termsInput.required = mode === "signup";
      if (mode !== "signup") {
        termsInput.checked = false;
      }
    }

    if (titleEl) {
      titleEl.textContent = mode === "signup" ? "Create your account." : "Welcome back.";
    }

    if (submitBtn) {
      submitBtn.textContent = mode === "signup" ? "Create account" : "Log in";
    }

    if (googleLabel) {
      googleLabel.textContent = mode === "signup" ? "Sign up with Google" : "Continue with Google";
    }

    if (xLabel) {
      xLabel.textContent = mode === "signup" ? "Sign up with X" : "Continue with X";
    }

    pendingOtpEmail = "";
    pendingSignupPassword = "";
    closeOtpModal();
    closeForgotModal();
    setStatus("", "");
    animateModeChange();
  }

  function initAuthSwitch() {
    const switchButtons = document.querySelectorAll(".auth-switch__btn");
    if (!switchButtons.length) return;

    switchButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setMode(button.dataset.authMode || "login");
      });
    });
  }

  function validateInputs(email, password, confirmPassword, termsAccepted) {
    if (!email || !EMAIL_PATTERN.test(email)) {
      return "Enter a valid email address.";
    }

    if (!password) {
      return "Enter your password.";
    }

    if (mode === "signup" && password.length < MIN_PASSWORD_LEN) {
      return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
    }

    if (mode === "signup" && password !== confirmPassword) {
      return "Passwords do not match.";
    }

    if (mode === "signup" && !termsAccepted) {
      return "You must agree to the Terms and Community Standards.";
    }

    return "";
  }

  function extractAuthErrorMessage(error) {
    if (!error) return "Authentication failed.";
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message || "Authentication failed.";
    if (typeof error === "object") {
      const candidate = error.message || error.msg || error.error_description || error.description || error.error;
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
    return "Authentication failed.";
  }

  function isEmailDeliveryFailure(message) {
    const normalized = String(message || "").toLowerCase();
    return normalized.includes("error sending confirmation email") || normalized.includes("error sending email");
  }

  function mapAuthError(error) {
    const raw = extractAuthErrorMessage(error);
    const message = raw.toLowerCase();

    if (message.includes("invalid login credentials")) {
      return "Incorrect email or password.";
    }

    if (message.includes("email not confirmed")) {
      return "Email not verified yet. Check your inbox and confirm your account.";
    }

    if (message.includes("already registered")) {
      return "This email is already registered. Try logging in.";
    }

    if (message.includes("password should be at least")) {
      return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
    }

    if (message.includes("failed to fetch") || message.includes("network request failed")) {
      return "Could not reach Supabase. Check js/env.js URL/key and your internet connection.";
    }

    if (message.includes("email rate limit exceeded") || message.includes("rate limit")) {
      return "Too many email requests. Wait about 60 seconds, then try again.";
    }

    if (isEmailDeliveryFailure(message)) {
      return "Could not send verification email. Check Supabase email settings, then try again.";
    }

    if (message.includes("provider is not enabled") || message.includes("unsupported provider")) {
      if (message.includes("twitter") || message.includes("x")) {
        return "X sign-in is not enabled in Supabase Auth settings yet.";
      }
      if (message.includes("google")) {
        return "Google sign-in is not enabled in Supabase Auth settings yet.";
      }
      return "Social sign-in is not enabled in Supabase Auth settings yet.";
    }

    if (message.includes("access_denied") || message.includes("oauth") || message.includes("provider")) {
      return "Social sign-in was canceled or failed. Check Supabase redirect URL settings and try again.";
    }

    const fallback = raw && raw !== "Authentication failed." ? raw : "Authentication failed. Please try again.";
    return window.ClashlyUtils.reportError("Auth flow failed.", error, fallback);
  }

  function buildResetRedirectUrl() {
    const cleanHref = window.location.href.split("#")[0].split("?")[0];
    return new URL("reset-password.html", cleanHref).toString();
  }

  function buildAuthRedirectUrl() {
    const cleanHref = window.location.href.split("#")[0].split("?")[0];
    return new URL("auth.html", cleanHref).toString();
  }

  function buildGoogleRedirectUrl() {
    return buildAuthRedirectUrl();
  }

  function resolveAuthRedirectUrl() {
    const redirectUrl = buildAuthRedirectUrl();
    return /^https?:\/\//i.test(redirectUrl) ? redirectUrl : "";
  }

  function getOAuthCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("code") || "").trim();
  }

  function getOAuthErrorFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("error_description") || params.get("error") || "").trim();
  }

  function setOAuthIntent(intent) {
    try {
      window.sessionStorage.setItem(OAUTH_INTENT_KEY, intent);
    } catch (_error) {
      // Ignore storage access errors.
    }
  }

  function getOAuthIntent() {
    try {
      return String(window.sessionStorage.getItem(OAUTH_INTENT_KEY) || "").trim();
    } catch (_error) {
      return "";
    }
  }

  function clearOAuthIntent() {
    try {
      window.sessionStorage.removeItem(OAUTH_INTENT_KEY);
    } catch (_error) {
      // Ignore storage access errors.
    }
  }

  function clearOAuthParamsFromUrl() {
    const url = new URL(window.location.href);
    const hadOauthParams =
      url.searchParams.has("code") ||
      url.searchParams.has("error") ||
      url.searchParams.has("error_description") ||
      url.searchParams.has("state");

    if (!hadOauthParams) return;

    url.searchParams.delete("code");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function showOtpStep(email) {
    const otpHint = document.getElementById("otp-hint");
    const otpInput = document.getElementById("otp-code");

    pendingOtpEmail = email;
    openOtpModal();
    if (otpHint) otpHint.textContent = `We sent a 6-digit code to ${email}.`;
    if (otpInput) otpInput.value = "";
    if (otpInput) otpInput.focus();
  }

  function bindOtpModalClose() {
    const modal = getOtpModal();
    if (!modal) return;

    const closeTargets = modal.querySelectorAll("[data-close-otp='true']");
    closeTargets.forEach((target) => {
      target.addEventListener("click", () => {
        closeOtpModal();
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) {
        closeOtpModal();
      }
    });
  }

  function bindForgotModalClose() {
    const modal = getForgotModal();
    if (!modal) return;

    const closeTargets = modal.querySelectorAll("[data-close-forgot='true']");
    closeTargets.forEach((target) => {
      target.addEventListener("click", () => {
        closeForgotModal();
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) {
        closeForgotModal();
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

  async function redirectAfterAuth(userId) {
    const profileCheck = await window.ClashlyProfiles.hasCompletedProfile(userId);
    if (profileCheck.error) {
      throw profileCheck.error;
    }

    window.location.replace(profileCheck.completed ? "index.html" : "profile-setup.html");
  }

  async function handleLogin(email, password) {
    const signInResult = await window.ClashlyAuth.signInWithEmail(email, password);
    if (signInResult.error) {
      throw signInResult.error;
    }

    const userId = signInResult.data && signInResult.data.user ? signInResult.data.user.id : "";
    if (!userId) {
      throw new Error("Login succeeded but user data was unavailable.");
    }

    await redirectAfterAuth(userId);
  }

  async function handleSignUp(email, password) {
    pendingSignupPassword = "";
    const signUpResult = await window.ClashlyAuth.signUpWithEmail(email, password, resolveAuthRedirectUrl());
    if (!signUpResult.error) {
      const user = signUpResult.data && signUpResult.data.user ? signUpResult.data.user : null;
      const session = signUpResult.data && signUpResult.data.session ? signUpResult.data.session : null;

      // If email confirmations are disabled, signup can already return a session.
      if (user && session) {
        await redirectAfterAuth(user.id);
        return;
      }

      showOtpStep(email);
      setStatus("Account created. Enter the verification code sent to your email.", "success");
      return;
    }

    const signUpMessage = extractAuthErrorMessage(signUpResult.error);
    if (!isEmailDeliveryFailure(signUpMessage)) {
      throw signUpResult.error;
    }

    // In some backend states, user creation can succeed even if confirmation delivery fails.
    const loginFallback = await window.ClashlyAuth.signInWithEmail(email, password);
    if (!loginFallback.error && loginFallback.data && loginFallback.data.user) {
      await redirectAfterAuth(loginFallback.data.user.id);
      return;
    }

    // Fallback path: if signup confirmation email fails, try OTP signup flow.
    pendingSignupPassword = password;
    const otpResult = await window.ClashlyAuth.sendEmailOtp(email, true);
    if (otpResult.error) {
      pendingSignupPassword = "";
      if (isEmailDeliveryFailure(extractAuthErrorMessage(otpResult.error))) {
        throw new Error(
          "Supabase could not send verification email. Fix Auth -> Email settings/templates and try again."
        );
      }
      throw otpResult.error;
    }

    showOtpStep(email);
    setStatus("Verification code sent. Enter the code from your email to finish creating your account.", "success");
  }

  async function handleForgotPassword(email) {
    if (!email || !EMAIL_PATTERN.test(email)) {
      throw new Error("Enter your account email first, then try again.");
    }

    const resetResult = await window.ClashlyAuth.requestPasswordReset(email, buildResetRedirectUrl());
    if (resetResult.error) {
      throw resetResult.error;
    }
  }

  async function handleOAuthAuth(provider) {
    setOAuthIntent(mode === "signup" ? "signup" : "login");
    const oauthResult =
      provider === "x"
        ? await window.ClashlyAuth.signInWithX(resolveAuthRedirectUrl())
        : await window.ClashlyAuth.signInWithGoogle(resolveAuthRedirectUrl());
    if (oauthResult.error) {
      clearOAuthIntent();
      throw oauthResult.error;
    }
  }

  async function handleOAuthCallback() {
    const oauthError = getOAuthErrorFromUrl();
    if (oauthError) {
      clearOAuthIntent();
      clearOAuthParamsFromUrl();
      throw new Error(oauthError);
    }

    const code = getOAuthCodeFromUrl();
    if (!code) return false;

    const exchangeResult = await window.ClashlyAuth.exchangeCodeForSession(code);
    clearOAuthParamsFromUrl();
    if (exchangeResult.error) {
      clearOAuthIntent();
      throw exchangeResult.error;
    }

    const sessionResult = await window.ClashlyAuth.getSession();
    if (sessionResult.error) {
      throw sessionResult.error;
    }

    const userId = sessionResult.session && sessionResult.session.user ? sessionResult.session.user.id : "";
    if (!userId) {
      clearOAuthIntent();
      throw new Error("Social sign-in succeeded but no user session was found.");
    }

    const oauthIntent = getOAuthIntent();
    clearOAuthIntent();
    if (oauthIntent === "signup") {
      window.location.replace("profile-setup.html");
      return true;
    }

    await redirectAfterAuth(userId);
    return true;
  }

  async function handleVerifyOtp(code) {
    if (!pendingOtpEmail) {
      throw new Error("Missing signup email. Start signup again.");
    }

    if (!OTP_PATTERN.test(code)) {
      throw new Error("Enter a valid verification code.");
    }

    // Prefer signup verification token; fall back to email OTP token.
    let verifyResult = await window.ClashlyAuth.verifyEmailOtp(pendingOtpEmail, code, "signup");
    if (verifyResult.error) {
      const fallback = await window.ClashlyAuth.verifyEmailOtp(pendingOtpEmail, code, "email");
      if (fallback.error) {
        throw fallback.error || verifyResult.error;
      }
      verifyResult = fallback;
    }

    const user = verifyResult.data && verifyResult.data.user ? verifyResult.data.user : null;
    if (!user) {
      throw new Error("OTP verified but user session was unavailable.");
    }

    if (pendingSignupPassword) {
      const setPasswordResult = await window.ClashlyAuth.updatePassword(pendingSignupPassword);
      if (setPasswordResult.error) {
        throw setPasswordResult.error;
      }
      pendingSignupPassword = "";
    }

    await redirectAfterAuth(user.id);
  }

  function initOtpForm() {
    const otpForm = document.getElementById("otp-form");
    const otpSubmit = document.getElementById("otp-submit");
    const otpResend = document.getElementById("otp-resend");
    const otpInput = document.getElementById("otp-code");
    if (!otpForm || !otpSubmit || !otpResend || !otpInput) return;

    otpForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus("", "");

      const code = otpInput.value.trim();
      otpSubmit.disabled = true;
      otpSubmit.textContent = "Verifying...";

      try {
        await handleVerifyOtp(code);
      } catch (error) {
        setStatus(mapAuthError(error), "error");
      } finally {
        otpSubmit.disabled = false;
        otpSubmit.textContent = "Verify code";
      }
    });

    otpResend.addEventListener("click", async () => {
      setStatus("", "");
      if (!pendingOtpEmail) {
        setStatus("Missing signup email. Start signup again.", "error");
        return;
      }

      otpResend.disabled = true;
      otpResend.textContent = "Resending...";
      try {
        const resendResult = pendingSignupPassword
          ? await window.ClashlyAuth.sendEmailOtp(pendingOtpEmail, true)
          : await window.ClashlyAuth.resendSignupOtp(pendingOtpEmail);
        if (resendResult.error) {
          throw resendResult.error;
        }
        setStatus("OTP sent again. Check your inbox.", "success");
      } catch (error) {
        setStatus(mapAuthError(error), "error");
      } finally {
        otpResend.disabled = false;
        otpResend.textContent = "Resend code";
      }
    });
  }

  function initAuthForm() {
    const form = document.getElementById("auth-form");
    const submitBtn = document.getElementById("auth-submit");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus("", "");

      if (!window.ClashlySupabase || !window.ClashlySupabase.isConfigured()) {
        setStatus("Supabase is not configured. Update js/env.js.", "error");
        return;
      }

      const formData = new FormData(form);
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "");
      const confirmPassword = String(formData.get("confirm_password") || "");
      const termsAccepted = formData.get("terms") === "yes";
      const validationError = validateInputs(email, password, confirmPassword, termsAccepted);
      if (validationError) {
        setStatus(validationError, "error");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = mode === "signup" ? "Creating..." : "Logging in...";
      }

      try {
        if (mode === "signup") {
          await handleSignUp(email, password);
        } else {
          await handleLogin(email, password);
        }
      } catch (error) {
        setStatus(mapAuthError(error), "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = mode === "signup" ? "Create account" : "Log in";
        }
      }
    });
  }

  function initForgotPassword() {
    const forgotButton = document.getElementById("auth-forgot-btn");
    const emailInput = document.getElementById("auth-email");
    const forgotForm = document.getElementById("forgot-form");
    const forgotSubmit = document.getElementById("forgot-submit");
    const forgotEmailInput = document.getElementById("forgot-email");
    const forgotStatus = document.getElementById("forgot-status");

    function setForgotStatus(message, type) {
      if (!forgotStatus) return;
      forgotStatus.hidden = !message;
      forgotStatus.textContent = message || "";
      forgotStatus.classList.remove("is-error", "is-success");
      if (type === "error") forgotStatus.classList.add("is-error");
      if (type === "success") forgotStatus.classList.add("is-success");
    }

    if (forgotButton && emailInput instanceof HTMLInputElement) {
      forgotButton.addEventListener("click", () => {
        openForgotModal(emailInput.value);
      });
    }

    if (!forgotForm || !forgotSubmit || !(forgotEmailInput instanceof HTMLInputElement)) return;

    forgotForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setForgotStatus("", "");

      if (!window.ClashlySupabase || !window.ClashlySupabase.isConfigured()) {
        setForgotStatus("Supabase is not configured. Update js/env.js.", "error");
        return;
      }

      const email = String(forgotEmailInput.value || "").trim().toLowerCase();
      forgotSubmit.disabled = true;
      forgotSubmit.textContent = "Sending...";

      try {
        await handleForgotPassword(email);
        setForgotStatus("Reset link sent. Check your email inbox.", "success");
        forgotAutoCloseTimer = window.setTimeout(() => {
          closeForgotModal();
        }, 10000);
      } catch (error) {
        setForgotStatus(mapAuthError(error), "error");
      } finally {
        forgotSubmit.disabled = false;
        forgotSubmit.textContent = "Send reset link";
      }
    });
  }

  function setOauthButtonsDisabled(disabled) {
    const googleBtn = document.getElementById("auth-google-btn");
    const xBtn = document.getElementById("auth-x-btn");
    [googleBtn, xBtn].forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.disabled = disabled;
    });
  }

  function initOauthAuth() {
    const googleBtn = document.getElementById("auth-google-btn");
    const xBtn = document.getElementById("auth-x-btn");
    if (!(googleBtn instanceof HTMLButtonElement) && !(xBtn instanceof HTMLButtonElement)) return;

    function bindOauthButton(button, provider) {
      if (!(button instanceof HTMLButtonElement)) return;

      button.addEventListener("click", async () => {
        setStatus("", "");

        if (!window.ClashlySupabase || !window.ClashlySupabase.isConfigured()) {
          setStatus("Supabase is not configured. Update js/env.js.", "error");
          return;
        }

        setOauthButtonsDisabled(true);
        try {
          await handleOAuthAuth(provider);
        } catch (error) {
          setStatus(mapAuthError(error), "error");
          setOauthButtonsDisabled(false);
        }
      });
    }

    bindOauthButton(googleBtn, "google");
    bindOauthButton(xBtn, "x");
  }

  function setupInstallAppCard() {
    const installCard = document.getElementById("installAppCard");
    const installToggle = document.getElementById("installAppToggle");
    const installBtn = document.getElementById("authInstallBtn");

    if (!installCard || !installToggle) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      installCard.hidden = true;
      return;
    }

    installToggle.addEventListener("click", () => {
      const isOpen = installCard.classList.toggle("is-open");
      installToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    let deferredPrompt = window.__pwaInstallPrompt || null;

    function revealInstallBtn() {
      if (installBtn && deferredPrompt) {
        installBtn.style.display = "inline-flex";
      }
    }

    if (deferredPrompt) {
      revealInstallBtn();
    }

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      window.__pwaInstallPrompt = e;
      revealInstallBtn();
    });

    window.addEventListener("clashly:install-prompt-ready", (e) => {
      if (e && e.detail) {
        deferredPrompt = e.detail;
        revealInstallBtn();
      }
    });

    if (installBtn) {
      installBtn.addEventListener("click", async () => {
        if (!deferredPrompt) return;
        try {
          await deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          if (choice && choice.outcome === "accepted") {
            installBtn.style.display = "none";
            installCard.hidden = true;
          }
        } catch (_err) {
          // ignore
        }
        deferredPrompt = null;
      });
    }
  }

  async function bootAuthPage() {
    try {
      setupInstallAppCard();
      if (!window.ClashlyAuth || !window.ClashlyProfiles) return;

      animatePage();
      initAuthSwitch();
      setMode("login");
      const redirectedByOauth = await handleOAuthCallback();
      if (redirectedByOauth) return;
      initOauthAuth();
      initAuthForm();
      initForgotPassword();
      initOtpForm();
      bindOtpModalClose();
      bindForgotModalClose();
      initPasswordToggles();
    } catch (error) {
      setStatus(mapAuthError(error), "error");
    } finally {
      if (window.ClasheLoader) {
        window.ClasheLoader.release("page-data");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootAuthPage().catch((error) => {
      setStatus(mapAuthError(error), "error");
      if (window.ClasheLoader) {
        window.ClasheLoader.release("page-data");
      }
    });
  });

  // Clicking Google/X disables both buttons right before the browser
  // navigates away to the provider's real sign-in page (see
  // setOauthButtonsDisabled above) — correct while that navigation is in
  // flight, since the page is about to be replaced anyway. The bug this
  // fixes: if the person backs out of the provider's page (closes the tab,
  // hits back, doesn't finish authorizing) instead of completing the OAuth
  // redirect, some browsers restore this auth page from the back/forward
  // cache (bfcache) exactly as it was frozen — disabled buttons included —
  // rather than reloading it fresh, so DOMContentLoaded never re-fires and
  // nothing re-enables them. `pageshow` with `event.persisted === true` is
  // the standard signal for exactly this "restored from bfcache" case.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      setOauthButtonsDisabled(false);
    }
  });
})();
