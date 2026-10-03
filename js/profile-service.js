(function () {
  const PROFILES_TABLE = "profiles";
  const AVATAR_BUCKET = "avatars";
  const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
  const ALLOWED_GENDERS = ["female", "male", "non_binary", "prefer_not_to_say", "other"];
  const PROFILE_SELECT_BASE = "id, username, bio, date_of_birth, gender, avatar_url, created_at, clashscore, pinned_take_id";
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

  function isColumnMissingError(error) {
    const code = String((error && error.code) || "");
    const message = String((error && error.message) || "").toLowerCase();
    return code === "42703" || message.includes("column") || message.includes("does not exist");
  }

  function readLocalPinnedTake(userId) {
    if (!userId) return null;
    try {
      return localStorage.getItem(`clashly_pinned_take_${userId}`) || null;
    } catch (_) {
      return null;
    }
  }

  function writeLocalPinnedTake(userId, takeId) {
    if (!userId) return;
    try {
      if (takeId) {
        localStorage.setItem(`clashly_pinned_take_${userId}`, String(takeId));
      } else {
        localStorage.removeItem(`clashly_pinned_take_${userId}`);
      }
    } catch (_) {}
  }

  function normalizeProfileRow(profile) {
    if (!profile) return profile;
    const localPinned = readLocalPinnedTake(profile.id);
    return {
      ...profile,
      clashscore: Math.max(0, Number(profile.clashscore || 0)),
      pinned_take_id: profile.pinned_take_id || localPinned || null,
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

    if (result.error && isColumnMissingError(result.error)) {
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

    let lastError = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        let { data, error } = await client
          .from(PROFILES_TABLE)
          .upsert(payload, { onConflict: "id" })
          .select()
          .maybeSingle();

        if (error && error.code !== "23505") {
          // If upsert fails with non-duplicate error, try plain insert
          const insertAttempt = await client
            .from(PROFILES_TABLE)
            .insert(payload)
            .select()
            .maybeSingle();
          if (!insertAttempt.error) {
            data = insertAttempt.data;
            error = null;
          } else if (
            insertAttempt.error.code === "23505" &&
            String(insertAttempt.error.message || "").includes("profiles_pkey")
          ) {
            const updateAttempt = await client
              .from(PROFILES_TABLE)
              .update(payload)
              .eq("id", input.userId)
              .select()
              .maybeSingle();
            if (!updateAttempt.error) {
              data = updateAttempt.data;
              error = null;
            } else {
              error = updateAttempt.error;
            }
          } else {
            error = insertAttempt.error;
          }
        }

        if (!error) {
          const saved = data ? cacheProfile(data) : cacheProfile(payload);
          return { profile: saved, error: null };
        }

        lastError = error;
      } catch (err) {
        lastError = err;
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    return { profile: null, error: lastError };
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

  async function setPinnedTake(userId, takeId) {
    if (!userId) {
      return { success: false, error: new Error("User ID is required.") };
    }

    const safeTakeId = takeId ? String(takeId).trim() : null;
    writeLocalPinnedTake(userId, safeTakeId);

    const cached = getCachedProfileById(userId);
    if (cached) {
      cached.pinned_take_id = safeTakeId;
    }

    try {
      const client = getClientOrThrow();
      const { error } = await client
        .from(PROFILES_TABLE)
        .update({ pinned_take_id: safeTakeId })
        .eq("id", userId);

      if (error) {
        if (isColumnMissingError(error)) {
          console.warn("pinned_take_id column does not exist yet in profiles table. Using local fallback.");
          return { success: true, error: null, fallback: true };
        }
        return { success: false, error };
      }

      return { success: true, error: null };
    } catch (err) {
      return { success: true, error: null, fallback: true };
    }
  }

  function getPinnedTakeId(profile) {
    if (!profile) return null;
    return profile.pinned_take_id || readLocalPinnedTake(profile.id) || null;
  }

  async function getProfilesByIds(userIds) {
    const safeUserIds = [...new Set((userIds || []).filter(Boolean))];
    if (!safeUserIds.length) return { profiles: [], error: null };

    const cachedProfiles = getCachedProfilesByIds(safeUserIds);
    const profileMap = new Map(cachedProfiles.map((p) => [p.id, p]));
    const missingUserIds = safeUserIds.filter((id) => !profileMap.has(id));

    if (!missingUserIds.length) {
      return {
        profiles: safeUserIds.map((id) => profileMap.get(id)).filter(Boolean),
        error: null,
      };
    }

    try {
      const client = getClientOrThrow();
      const { data, error } = await client
        .from(PROFILES_TABLE)
        .select(PROFILE_SELECT_BASE)
        .in("id", missingUserIds);

      if (error) {
        return { profiles: Array.from(profileMap.values()), error };
      }

      const cached = cacheProfiles(data || []);
      cached.forEach((p) => {
        if (p && p.id) profileMap.set(p.id, p);
      });

      return {
        profiles: safeUserIds.map((id) => profileMap.get(id)).filter(Boolean),
        error: null,
      };
    } catch (err) {
      return { profiles: Array.from(profileMap.values()), error: err };
    }
  }

  function clearProfileCache() {
    profileCacheById.clear();
    profileCacheByUsername.clear();
  }

  window.ClashlyProfiles = {
    PROFILES_TABLE,
    AVATAR_BUCKET,
    normalizeUsername,
    isUsernameValid,
    initialsFromUsername,
    cacheProfiles,
    getCachedProfileById,
    getCachedProfileByUsername,
    getProfileById,
    getProfileByUsername,
    getCachedProfilesByIds,
    getProfilesByIds,
    hasCompletedProfile,
    isUsernameAvailable,
    uploadAvatar,
    upsertProfile,
    hasSeenOnboardingInDb,
    markOnboardingSeenInDb,
    setPinnedTake,
    getPinnedTakeId,
    clearProfileCache,
  };
})();
