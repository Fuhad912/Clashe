(function () {
  const PROFILES_TABLE = "profiles";
  const AVATAR_BUCKET = "avatars";
  const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
  const ALLOWED_GENDERS = ["female", "male", "non_binary", "prefer_not_to_say", "other"];
  const PROFILE_SELECT_BASE = "id, username, bio, date_of_birth, gender, avatar_url, created_at, clashscore";
  const PROFILE_SELECT_WITH_ONBOARDING = `${PROFILE_SELECT_BASE}, onboarding_seen`;
  const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
  const profileCacheById = new Map();
  const profileCacheByUsername = new Map();

  function getClientOrThrow() {
    if (!window.ClashlySupabase) {
      throw new Error("Supabase client module is not loaded.");
    }

    const client = window.ClashlySupabase.getClient();
    if (!client) {
      throw new Error("Supabase client is not configured.");
    }

    return client;
  }

  function normalizeUsername(username) {
    return (username || "").trim().toLowerCase();
  }

  function isUsernameValid(username) {
    return USERNAME_PATTERN.test(normalizeUsername(username));
  }

  function initialsFromUsername(username) {
    const safe = (username || "clashe").replace("@", "").trim();
    return safe.slice(0, 2).toUpperCase();
  }

  function isClashscoreColumnMissing(error) {
    const code = String(error && error.code || "");
    const message = String(error && error.message || "").toLowerCase();
    return code === "42703" || (message.includes("clashscore") && message.includes("column"));
  }

  function normalizeProfileRow(profile) {
    if (!profile) return profile;
    return {
      ...profile,
      clashscore: Math.max(0, Number(profile.clashscore || 0)),
    };
  }

  function readProfileCache(map, key) {
    if (!key) return null;
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return null;
    }
    return entry.profile;
  }

  function cacheProfile(profile) {
    const safeProfile = normalizeProfileRow(profile);
    if (!safeProfile || !safeProfile.id) return null;

    const entry = {
      profile: safeProfile,
      expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
    };

    profileCacheById.set(safeProfile.id, entry);

    Array.from(profileCacheByUsername.entries()).forEach(([cacheKey, cacheEntry]) => {
      if (cacheEntry && cacheEntry.profile && cacheEntry.profile.id === safeProfile.id && cacheKey !== safeProfile.username) {
        profileCacheByUsername.delete(cacheKey);
      }
    });

    if (safeProfile.username) {
      profileCacheByUsername.set(safeProfile.username, entry);
    }

    return safeProfile;
  }

  function cacheProfiles(profiles) {
    return (profiles || []).map((profile) => cacheProfile(profile)).filter(Boolean);
  }

  function getCachedProfileById(userId) {
    return readProfileCache(profileCacheById, userId);
  }

  function getCachedProfileByUsername(username) {
    return readProfileCache(profileCacheByUsername, normalizeUsername(username));
  }

  function getCachedProfilesByIds(userIds) {
    return [...new Set((userIds || []).filter(Boolean))]
      .map((userId) => getCachedProfileById(userId))
      .filter(Boolean);
  }

  async function fetchProfileByColumn(column, value, options) {
    const cachedProfile =
      column === "id"
        ? getCachedProfileById(value)
        : column === "username"
          ? getCachedProfileByUsername(value)
          : null;

    if (cachedProfile) {
      return {
        profile: cachedProfile,
        error: null,
      };
    }

    const client = getClientOrThrow();
    const includeOnboarding = Boolean(options && options.includeOnboarding);
    const preferredFields = includeOnboarding ? PROFILE_SELECT_WITH_ONBOARDING : PROFILE_SELECT_BASE;
    const fallbackFields = includeOnboarding
      ? "id, username, bio, date_of_birth, gender, avatar_url, created_at, onboarding_seen"
      : "id, username, bio, date_of_birth, gender, avatar_url, created_at";

    let result = await client
      .from(PROFILES_TABLE)
      .select(preferredFields)
      .eq(column, value)
      .maybeSingle();

    if (result.error && isClashscoreColumnMissing(result.error)) {
      result = await client
        .from(PROFILES_TABLE)
        .select(fallbackFields)
        .eq(column, value)
        .maybeSingle();
    }

    const profile = result.data ? cacheProfile(result.data) : null;
    return {
      profile,
      error: result.error,
    };
  }

  async function getProfileById(userId) {
    return fetchProfileByColumn("id", userId, { includeOnboarding: true });
  }

  async function getProfileByUsername(username) {
    const normalized = normalizeUsername(username);
    return fetchProfileByColumn("username", normalized, { includeOnboarding: false });
  }

  async function hasCompletedProfile(userId) {
    const { profile, error } = await getProfileById(userId);
    if (error) {
      return { completed: false, error };
    }

    return {
      completed: Boolean(profile && profile.username),
      profile,
      error: null,
    };
  }

  async function isUsernameAvailable(username, currentUserId) {
    const normalized = normalizeUsername(username);
    const client = getClientOrThrow();
    const { data, error } = await client
      .from(PROFILES_TABLE)
      .select("id")
      .eq("username", normalized)
      .limit(1)
      .maybeSingle();

    if (error) {
      return { available: false, error };
    }

    if (!data) {
      return { available: true, error: null };
    }

    return {
      available: data.id === currentUserId,
      error: null,
    };
  }

  async function uploadAvatar(file, userId) {
    if (!file) return { avatarUrl: "", error: null };

    const client = getClientOrThrow();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await client.storage.from(AVATAR_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

    if (uploadError) {
      return { avatarUrl: "", error: uploadError };
    }

    const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return {
      avatarUrl: data ? data.publicUrl : "",
      error: null,
    };
  }

  async function upsertProfile(input) {
    const client = getClientOrThrow();
    const normalizedUsername = normalizeUsername(input.username);
    const safeBio = (input.bio || "").trim();
    const resolvedDateOfBirth = (input.dateOfBirth || "").trim();
    const normalizedGender = (input.gender || "prefer_not_to_say").trim();

    const payload = {
      id: input.userId,
      username: normalizedUsername,
      bio: safeBio || null,
      date_of_birth: resolvedDateOfBirth || null,
      gender: ALLOWED_GENDERS.includes(normalizedGender) ? normalizedGender : "prefer_not_to_say",
      avatar_url: input.avatarUrl || null,
    };

    const { error } = await client
      .from(PROFILES_TABLE)
      .upsert(payload, { onConflict: "id" });

    if (error) {
      return { profile: null, error };
    }

    return getProfileById(input.userId);
  }


  async function hasSeenOnboardingInDb(userId) {
    const client = getClientOrThrow();
    const { data, error } = await client
      .from(PROFILES_TABLE)
      .select("onboarding_seen")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return { seen: false, error };
    return { seen: Boolean(data.onboarding_seen), error: null };
  }

  async function markOnboardingSeenInDb(userId) {
    const client = getClientOrThrow();
    const { error } = await client
      .from(PROFILES_TABLE)
      .update({ onboarding_seen: true })
      .eq("id", userId);

    return { error };
  }

  window.ClashlyProfiles = {
    PROFILES_TABLE,
    AVATAR_BUCKET,
    normalizeUsername,
    isUsernameValid,
    initialsFromUsername,
    cacheProfiles,
    getProfileById,
    getProfileByUsername,
    getCachedProfilesByIds,
    hasCompletedProfile,
    isUsernameAvailable,
    uploadAvatar,
    upsertProfile,
    hasSeenOnboardingInDb,
    markOnboardingSeenInDb,
  };
})();
