/**
 * Clashe Page State & Data Cache Service
 * Provides instant Stale-While-Revalidate (SWR) caching and scroll position restoration
 * across page navigations without unnecessary skeleton flashes or reloads.
 * Automatically segments and validates cached records by user ID so account switches
 * never leak previous accounts' votes, bookmarks, or engagement states.
 */
(function () {
  const STORAGE_PREFIX = "clashe_cache_v1_";
  const ACTIVE_USER_KEY = "clashe_active_user_id";
  const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
  const memoryStore = new Map();

  function isStorageAvailable() {
    try {
      const testKey = "__clashe_test__";
      window.sessionStorage.setItem(testKey, "1");
      window.sessionStorage.removeItem(testKey);
      return true;
    } catch (_err) {
      return false;
    }
  }

  const hasSessionStorage = typeof window !== "undefined" && isStorageAvailable();

  function getActiveUserId() {
    if (hasSessionStorage) {
      try {
        const stored = window.sessionStorage.getItem(ACTIVE_USER_KEY);
        if (stored !== null) return stored;
      } catch (_) {}
    }

    // Synchronously try reading Supabase session from localStorage if present
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
            const raw = window.localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.user && parsed.user.id) {
                const uid = String(parsed.user.id);
                if (hasSessionStorage) {
                  try {
                    window.sessionStorage.setItem(ACTIVE_USER_KEY, uid);
                  } catch (_) {}
                }
                return uid;
              }
            }
          }
        }
      }
    } catch (_) {}

    return "";
  }

  function setActiveUserId(userId) {
    const safeId = userId ? String(userId) : "";
    const previous = getActiveUserId();
    if (previous && safeId && previous !== safeId) {
      // User changed! Purge all cached page states from previous user
      clearAll();
    }
    if (hasSessionStorage) {
      try {
        window.sessionStorage.setItem(ACTIVE_USER_KEY, safeId);
      } catch (_) {}
    }
  }

  function clearActiveUserId() {
    if (hasSessionStorage) {
      try {
        window.sessionStorage.removeItem(ACTIVE_USER_KEY);
      } catch (_) {}
    }
  }

  function savePageState(pageKey, state, customScroll, userId) {
    if (!pageKey || !state) return;

    const resolvedUserId = userId !== undefined ? (userId ? String(userId) : "") : getActiveUserId();

    const record = {
      data: state,
      timestamp: Date.now(),
      userId: resolvedUserId,
      scroll:
        typeof customScroll === "number"
          ? Math.max(0, customScroll)
          : Math.max(0, window.scrollY || document.documentElement.scrollTop || 0),
    };

    memoryStore.set(pageKey, record);

    if (hasSessionStorage) {
      try {
        window.sessionStorage.setItem(STORAGE_PREFIX + pageKey, JSON.stringify(record));
      } catch (_err) {
        // Quota exceeded or private mode — memoryStore still retains state
      }
    }
  }

  function getPageState(pageKey, maxAgeMs = DEFAULT_MAX_AGE_MS, requiredUserId) {
    if (!pageKey) return null;

    let record = memoryStore.get(pageKey);

    if (!record && hasSessionStorage) {
      try {
        const raw = window.sessionStorage.getItem(STORAGE_PREFIX + pageKey);
        if (raw) {
          record = JSON.parse(raw);
          if (record) {
            memoryStore.set(pageKey, record);
          }
        }
      } catch (_err) {
        record = null;
      }
    }

    if (!record || !record.data) return null;

    const age = Date.now() - (record.timestamp || 0);
    if (age > maxAgeMs) {
      clearPageState(pageKey);
      return null;
    }

    // Verify user ownership if recorded
    if (record.userId !== undefined) {
      const expectedUserId = requiredUserId !== undefined ? (requiredUserId ? String(requiredUserId) : "") : getActiveUserId();
      if (record.userId !== expectedUserId) {
        clearPageState(pageKey);
        return null;
      }
    }

    return record;
  }

  function clearPageState(pageKey) {
    if (!pageKey) return;
    memoryStore.delete(pageKey);
    if (hasSessionStorage) {
      try {
        window.sessionStorage.removeItem(STORAGE_PREFIX + pageKey);
      } catch (_err) {}
    }
  }

  function clearAll() {
    memoryStore.clear();
    clearActiveUserId();
    if (hasSessionStorage) {
      try {
        const keysToRemove = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && (k.startsWith(STORAGE_PREFIX) || k.startsWith("clashe_"))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch (_err) {}
    }
  }

  function saveScroll(pageKey) {
    if (!pageKey) return;
    const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    const existing = getPageState(pageKey);
    if (existing) {
      existing.scroll = y;
      savePageState(pageKey, existing.data, existing.scroll, existing.userId);
    } else {
      savePageState(pageKey, { scrollOnly: true });
    }
  }

  function restoreScroll(pageKey) {
    const record = getPageState(pageKey);
    if (!record || typeof record.scroll !== "number" || record.scroll <= 0) return;

    const targetY = record.scroll;
    // Attempt instant scroll immediately and double check on next frame
    window.scrollTo({ top: targetY, behavior: "instant" });
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: "instant" });
    });
  }

  function updateTakeInCache(takeId, updater) {
    if (!takeId || typeof updater !== "function") return;

    ["home", "for-you", "following"].forEach((key) => {
      const state = getPageState(key);
      if (state && state.data && Array.isArray(state.data.takes)) {
        let changed = false;
        const updatedTakes = state.data.takes.map((t) => {
          if (t && t.id === takeId) {
            changed = true;
            return updater(t);
          }
          return t;
        });
        if (changed) {
          state.data.takes = updatedTakes;
          savePageState(key, state.data, state.scroll, state.userId);
        }
      }
    });
  }

  window.ClasheCache = {
    getActiveUserId,
    setActiveUserId,
    clearActiveUserId,
    savePageState,
    getPageState,
    clearPageState,
    clearAll,
    saveScroll,
    restoreScroll,
    updateTakeInCache,
  };
})();
