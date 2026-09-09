(function () {
  const TAKES_TABLE = "takes";
  const PROFILES_TABLE = "profiles";
  const TAKE_HASHTAGS_TABLE = "take_hashtags";
  const HASHTAGS_TABLE = "hashtags";
  const VOTES_TABLE = "votes";
  const RESULTS_CACHE_TTL_MS = 20_000;
  const SUGGESTIONS_CACHE_TTL_MS = 15_000;
  const TRENDING_CACHE_TTL_MS = 90_000;

  const cacheStore = {
    results: new Map(),
    suggestions: new Map(),
    trending: new Map(),
  };

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

  function normalizeQuery(query) {
    return String(query || "").trim();
  }

  function normalizeHashtagQuery(query) {
    return normalizeQuery(query)
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
  }

  function clampLimit(limit, fallback, max) {
    const numeric = Number(limit || fallback);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return Math.max(1, Math.min(max || fallback, Math.floor(numeric)));
  }

  // Relevance tiers, highest first: exact match, then prefix match, then a
  // plain substring hit anywhere else in the field. Used to rank search
  // candidates before any activity/engagement weighting is applied.
  function matchRelevance(fieldValue, safeQuery) {
    const normalizedField = String(fieldValue || "").toLowerCase();
    const normalizedQuery = String(safeQuery || "").toLowerCase();
    if (!normalizedQuery) return 0;
    if (normalizedField === normalizedQuery) return 3;
    if (normalizedField.startsWith(normalizedQuery)) return 2;
    if (normalizedField.includes(normalizedQuery)) return 1;
    return 0;
  }

  async function fetchFollowerCounts(userIds) {
    if (!userIds.length) return { countsById: new Map(), error: null };
    const client = getClientOrThrow();
    const result = await client
      .from("follows")
      .select("following_id")
      .in("following_id", userIds);

    if (result.error) return { countsById: new Map(), error: result.error };

    const countsById = new Map();
    (result.data || []).forEach((row) => {
      countsById.set(row.following_id, (countsById.get(row.following_id) || 0) + 1);
    });
    return { countsById, error: null };
  }

  async function fetchHashtagTakeCounts(hashtagIds) {
    if (!hashtagIds.length) return { countsById: new Map(), error: null };
    const client = getClientOrThrow();
    const result = await client
      .from(TAKE_HASHTAGS_TABLE)
      .select("hashtag_id")
      .in("hashtag_id", hashtagIds);

    if (result.error) return { countsById: new Map(), error: result.error };

    const countsById = new Map();
    (result.data || []).forEach((row) => {
      countsById.set(row.hashtag_id, (countsById.get(row.hashtag_id) || 0) + 1);
    });
    return { countsById, error: null };
  }

  function getCached(cacheMap, key, ttlMs) {
    const entry = cacheMap.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > ttlMs) {
      cacheMap.delete(key);
      return null;
    }
    return entry.value;
  }

  function setCached(cacheMap, key, value) {
    cacheMap.set(key, {
      at: Date.now(),
      value,
    });
  }

  function isMissingRpcFunction(error, fnName) {
    if (!error) return false;
    const code = String(error.code || "");
    const message = String(error.message || "").toLowerCase();
    return (
      code === "42883" ||
      message.includes(`function public.${String(fnName || "").toLowerCase()}`) ||
      message.includes(`function ${String(fnName || "").toLowerCase()}`)
    );
  }

  async function fetchProfilesByIds(userIds) {
    if (!userIds.length) {
      return { profiles: [], error: null };
    }

    const client = getClientOrThrow();
    const result = await client
      .from(PROFILES_TABLE)
      .select("id, username, avatar_url")
      .in("id", userIds);

    return {
      profiles: result.data || [],
      error: result.error,
    };
  }

  async function searchUsers(query, options) {
    const client = getClientOrThrow();
    const safeQuery = normalizeQuery(query).toLowerCase();
    const limit = clampLimit(options && options.limit, 8, 20);
    // Pull a wider candidate pool than we'll actually show, since the DB-side
    // sort is just alphabetical — real ranking happens client-side below.
    const candidatePoolSize = Math.min(60, limit * 5);

    if (!safeQuery) {
      return { users: [], error: null };
    }

    const result = await client
      .from(PROFILES_TABLE)
      .select("id, username, bio, avatar_url")
      .ilike("username", `%${safeQuery}%`)
      .limit(candidatePoolSize);

    if (result.error) {
      return { users: [], error: result.error };
    }

    const candidates = result.data || [];
    const candidateIds = candidates.map((user) => user.id).filter(Boolean);
    const followerCounts = await fetchFollowerCounts(candidateIds);
    // A follower-count lookup failure shouldn't sink the whole search — we
    // still have valid relevance-ranked results, just without the activity
    // tiebreak, so this stays a silent degradation rather than a hard error.
    const countsById = followerCounts.countsById;

    const ranked = candidates
      .map((user) => ({
        user,
        relevance: matchRelevance(user.username, safeQuery),
        followers: countsById.get(user.id) || 0,
      }))
      .sort((left, right) => {
        if (right.relevance !== left.relevance) return right.relevance - left.relevance;
        if (right.followers !== left.followers) return right.followers - left.followers;
        return String(left.user.username || "").localeCompare(String(right.user.username || ""));
      })
      .slice(0, limit)
      .map((entry) => entry.user);

    return {
      users: ranked,
      error: null,
    };
  }

  async function searchHashtags(query, options) {
    const client = getClientOrThrow();
    const safeQuery = normalizeHashtagQuery(query);
    const limit = clampLimit(options && options.limit, 8, 20);
    const candidatePoolSize = Math.min(60, limit * 5);

    if (!safeQuery) {
      return { hashtags: [], error: null };
    }

    const result = await client
      .from(HASHTAGS_TABLE)
      .select("id, tag")
      .ilike("tag", `%${safeQuery}%`)
      .limit(candidatePoolSize);

    if (result.error) {
      return { hashtags: [], error: result.error };
    }

    const candidates = result.data || [];
    const candidateIds = candidates.map((hashtag) => hashtag.id).filter(Boolean);
    const takeCounts = await fetchHashtagTakeCounts(candidateIds);
    const countsById = takeCounts.countsById;

    const ranked = candidates
      .map((hashtag) => ({
        hashtag,
        relevance: matchRelevance(hashtag.tag, safeQuery),
        takeCount: countsById.get(hashtag.id) || 0,
      }))
      .sort((left, right) => {
        if (right.relevance !== left.relevance) return right.relevance - left.relevance;
        if (right.takeCount !== left.takeCount) return right.takeCount - left.takeCount;
        return String(left.hashtag.tag || "").localeCompare(String(right.hashtag.tag || ""));
      })
      .slice(0, limit)
      .map((entry) => entry.hashtag);

    return {
      hashtags: ranked,
      error: null,
    };
  }

  async function searchTakePreviews(query, options) {
    const client = getClientOrThrow();
    const safeQuery = normalizeQuery(query);
    const limit = clampLimit(options && options.limit, 3, 10);

    if (!safeQuery) {
      return { takes: [], error: null };
    }

    const result = await client
      .from(TAKES_TABLE)
      .select("id, user_id, content, image_url, created_at")
      .ilike("content", `%${safeQuery}%`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (result.error) {
      return { takes: [], error: result.error };
    }

    const rows = result.data || [];
    const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
    const profilesResult = await fetchProfilesByIds(userIds);
    if (profilesResult.error) {
      return { takes: [], error: profilesResult.error };
    }

    const profileMap = new Map((profilesResult.profiles || []).map((profile) => [profile.id, profile]));
    return {
      takes: rows.map((row) => ({
        ...row,
        profile: profileMap.get(row.user_id) || null,
      })),
      error: null,
    };
  }

  async function searchAll(query, options) {
    const safeQuery = normalizeQuery(query);
    const currentUserId = options && options.currentUserId ? options.currentUserId : "";
    const takeLimit = clampLimit(options && options.takeLimit, 10, 20);
    const userLimit = clampLimit(options && options.userLimit, 8, 20);
    const hashtagLimit = clampLimit(options && options.hashtagLimit, 8, 20);

    if (!safeQuery) {
      return {
        query: "",
        takes: [],
        users: [],
        hashtags: [],
        nextCursor: null,
        hasMoreTakes: false,
        error: null,
      };
    }

    const cacheKey = `${safeQuery.toLowerCase()}|${currentUserId}|${takeLimit}|${userLimit}|${hashtagLimit}`;
    const cached = getCached(cacheStore.results, cacheKey, RESULTS_CACHE_TTL_MS);
    if (cached) {
      return cached;
    }

    const [takesResult, usersResult, hashtagsResult] = await Promise.all([
      window.ClashlyTakes.searchTakes(safeQuery, {
        limit: takeLimit,
        currentUserId,
        cursor: options && options.cursor ? options.cursor : null,
      }),
      searchUsers(safeQuery, {
        limit: userLimit,
      }),
      searchHashtags(safeQuery, {
        limit: hashtagLimit,
      }),
    ]);

    const error = takesResult.error || usersResult.error || hashtagsResult.error || null;
    const payload = {
      query: safeQuery,
      takes: takesResult.takes || [],
      users: usersResult.users || [],
      hashtags: hashtagsResult.hashtags || [],
      nextCursor: takesResult.nextCursor || null,
      hasMoreTakes: Boolean(takesResult.hasMore),
      error,
    };

    if (!error && !(options && options.cursor)) {
      setCached(cacheStore.results, cacheKey, payload);
    }

    return payload;
  }

  async function fetchSuggestions(query, options) {
    const safeQuery = normalizeQuery(query);
    if (safeQuery.length < 2) {
      return {
        query: safeQuery,
        takes: [],
        users: [],
        hashtags: [],
        error: null,
      };
    }

    const currentUserId = options && options.currentUserId ? options.currentUserId : "";
    const takeLimit = clampLimit(options && options.takeLimit, 3, 6);
    const userLimit = clampLimit(options && options.userLimit, 4, 8);
    const hashtagLimit = clampLimit(options && options.hashtagLimit, 4, 8);
    const cacheKey = `${safeQuery.toLowerCase()}|${currentUserId}|${takeLimit}|${userLimit}|${hashtagLimit}`;
    const cached = getCached(cacheStore.suggestions, cacheKey, SUGGESTIONS_CACHE_TTL_MS);
    if (cached) {
      return cached;
    }

    const [usersResult, hashtagsResult, takesResult] = await Promise.all([
      searchUsers(safeQuery, { limit: userLimit }),
      searchHashtags(safeQuery, { limit: hashtagLimit }),
      searchTakePreviews(safeQuery, { limit: takeLimit }),
    ]);

    const error = usersResult.error || hashtagsResult.error || takesResult.error || null;
    const payload = {
      query: safeQuery,
      takes: takesResult.takes || [],
      users: usersResult.users || [],
      hashtags: hashtagsResult.hashtags || [],
      error,
    };

    if (!error) {
      setCached(cacheStore.suggestions, cacheKey, payload);
    }

    return payload;
  }

  function buildTrendingMeta(windowHours, recentTakeLimit) {
    return {
      windowHours,
      recentTakeLimit,
      ranking:
        "Trending topics are ranked from hashtagged takes created inside the recent time window, weighted by recent tagged-take count, vote engagement, and latest activity recency.",
    };
  }

  function calculateFreshnessWeight(createdAt, windowHours) {
    if (!createdAt) return 0;
    const ageHours = (Date.now() - new Date(createdAt).getTime()) / 36e5;
    if (ageHours <= 0) return 1.15;
    if (ageHours >= windowHours) return 0;
    return 0.35 + (1 - ageHours / windowHours) * 0.85;
  }

  async function fetchTrendingTopics(options) {
    const client = getClientOrThrow();
    const limit = clampLimit(options && options.limit, 6, 20);
    const windowHours = clampLimit(options && options.windowHours, 168, 720);
    const recentTakeLimit = clampLimit(options && options.recentTakeLimit, 250, 1500);
    const meta = buildTrendingMeta(windowHours, recentTakeLimit);
    const cacheKey = `${limit}|${windowHours}|${recentTakeLimit}`;
    const cached = getCached(cacheStore.trending, cacheKey, TRENDING_CACHE_TTL_MS);
    if (cached) {
      return cached;
    }

    const rpcResult = await client.rpc("get_trending_topics", {
      p_limit: limit,
      p_window_hours: windowHours,
      p_recent_take_limit: recentTakeLimit,
    });

    if (!rpcResult.error && Array.isArray(rpcResult.data) && rpcResult.data.length > 0) {
      const payload = {
        topics: rpcResult.data.map((row) => ({
          tag: row.tag || row.keyword,
          keyword: row.keyword || row.tag,
          category: row.category || "Debate",
          takeCount: Number(row.take_count || 0),
          engagementCount: Number(row.engagement_count || 0),
          latestAt: row.latest_at || "",
          score: Number(row.score || 0),
        })),
        error: null,
        meta,
      };
      setCached(cacheStore.trending, cacheKey, payload);
      return payload;
    }

    const cutoffIso = new Date(Date.now() - windowHours * 36e5).toISOString();
    let recentTakesResult = await client
      .from(TAKES_TABLE)
      .select("id, created_at")
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .limit(recentTakeLimit);

    if (recentTakesResult.error || !recentTakesResult.data || !recentTakesResult.data.length) {
      recentTakesResult = await client
        .from(TAKES_TABLE)
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(recentTakeLimit);
    }

    if (recentTakesResult.error) {
      return { topics: [], error: recentTakesResult.error, meta };
    }

    const recentTakes = recentTakesResult.data || [];
    if (!recentTakes.length) {
      return { topics: [], error: null, meta };
    }

    const takeIds = recentTakes.map((take) => take.id);
    const [takeHashtagsResult, votesResult] = await Promise.all([
      client.from(TAKE_HASHTAGS_TABLE).select("take_id, hashtag_id").in("take_id", takeIds),
      client.from(VOTES_TABLE).select("take_id").in("take_id", takeIds),
    ]);

    if (takeHashtagsResult.error) {
      return { topics: [], error: takeHashtagsResult.error, meta };
    }

    const takeHashtags = takeHashtagsResult.data || [];
    if (!takeHashtags.length) {
      return { topics: [], error: null, meta };
    }

    const hashtagIds = Array.from(new Set(takeHashtags.map((entry) => entry.hashtag_id).filter(Boolean)));
    if (!hashtagIds.length) {
      return { topics: [], error: null, meta };
    }

    const hashtagsResult = await client.from(HASHTAGS_TABLE).select("id, tag").in("id", hashtagIds);
    if (hashtagsResult.error) {
      return { topics: [], error: hashtagsResult.error, meta };
    }

    const hashtagsById = new Map((hashtagsResult.data || []).map((hashtag) => [hashtag.id, hashtag]));
    const takesById = new Map(recentTakes.map((take) => [take.id, take]));
    const voteCountsByTakeId = new Map();

    if (!votesResult.error) {
      (votesResult.data || []).forEach((vote) => {
        voteCountsByTakeId.set(vote.take_id, (voteCountsByTakeId.get(vote.take_id) || 0) + 1);
      });
    }

    const topicMap = new Map();

    takeHashtags.forEach((entry) => {
      const hashtag = hashtagsById.get(entry.hashtag_id);
      const take = takesById.get(entry.take_id);
      if (!hashtag || !take) return;

      let topic = topicMap.get(hashtag.id);
      if (!topic) {
        topic = {
          id: hashtag.id,
          tag: hashtag.tag,
          takeIds: new Set(),
          takeCount: 0,
          engagementCount: 0,
          latestAt: "",
          score: 0,
        };
        topicMap.set(hashtag.id, topic);
      }

      if (topic.takeIds.has(take.id)) return;
      const voteCount = voteCountsByTakeId.get(take.id) || 0;
      const freshnessWeight = calculateFreshnessWeight(take.created_at, windowHours);

      topic.takeIds.add(take.id);
      topic.takeCount += 1;
      topic.engagementCount += voteCount;
      if (!topic.latestAt || new Date(take.created_at).getTime() > new Date(topic.latestAt).getTime()) {
        topic.latestAt = take.created_at;
      }
      topic.score += freshnessWeight * (5 + voteCount * 0.65);
    });

    const topics = Array.from(topicMap.values())
      .map((topic) => ({
        id: topic.id,
        tag: topic.tag,
        keyword: topic.tag,
        category: "Trending",
        takeCount: topic.takeCount,
        engagementCount: topic.engagementCount,
        latestAt: topic.latestAt,
        score: Number(topic.score.toFixed(3)),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (right.takeCount !== left.takeCount) return right.takeCount - left.takeCount;
        if (right.engagementCount !== left.engagementCount) return right.engagementCount - left.engagementCount;
        return new Date(right.latestAt).getTime() - new Date(left.latestAt).getTime();
      })
      .slice(0, limit);

    const payload = {
      topics,
      error: null,
      meta,
    };
    setCached(cacheStore.trending, cacheKey, payload);
    return payload;
  }

  window.ClashlySearch = {
    normalizeQuery,
    normalizeHashtagQuery,
    searchUsers,
    searchHashtags,
    searchAll,
    fetchSuggestions,
    fetchTrendingTopics,
  };
})();
