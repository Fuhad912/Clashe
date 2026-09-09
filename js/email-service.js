(function () {
  const PREFERENCES_TABLE = "user_email_preferences";
  const PREFS_STORAGE_PREFIX = "clashe_email_prefs_";

  const DEFAULT_PREFERENCES = {
    email_notifications_enabled: true,
    email_on_follow: true,
    email_on_comment: true,
    email_on_reply: true,
    email_on_like: true,
  };

  function getClient() {
    if (!window.ClashlySupabase) return null;
    return window.ClashlySupabase.getClient();
  }

  function getAppOrigin() {
    try {
      return window.location.origin;
    } catch (_e) {
      return "https://clashe.vercel.app";
    }
  }

  /**
   * Dispatches a welcome email via Supabase Edge Function clashe-email
   * @param {Object} params - { email, username, userId }
   */
  async function sendWelcomeEmail(params) {
    const email = String(params && params.email || "").trim();
    const username = String(params && params.username || "").trim();
    const userId = String(params && params.userId || "").trim();

    if (!email || !username) {
      console.warn("[ClasheEmail] sendWelcomeEmail requires email and username.");
      return { success: false, error: new Error("Missing email or username") };
    }

    const client = getClient();
    if (!client || !client.functions) {
      console.warn("[ClasheEmail] Supabase client or functions module is not available.");
      return { success: false, error: new Error("Supabase functions client not available") };
    }

    try {
      console.log(`[ClasheEmail] Dispatching welcome email to: ${email} (@${username})`);
      const { data, error } = await client.functions.invoke("clashe-email", {
        body: {
          type: "welcome",
          email,
          username,
          userId,
          appUrl: getAppOrigin(),
        },
      });

      if (error) {
        console.warn("[ClasheEmail] Welcome email delivery returned warning/error:", error);
        return { success: false, error };
      }

      console.info("[ClasheEmail] Welcome email successfully delivered! Response:", data);
      return { success: true, data };
    } catch (err) {
      console.warn("[ClasheEmail] Failed to invoke clashe-email edge function:", err);
      return { success: false, error: err };
    }
  }

  /**
   * Dispatches an interaction notification email via Supabase Edge Function clashe-email
   * Non-blocking and silent on failure.
   * @param {Object} params - { recipientId, actorId, type, targetTakeId, targetCommentId, metadata }
   */
  async function sendNotificationEmail(params) {
    const recipientId = String(params && params.recipientId || "").trim();
    const actorId = String(params && params.actorId || "").trim();
    const type = String(params && params.type || "").trim().toLowerCase();

    if (!recipientId || !actorId || !type) return { success: false, skipped: true };
    if (recipientId === actorId) return { success: false, skipped: true, reason: "self_action" };

    const client = getClient();
    if (!client || !client.functions) return { success: false, skipped: true };

    try {
      console.log(`[ClasheEmail] Dispatching ${type} notification email for recipient: ${recipientId}`);
      const { data, error } = await client.functions.invoke("clashe-email", {
        body: {
          type: "notification",
          recipientId,
          actorId,
          notificationType: type,
          targetTakeId: params.targetTakeId || undefined,
          targetCommentId: params.targetCommentId || undefined,
          metadata: params.metadata || {},
          appUrl: getAppOrigin(),
        },
      });

      if (error) {
        console.warn("[ClasheEmail] Notification email invocation error:", error);
        return { success: false, error };
      }

      console.info("[ClasheEmail] Notification email delivered! Response:", data);
      return { success: true, data };
    } catch (err) {
      console.warn("[ClasheEmail] Could not send notification email:", err);
      return { success: false, error: err };
    }
  }

  /**
   * Gets email notification preferences for a user
   * @param {string} userId
   */
  async function getEmailPreferences(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return { ...DEFAULT_PREFERENCES };

    try {
      const cached = window.localStorage.getItem(PREFS_STORAGE_PREFIX + safeUserId);
      if (cached) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(cached) };
      }
    } catch (_e) {}

    const client = getClient();
    if (!client) return { ...DEFAULT_PREFERENCES };

    try {
      const { data, error } = await client
        .from(PREFERENCES_TABLE)
        .select("email_notifications_enabled, email_on_follow, email_on_comment, email_on_reply, email_on_like")
        .eq("user_id", safeUserId)
        .maybeSingle();

      if (!error && data) {
        const merged = { ...DEFAULT_PREFERENCES, ...data };
        try {
          window.localStorage.setItem(PREFS_STORAGE_PREFIX + safeUserId, JSON.stringify(merged));
        } catch (_e) {}
        return merged;
      }
    } catch (_err) {}

    return { ...DEFAULT_PREFERENCES };
  }

  /**
   * Updates email notification preferences for a user
   * @param {string} userId
   * @param {Object} prefs
   */
  async function updateEmailPreferences(userId, prefs) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return { success: false, error: new Error("User ID is required") };

    const payload = {
      user_id: safeUserId,
      email_notifications_enabled: Boolean(prefs.email_notifications_enabled !== false),
      email_on_follow: Boolean(prefs.email_on_follow !== false),
      email_on_comment: Boolean(prefs.email_on_comment !== false),
      email_on_reply: Boolean(prefs.email_on_reply !== false),
      email_on_like: Boolean(prefs.email_on_like !== false),
      updated_at: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(PREFS_STORAGE_PREFIX + safeUserId, JSON.stringify(payload));
    } catch (_e) {}

    const client = getClient();
    if (!client) return { success: true, preferences: payload };

    try {
      const { data, error } = await client
        .from(PREFERENCES_TABLE)
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();

      if (error) {
        console.warn("[ClasheEmail] Could not sync email preferences to database:", error);
        return { success: true, preferences: payload, synced: false };
      }

      return { success: true, preferences: data || payload, synced: true };
    } catch (err) {
      console.warn("[ClasheEmail] Preference save error:", err);
      return { success: true, preferences: payload, synced: false };
    }
  }

  window.ClashlyEmail = {
    sendWelcomeEmail,
    sendNotificationEmail,
    getEmailPreferences,
    updateEmailPreferences,
    DEFAULT_PREFERENCES,
  };
})();
