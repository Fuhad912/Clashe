/**
 * Clashe Page State & Data Cache Service
 * Provides instant Stale-While-Revalidate (SWR) caching and scroll position restoration
 * across page navigations without unnecessary skeleton flashes or reloads.
 */
(function () {
  const STORAGE_PREFIX = "clashe_cache_v1_";
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

  function savePageState(pageKey, state) {
    if (!pageKey || !state) return;
    const record = {
      data: state,
      timestamp: Date.now(),
      scroll: Math.max(0, window.scrollY || document.documentElement.scrollTop || 0),
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

  function getPageState(pageKey, maxAgeMs = DEFAULT_MAX_AGE_MS) {
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
    if (hasSessionStorage) {
      try {
        const keysToRemove = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) {
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
      savePageState(pageKey, existing.data);
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
          savePageState(key, state.data);
        }
      }
    });
  }

  window.ClasheCache = {
    savePageState,
    getPageState,
    clearPageState,
    clearAll,
    saveScroll,
    restoreScroll,
    updateTakeInCache,
  };
})();
