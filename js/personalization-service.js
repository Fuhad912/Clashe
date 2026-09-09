(function () {
  const SIGNALS_TABLE = "user_interest_signals";
  const COMMENTS_TABLE = "comments";
  const VOTES_TABLE = "votes";
  const FOLLOWS_TABLE = "follows";
  const MAX_BUCKET_SIZE = 40;
  const MAX_SEARCH_TOKENS = 6;
  const MAX_FOLLOWED_USERS_FOR_SOCIAL_SIGNALS = 150;
  const FOR_YOU_WEIGHTS = {
    recencyWindowHours: 30,
    recencyDecayPerHour: 0.72,
    voteWeight: 0.32,
    commentWeight: 1.3,
    replyWeight: 1.55,
    exchangeWeight: 2.15,
    participantWeight: 0.8,
    recentCommentWeight: 0.95,
    controversyWeight: 2.4,
    mediaWeight: 0.7,
    categoryWeight: 2.1,
    hashtagWeight: 1.45,
    authorWeight: 1.15,
    searchWeight: 0.72,
    bookmarkWeight: 2.2,
    followedAuthorWeight: 3.2,
    followedVoteWeight: 0.95,
    followedCommentWeight: 1.1,
    followedExchangeWeight: 1.5,
    engagementShelfLifeWeight: 0.42,
    discussionReasonThreshold: 5.5,
    personalizationSoftCap: 14,
    debateInactiveVotesMax: 3,
    debateInactiveCommentsMax: 1,
    debateUnsettledMinVotes: 6,
    debateUnsettledMinComments: 3,
    debateUnsettledClosenessThreshold: 0.72,
    debateSettledClosenessThreshold: 0.38,
    debateUnsettledBoost: 3.4,
    debateOngoingWeight: 0.24,
    earlyDebateMinComments: 2,
    earlyDebateMaxComments: 10,
    earlyDebateMaxVotes: 18,
    earlyDebateMaxAgeHours: 30,
    earlyDebateBoost: 1.85,
  };
  const STOPWORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "your",
    "about",
    "into",
    "just",
    "have",
    "will",
    "they",
    "them",
    "what",
    "when",
    "where",
    "were",
    "been",
    "than",
    "then",
    "also",
  ]);

  const stateCache = new Map();

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

  function createEmptyState() {
    return {
      categories: {},
      hashtags: {},
      searchTerms: {},
      authors: {},
      updatedAt: "",
    };
  }

  function pruneBucket(bucket) {
    return Object.fromEntries(
      Object.entries(bucket || {})
        .filter((entry) => Number(entry[1]) > 0)
        .sort((left, right) => Number(right[1]) - Number(left[1]))
        .slice(0, MAX_BUCKET_SIZE)
    );
  }

  function normalizeSignalKey(key) {
    return String(key || "").trim().toLowerCase();
  }

  function bump(bucket, key, amount) {
    const safeKey = normalizeSignalKey(key);
    if (!safeKey) return;
    bucket[safeKey] = Number(bucket[safeKey] || 0) + Number(amount || 0);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  function normalizeCount(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.floor(numeric);
  }

  function getTakeAgeHours(take) {
    const createdAt = take && take.created_at ? new Date(take.created_at).getTime() : 0;
    if (!createdAt || !Number.isFinite(createdAt)) return 999;
    return Math.max(0.15, (Date.now() - createdAt) / 36e5);
  }

  function getTakeHashtagKeys(take) {
    return (take && Array.isArray(take.hashtags) ? take.hashtags : [])
      .map((tag) => normalizeSignalKey(typeof tag === "string" ? tag : tag && tag.tag ? tag.tag : ""))
      .filter(Boolean);
  }

  function getTakeMediaKind(take) {
    const imageUrls =
      take && Array.isArray(take.image_urls) && take.image_urls.length
        ? take.image_urls
        : take && take.image_url
          ? [take.image_url]
          : [];
    return imageUrls.length ? "image" : "text";
  }

  function createEmptyDiscussionMetrics() {
    return {
      totalComments: 0,
      rootComments: 0,
      replyCount: 0,
      exchangeCount: 0,
      recentComments: 0,
      uniqueParticipants: 0,
      followedComments: 0,
      followedExchanges: 0,
    };
  }

  function getVoteCloseness(totalVotes, agreeVotes, disagreeVotes) {
    const safeTotalVotes = normalizeCount(totalVotes);
    if (!safeTotalVotes) return 0;
    return clamp(1 - Math.abs(normalizeCount(agreeVotes) - normalizeCount(disagreeVotes)) / safeTotalVotes, 0, 1);
  }

  function determineDebateState(take, discussionMetrics) {
    const vote = take && take.vote ? take.vote : {};
    const totalVotes = normalizeCount(vote.total_votes);
    const agreeVotes = normalizeCount(vote.agree_count);
    const disagreeVotes = normalizeCount(vote.disagree_count);
    const totalComments = Math.max(
      normalizeCount(take && take.comment_count),
      normalizeCount(discussionMetrics && discussionMetrics.totalComments)
    );
    const replyCount = normalizeCount(discussionMetrics && discussionMetrics.replyCount);
    const exchangeCount = normalizeCount(discussionMetrics && discussionMetrics.exchangeCount);
    const closeness = getVoteCloseness(totalVotes, agreeVotes, disagreeVotes);
    const ongoingDiscussion = totalComments >= 3 || replyCount >= 2 || exchangeCount >= 1;

    if (
      totalVotes <= FOR_YOU_WEIGHTS.debateInactiveVotesMax &&
      totalComments <= FOR_YOU_WEIGHTS.debateInactiveCommentsMax &&
      replyCount === 0 &&
      exchangeCount === 0
    ) {
      return "inactive";
    }

    if (
      totalVotes >= FOR_YOU_WEIGHTS.debateUnsettledMinVotes &&
      totalComments >= FOR_YOU_WEIGHTS.debateUnsettledMinComments &&
      ongoingDiscussion &&
      closeness >= FOR_YOU_WEIGHTS.debateUnsettledClosenessThreshold
    ) {
      return "unsettled";
    }

    if (
      totalVotes >= FOR_YOU_WEIGHTS.debateUnsettledMinVotes &&
      totalComments >= 2 &&
      closeness <= FOR_YOU_WEIGHTS.debateSettledClosenessThreshold
    ) {
      return "settled";
    }

    return ongoingDiscussion ? "active" : "inactive";
  }

  function getDebateBoosts(take, discussionMetrics) {
    const vote = take && take.vote ? take.vote : {};
    const totalVotes = normalizeCount(vote.total_votes);
    const agreeVotes = normalizeCount(vote.agree_count);
    const disagreeVotes = normalizeCount(vote.disagree_count);
    const totalComments = Math.max(
      normalizeCount(take && take.comment_count),
      normalizeCount(discussionMetrics && discussionMetrics.totalComments)
    );
    const replyCount = normalizeCount(discussionMetrics && discussionMetrics.replyCount);
    const exchangeCount = normalizeCount(discussionMetrics && discussionMetrics.exchangeCount);
    const recentComments = normalizeCount(discussionMetrics && discussionMetrics.recentComments);
    const closeness = getVoteCloseness(totalVotes, agreeVotes, disagreeVotes);
    const ageHours = getTakeAgeHours(take);
    const debateState = determineDebateState(take, discussionMetrics);

    let unsettledBoost = 0;
    if (debateState === "unsettled") {
      unsettledBoost =
        FOR_YOU_WEIGHTS.debateUnsettledBoost * closeness +
        Math.min(replyCount + exchangeCount + recentComments, 9) * FOR_YOU_WEIGHTS.debateOngoingWeight;
    }

    let earlyDebateBoost = 0;
    const isEarlyDebate =
      totalComments >= FOR_YOU_WEIGHTS.earlyDebateMinComments &&
      totalComments <= FOR_YOU_WEIGHTS.earlyDebateMaxComments &&
      totalVotes <= FOR_YOU_WEIGHTS.earlyDebateMaxVotes &&
      ageHours <= FOR_YOU_WEIGHTS.earlyDebateMaxAgeHours;
    if (isEarlyDebate) {
      earlyDebateBoost =
        FOR_YOU_WEIGHTS.earlyDebateBoost *
        (0.55 + closeness * 0.45) *
        (1 + Math.min(replyCount + exchangeCount, 5) * 0.08);
    }

    return {
      debateState,
      unsettledBoost,
      earlyDebateBoost,
    };
  }

  function createEmptyRankingContext(takes) {
    const takeIds = Array.isArray(takes) ? takes.map((take) => String(take && take.id || "")).filter(Boolean) : [];
    return {
      followedAuthorIds: new Set(),
      followedVoteCountByTakeId: new Map(takeIds.map((takeId) => [takeId, 0])),
      discussionByTakeId: new Map(takeIds.map((takeId) => [takeId, createEmptyDiscussionMetrics()])),
    };
  }

  function normalizeTokens(input) {
    return Array.from(
      new Set(
        String(input || "")
          .toLowerCase()
          .match(/[a-z0-9_#]+/g) || []
      )
    )
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .filter((token) => !STOPWORDS.has(token))
      .slice(0, MAX_SEARCH_TOKENS);
  }

  function setCachedState(userId, state) {
    stateCache.set(userId, {
      categories: pruneBucket(state.categories),
      hashtags: pruneBucket(state.hashtags),
      searchTerms: pruneBucket(state.searchTerms),
      authors: pruneBucket(state.authors),
      updatedAt: state.updatedAt || new Date().toISOString(),
    });
  }

  function getCachedState(userId) {
    return stateCache.get(userId) || createEmptyState();
  }

  function mapRowsToState(rows) {
    const state = createEmptyState();

    (rows || []).forEach((row) => {
      const type = String(row.signal_type || "");
      const key = normalizeSignalKey(row.signal_key);
      const score = Number(row.score || 0);
      if (!key || !score) return;

      if (type === "category") state.categories[key] = score;
      if (type === "hashtag") state.hashtags[key] = score;
      if (type === "search") state.searchTerms[key] = score;
      if (type === "author") state.authors[key] = score;

      if (!state.updatedAt || new Date(row.updated_at).getTime() > new Date(state.updatedAt).getTime()) {
        state.updatedAt = row.updated_at;
      }
    });

    return {
      categories: pruneBucket(state.categories),
      hashtags: pruneBucket(state.hashtags),
      searchTerms: pruneBucket(state.searchTerms),
      authors: pruneBucket(state.authors),
      updatedAt: state.updatedAt,
    };
  }

  async function hydrateUserState(userId, options) {
    if (!userId) {
      return createEmptyState();
    }

    if (!options || !options.refresh) {
      const cached = stateCache.get(userId);
      if (cached) return cached;
    }

    try {
      const client = getClientOrThrow();
      const result = await client
        .from(SIGNALS_TABLE)
        .select("signal_type, signal_key, score, updated_at")
        .eq("user_id", userId)
        .order("score", { ascending: false })
        .limit(200);

      if (result.error) {
        throw result.error;
      }

      const state = mapRowsToState(result.data || []);
      setCachedState(userId, state);
      return getCachedState(userId);
    } catch (error) {
      console.error("[Clashe] Personalization hydrate failed", error);
      const emptyState = createEmptyState();
      setCachedState(userId, emptyState);
      return emptyState;
    }
  }

  function collectTakeSignals(take, action) {
    const signalMap = {
      categories: {},
      hashtags: {},
      searchTerms: {},
      authors: {},
    };

    const weightMap = {
      vote: 5,
      bookmark: 6,
      comment: 4,
      open: 2,
    };

    const amount = weightMap[action] || 1;

    if (take.user_id) {
      bump(signalMap.authors, take.user_id, amount * 0.45);
    }

    if (take.category && take.category.slug) {
      bump(signalMap.categories, take.category.slug, amount * 1.2);
    }

    (take.hashtags || []).forEach((tag) => {
      const normalized = typeof tag === "string" ? tag : tag && tag.tag ? tag.tag : "";
      if (normalized) {
        bump(signalMap.hashtags, normalized, amount);
      }
    });

    normalizeTokens(take.content || "")
      .slice(0, 5)
      .forEach((token) => bump(signalMap.searchTerms, token, amount * 0.22));

    return signalMap;
  }

  function flattenSignalMap(signalMap) {
    const rows = [];
    const pairs = [
      ["category", signalMap.categories || {}],
      ["hashtag", signalMap.hashtags || {}],
      ["search", signalMap.searchTerms || {}],
      ["author", signalMap.authors || {}],
    ];

    pairs.forEach(([signalType, bucket]) => {
      Object.entries(bucket).forEach(([signalKey, score]) => {
        if (!signalKey || !score) return;
        rows.push({ signalType, signalKey, score: Number(score) });
      });
    });

    return rows;
  }

  async function writeSignalMap(userId, signalMap) {
    if (!userId) return;

    const deltaRows = flattenSignalMap(signalMap);
    if (!deltaRows.length) return;

    try {
      const client = getClientOrThrow();
      const existingState = await hydrateUserState(userId);
      const currentByComposite = new Map();

      Object.entries(existingState.categories).forEach(([key, score]) => currentByComposite.set(`category:${key}`, score));
      Object.entries(existingState.hashtags).forEach(([key, score]) => currentByComposite.set(`hashtag:${key}`, score));
      Object.entries(existingState.searchTerms).forEach(([key, score]) => currentByComposite.set(`search:${key}`, score));
      Object.entries(existingState.authors).forEach(([key, score]) => currentByComposite.set(`author:${key}`, score));

      const nowIso = new Date().toISOString();
      const payload = deltaRows.map((row) => ({
        user_id: userId,
        signal_type: row.signalType,
        signal_key: row.signalKey,
        score: Number(currentByComposite.get(`${row.signalType}:${row.signalKey}`) || 0) + Number(row.score || 0),
        updated_at: nowIso,
      }));

      const result = await client.from(SIGNALS_TABLE).upsert(payload, {
        onConflict: "user_id,signal_type,signal_key",
      });

      if (result.error) {
        throw result.error;
      }

      const nextState = {
        categories: { ...existingState.categories },
        hashtags: { ...existingState.hashtags },
        searchTerms: { ...existingState.searchTerms },
        authors: { ...existingState.authors },
        updatedAt: nowIso,
      };

      payload.forEach((row) => {
        if (row.signal_type === "category") nextState.categories[row.signal_key] = Number(row.score);
        if (row.signal_type === "hashtag") nextState.hashtags[row.signal_key] = Number(row.score);
        if (row.signal_type === "search") nextState.searchTerms[row.signal_key] = Number(row.score);
        if (row.signal_type === "author") nextState.authors[row.signal_key] = Number(row.score);
      });

      setCachedState(userId, nextState);
    } catch (error) {
      console.error("[Clashe] Personalization write failed", error);
    }
  }

  async function recordSearch(userId, query) {
    if (!userId || !query) return;

    const signalMap = {
      categories: {},
      hashtags: {},
      searchTerms: {},
      authors: {},
    };

    normalizeTokens(query).forEach((token) => {
      if (token.startsWith("#")) {
        bump(signalMap.hashtags, token.replace(/^#/, ""), 3);
      } else {
        bump(signalMap.searchTerms, token, 2);
      }
    });

    await writeSignalMap(userId, signalMap);
  }

  async function recordHashtagVisit(userId, tag) {
    if (!userId || !tag) return;

    await writeSignalMap(userId, {
      categories: {},
      hashtags: { [normalizeSignalKey(String(tag || "").replace(/^#/, ""))]: 4 },
      searchTerms: {},
      authors: {},
    });
  }

  async function recordCategoryVisit(userId, categorySlug) {
    if (!userId || !categorySlug) return;

    await writeSignalMap(userId, {
      categories: { [normalizeSignalKey(categorySlug)]: 5 },
      hashtags: {},
      searchTerms: {},
      authors: {},
    });
  }

  async function recordTakeEngagement(userId, take, action) {
    if (!userId || !take) return;
    await writeSignalMap(userId, collectTakeSignals(take, action));
  }

  function getTopInterests(userId) {
    const state = getCachedState(userId);
    return {
      categories: Object.entries(state.categories)
        .sort((left, right) => Number(right[1]) - Number(left[1]))
        .slice(0, 3)
        .map(([slug]) => slug),
      hashtags: Object.entries(state.hashtags)
        .sort((left, right) => Number(right[1]) - Number(left[1]))
        .slice(0, 4)
        .map(([tag]) => tag),
      authors: Object.entries(state.authors)
        .sort((left, right) => Number(right[1]) - Number(left[1]))
        .slice(0, 3)
        .map(([authorId]) => authorId),
      searchTerms: Object.entries(state.searchTerms)
        .sort((left, right) => Number(right[1]) - Number(left[1]))
        .slice(0, 4)
        .map(([term]) => term),
    };
  }

  function getSignalSummary(userId) {
    const state = getCachedState(userId);
    const totalSignals =
      Object.keys(state.categories).length +
      Object.keys(state.hashtags).length +
      Object.keys(state.searchTerms).length +
      Object.keys(state.authors).length;

    return {
      hasSignals: totalSignals > 0,
      totalSignals,
      topInterests: getTopInterests(userId),
    };
  }

  async function fetchRankingContext(userId, takes) {
    const safeTakes = Array.isArray(takes) ? takes : [];
    const context = createEmptyRankingContext(safeTakes);
    const takeIds = safeTakes.map((take) => String(take && take.id || "")).filter(Boolean);
    if (!takeIds.length) return context;

    try {
      const client = getClientOrThrow();
      const commentsPromise = client
        .from(COMMENTS_TABLE)
        .select("id, take_id, user_id, parent_id, created_at")
        .in("take_id", takeIds);

      let followedUserIds = [];
      if (userId) {
        const followsResult = await client
          .from(FOLLOWS_TABLE)
          .select("following_id")
          .eq("follower_id", userId)
          .limit(MAX_FOLLOWED_USERS_FOR_SOCIAL_SIGNALS);

        if (followsResult.error) {
          throw followsResult.error;
        }

        followedUserIds = [...new Set((followsResult.data || []).map((row) => row.following_id).filter(Boolean))];
        context.followedAuthorIds = new Set(followedUserIds);
      }

      const followedVotesPromise =
        followedUserIds.length > 0
          ? client
              .from(VOTES_TABLE)
              .select("take_id, user_id")
              .in("take_id", takeIds)
              .in("user_id", followedUserIds)
          : Promise.resolve({ data: [], error: null });

      const [commentsResult, followedVotesResult] = await Promise.all([commentsPromise, followedVotesPromise]);
      if (commentsResult.error) {
        throw commentsResult.error;
      }
      if (followedVotesResult.error) {
        throw followedVotesResult.error;
      }

      const followedUserIdSet = context.followedAuthorIds;
      const commentRows = commentsResult.data || [];
      const commentById = new Map(commentRows.filter((row) => row && row.id).map((row) => [row.id, row]));
      const participantSets = new Map();
      const recentCutoffMs = Date.now() - 18 * 36e5;

      takeIds.forEach((takeId) => {
        participantSets.set(takeId, new Set());
      });

      commentRows.forEach((row) => {
        const takeId = String(row && row.take_id || "");
        if (!takeId || !context.discussionByTakeId.has(takeId)) return;
        const metrics = context.discussionByTakeId.get(takeId) || createEmptyDiscussionMetrics();
        metrics.totalComments += 1;
        if (row.parent_id) {
          metrics.replyCount += 1;
        } else {
          metrics.rootComments += 1;
        }

        if (row.user_id) {
          participantSets.get(takeId).add(row.user_id);
          if (followedUserIdSet.has(row.user_id)) {
            metrics.followedComments += 1;
          }
        }

        const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : 0;
        if (createdAtMs && Number.isFinite(createdAtMs) && createdAtMs >= recentCutoffMs) {
          metrics.recentComments += 1;
        }
      });

      commentRows.forEach((row) => {
        const takeId = String(row && row.take_id || "");
        if (!takeId || !row.parent_id || !context.discussionByTakeId.has(takeId)) return;
        const parent = commentById.get(row.parent_id);
        if (!parent || parent.take_id !== row.take_id) return;
        if (!parent.user_id || !row.user_id || parent.user_id === row.user_id) return;

        const metrics = context.discussionByTakeId.get(takeId) || createEmptyDiscussionMetrics();
        metrics.exchangeCount += 1;
        if (followedUserIdSet.has(row.user_id) || followedUserIdSet.has(parent.user_id)) {
          metrics.followedExchanges += 1;
        }
      });

      context.discussionByTakeId.forEach((metrics, takeId) => {
        metrics.uniqueParticipants = Number((participantSets.get(takeId) || new Set()).size);
      });

      (followedVotesResult.data || []).forEach((row) => {
        const takeId = String(row && row.take_id || "");
        if (!takeId || !context.followedVoteCountByTakeId.has(takeId)) return;
        context.followedVoteCountByTakeId.set(
          takeId,
          Number(context.followedVoteCountByTakeId.get(takeId) || 0) + 1
        );
      });
    } catch (error) {
      console.error("[Clashe] For You ranking context failed", error);
    }

    return context;
  }

  function formatReasonLabel(kind, value, take) {
    if (kind === "fresh") {
      return "Fresh on your feed";
    }
    if (kind === "following") {
      return "From someone you follow";
    }
    if (kind === "social") {
      return "People you follow are in this debate";
    }
    if (kind === "discussion") {
      return "Active debate right now";
    }
    if (kind === "unsettled") {
      return "Debate is still unresolved";
    }
    if (kind === "early-debate") {
      return "Discussion is just taking off";
    }
    if (!value) return "";
    if (kind === "author") {
      const username = take && take.profile && take.profile.username ? `@${take.profile.username}` : "this creator";
      return `You engage with ${username}`;
    }
    if (kind === "category") {
      const categoryName = take && take.category && take.category.name ? take.category.name : value;
      return `More from ${categoryName}`;
    }
    if (kind === "hashtag") {
      return `Because of #${String(value).replace(/^#/, "")}`;
    }
    if (kind === "search") {
      return `Matches "${value}"`;
    }
    return String(value);
  }

  function buildTakeReason(take, state, rankingContext) {
    if (!take) return null;
    const discussionMetrics =
      rankingContext && rankingContext.discussionByTakeId
        ? rankingContext.discussionByTakeId.get(String(take.id || "")) || createEmptyDiscussionMetrics()
        : createEmptyDiscussionMetrics();
    const followedVoteCount =
      rankingContext && rankingContext.followedVoteCountByTakeId
        ? Number(rankingContext.followedVoteCountByTakeId.get(String(take.id || "")) || 0)
        : 0;
    const debateBoosts = getDebateBoosts(take, discussionMetrics);

    if (rankingContext && rankingContext.followedAuthorIds && rankingContext.followedAuthorIds.has(take.user_id)) {
      return {
        kind: "following",
        label: formatReasonLabel("following", "", take),
      };
    }

    if (followedVoteCount > 0 || discussionMetrics.followedComments > 0) {
      return {
        kind: "social",
        label: formatReasonLabel("social", "", take),
      };
    }

    if (debateBoosts.debateState === "unsettled" && debateBoosts.unsettledBoost > 0) {
      return {
        kind: "unsettled",
        label: formatReasonLabel("unsettled", "", take),
      };
    }

    if (debateBoosts.earlyDebateBoost > 0) {
      return {
        kind: "early-debate",
        label: formatReasonLabel("early-debate", "", take),
      };
    }

    let bestKind = "";
    let bestValue = "";
    let bestWeight = 0;

    if (take.user_id) {
      const authorWeight = Number(state.authors[take.user_id] || 0);
      if (authorWeight > bestWeight) {
        bestKind = "author";
        bestValue = take.user_id;
        bestWeight = authorWeight;
      }
    }

    if (take.category && take.category.slug) {
      const categoryKey = normalizeSignalKey(take.category.slug);
      const categoryWeight = Number(state.categories[categoryKey] || 0);
      if (categoryWeight > bestWeight) {
        bestKind = "category";
        bestValue = categoryKey;
        bestWeight = categoryWeight;
      }
    }

    (take.hashtags || []).forEach((tag) => {
      const normalized = normalizeSignalKey(typeof tag === "string" ? tag : tag && tag.tag ? tag.tag : "");
      const hashtagWeight = Number(state.hashtags[normalized] || 0);
      if (hashtagWeight > bestWeight) {
        bestKind = "hashtag";
        bestValue = normalized;
        bestWeight = hashtagWeight;
      }
    });

    const content = String(take.content || "").toLowerCase();
    Object.entries(state.searchTerms).forEach(([token, weight]) => {
      if (token && content.includes(token) && Number(weight) > bestWeight) {
        bestKind = "search";
        bestValue = token;
        bestWeight = Number(weight);
      }
    });

    if (!bestKind) {
      const discussionScore =
        discussionMetrics.replyCount * FOR_YOU_WEIGHTS.replyWeight +
        discussionMetrics.exchangeCount * FOR_YOU_WEIGHTS.exchangeWeight +
        discussionMetrics.recentComments * FOR_YOU_WEIGHTS.recentCommentWeight;
      if (discussionScore >= FOR_YOU_WEIGHTS.discussionReasonThreshold) {
        return {
          kind: "discussion",
          label: formatReasonLabel("discussion", "", take),
        };
      }

      return {
        kind: "fresh",
        label: formatReasonLabel("fresh", "", take),
      };
    }

    return {
      kind: bestKind,
      value: bestValue,
      label: formatReasonLabel(bestKind, bestValue, take),
    };
  }

  function diversifyRankedTakes(takes) {
    const pool = Array.isArray(takes) ? takes.slice() : [];
    const ranked = [];

    while (pool.length) {
      let bestIndex = 0;
      let bestScore = -Infinity;

      pool.forEach((take, index) => {
        const recentWindow = ranked.slice(-3);
        const categoryKey = take && take.category && take.category.slug ? take.category.slug : "";
        const mediaKind = getTakeMediaKind(take);
        const primaryHashtag = getTakeHashtagKeys(take)[0] || "";
        let diversityPenalty = index * 0.015;

        recentWindow.forEach((recentTake, windowIndex) => {
          const distanceFactor = 1 / (windowIndex + 1);
          const recentCategoryKey =
            recentTake && recentTake.category && recentTake.category.slug ? recentTake.category.slug : "";
          const recentPrimaryHashtag = getTakeHashtagKeys(recentTake)[0] || "";

          if (recentTake && recentTake.user_id && recentTake.user_id === take.user_id) {
            diversityPenalty += 6.2 * distanceFactor;
          }
          if (categoryKey && recentCategoryKey && categoryKey === recentCategoryKey) {
            diversityPenalty += 3.4 * distanceFactor;
          }
          if (primaryHashtag && recentPrimaryHashtag && primaryHashtag === recentPrimaryHashtag) {
            diversityPenalty += 2.5 * distanceFactor;
          }
          if (getTakeMediaKind(recentTake) === mediaKind) {
            diversityPenalty += 1.1 * distanceFactor;
          }
        });

        const adjustedScore = Number(take.for_you_score || 0) - diversityPenalty;
        if (adjustedScore > bestScore) {
          bestScore = adjustedScore;
          bestIndex = index;
        }
      });

      const [chosen] = pool.splice(bestIndex, 1);
      ranked.push(chosen);
    }

    return ranked;
  }

  function buildFeedSummary(userId, rankedTakes) {
    const summary = getSignalSummary(userId);
    const topInterests = summary.topInterests || { categories: [], hashtags: [], authors: [], searchTerms: [] };
    const reasonChips = [
      ...topInterests.categories.slice(0, 2).map((slug) => ({ kind: "category", label: slug })),
      ...topInterests.hashtags.slice(0, 3).map((tag) => ({ kind: "hashtag", label: `#${tag}` })),
    ].slice(0, 4);

    const leadReason =
      rankedTakes && rankedTakes[0] && rankedTakes[0].for_you_reason && rankedTakes[0].for_you_reason.label
        ? rankedTakes[0].for_you_reason.label
        : "";

    return {
      ...summary,
      reasonChips,
      headline: summary.hasSignals ? "Your mix is learning from how you move." : "Your For you feed starts simple and sharp.",
      supporting: summary.hasSignals
        ? leadReason || "Recent votes, saves, searches, and topic trails are shaping this feed."
        : leadReason || "Fresh posts and active debates are steering this feed right now.",
    };
  }

  function scoreTake(take, state, rankingContext, signalSummary) {
    const vote = take.vote || {};
    const totalVotes = normalizeCount(vote.total_votes);
    const agreeVotes = normalizeCount(vote.agree_count);
    const disagreeVotes = normalizeCount(vote.disagree_count);
    const ageHours = getTakeAgeHours(take);
    const takeId = String(take && take.id || "");
    const discussionMetrics =
      rankingContext && rankingContext.discussionByTakeId
        ? rankingContext.discussionByTakeId.get(takeId) || createEmptyDiscussionMetrics()
        : createEmptyDiscussionMetrics();
    const totalComments = Math.max(normalizeCount(take.comment_count), normalizeCount(discussionMetrics.totalComments));
    const controversyScore = totalVotes > 1 ? 1 - Math.abs(agreeVotes - disagreeVotes) / totalVotes : 0;
    const debateBoosts = getDebateBoosts(take, discussionMetrics);
    const engagementScore =
      Math.min(totalVotes, 45) * FOR_YOU_WEIGHTS.voteWeight +
      Math.min(totalComments, 22) * FOR_YOU_WEIGHTS.commentWeight +
      Math.min(discussionMetrics.replyCount, 16) * FOR_YOU_WEIGHTS.replyWeight +
      Math.min(discussionMetrics.exchangeCount, 10) * FOR_YOU_WEIGHTS.exchangeWeight +
      Math.min(discussionMetrics.uniqueParticipants, 10) * FOR_YOU_WEIGHTS.participantWeight +
      Math.min(discussionMetrics.recentComments, 10) * FOR_YOU_WEIGHTS.recentCommentWeight +
      controversyScore * FOR_YOU_WEIGHTS.controversyWeight;
    const recencyScore = Math.max(0, FOR_YOU_WEIGHTS.recencyWindowHours - ageHours) * FOR_YOU_WEIGHTS.recencyDecayPerHour;
    let score =
      recencyScore +
      engagementScore +
      Math.min(engagementScore, 20) * Math.max(0, 1 - ageHours / 72) * FOR_YOU_WEIGHTS.engagementShelfLifeWeight +
      debateBoosts.unsettledBoost +
      debateBoosts.earlyDebateBoost;

    if (getTakeMediaKind(take) === "image") {
      score += FOR_YOU_WEIGHTS.mediaWeight;
    }

    const personalizationStrength =
      signalSummary && signalSummary.hasSignals
        ? clamp(signalSummary.totalSignals / FOR_YOU_WEIGHTS.personalizationSoftCap, 0.35, 1)
        : 0;

    if (take.category && take.category.slug) {
      score += Number(state.categories[normalizeSignalKey(take.category.slug)] || 0) * FOR_YOU_WEIGHTS.categoryWeight * personalizationStrength;
    }

    getTakeHashtagKeys(take).forEach((normalized) => {
      score += Number(state.hashtags[normalized] || 0) * FOR_YOU_WEIGHTS.hashtagWeight * personalizationStrength;
    });

    if (take.user_id) {
      score += Number(state.authors[take.user_id] || 0) * FOR_YOU_WEIGHTS.authorWeight * personalizationStrength;
    }

    const content = String(take.content || "").toLowerCase();
    Object.entries(state.searchTerms).forEach(([token, weight]) => {
      if (token && content.includes(token)) {
        score += Number(weight) * FOR_YOU_WEIGHTS.searchWeight * personalizationStrength;
      }
    });

    if (take.bookmarked) {
      score += FOR_YOU_WEIGHTS.bookmarkWeight;
    }

    if (rankingContext && rankingContext.followedAuthorIds && rankingContext.followedAuthorIds.has(take.user_id)) {
      score += FOR_YOU_WEIGHTS.followedAuthorWeight;
    }

    const followedVoteCount =
      rankingContext && rankingContext.followedVoteCountByTakeId
        ? Number(rankingContext.followedVoteCountByTakeId.get(takeId) || 0)
        : 0;
    score += followedVoteCount * FOR_YOU_WEIGHTS.followedVoteWeight;
    score += discussionMetrics.followedComments * FOR_YOU_WEIGHTS.followedCommentWeight;
    score += discussionMetrics.followedExchanges * FOR_YOU_WEIGHTS.followedExchangeWeight;

    return score;
  }

  // Every EXPLORE_SLOT_INTERVAL-th feed position is reserved for a post
  // outside the person's established interests — a different category and a
  // different author than their top signals — so the feed doesn't collapse
  // into a pure echo chamber of "more of what you already engage with".
  // Within that reserved slot we still pick the *best* eligible candidate
  // (by engagement) rather than a random one, so it's a real discovery pick,
  // not filler.
  const EXPLORE_SLOT_INTERVAL = 8;

  function isOutsideTopInterests(take, topInterests) {
    const topCategories = new Set((topInterests.categories || []).map((slug) => String(slug || "").toLowerCase()));
    const topAuthors = new Set(topInterests.authors || []);
    const categorySlug = take && take.category && take.category.slug ? String(take.category.slug).toLowerCase() : "";
    const authorId = take && take.user_id ? take.user_id : "";

    if (categorySlug && topCategories.has(categorySlug)) return false;
    if (authorId && topAuthors.has(authorId)) return false;
    return true;
  }

  function engagementScoreForExplore(take) {
    const vote = take.vote || {};
    return normalizeCount(vote.total_votes) + normalizeCount(take.comment_count) * 1.5;
  }

  function injectExploreSlots(rankedTakes, topInterests) {
    if (!topInterests || !topInterests.hasSignals) return rankedTakes;
    const hasAnyTopInterest = (topInterests.categories && topInterests.categories.length) || (topInterests.authors && topInterests.authors.length);
    if (!hasAnyTopInterest) return rankedTakes;

    const result = rankedTakes.slice();
    const usedIds = new Set();

    for (let position = EXPLORE_SLOT_INTERVAL - 1; position < result.length; position += EXPLORE_SLOT_INTERVAL) {
      // Candidates: everything ranked below this position that we haven't
      // already pulled forward for an earlier explore slot, and that sits
      // outside the person's top categories/authors.
      let bestIndex = -1;
      let bestScore = -Infinity;
      for (let i = position + 1; i < result.length; i += 1) {
        const candidate = result[i];
        const candidateId = String(candidate && candidate.id || "");
        if (usedIds.has(candidateId)) continue;
        if (!isOutsideTopInterests(candidate, topInterests)) continue;
        const score = engagementScoreForExplore(candidate);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      if (bestIndex === -1) continue;

      const [explorePick] = result.splice(bestIndex, 1);
      explorePick.for_you_is_explore = true;
      result.splice(position, 0, explorePick);
      usedIds.add(String(explorePick.id || ""));
    }

    return result;
  }

  async function rankForYou(takes, userId) {
    const safeTakes = Array.isArray(takes) ? takes.slice() : [];
    if (!safeTakes.length) {
      return {
        takes: [],
        meta: buildFeedSummary(userId, []),
      };
    }

    const [state, rankingContext] = await Promise.all([
      userId ? hydrateUserState(userId) : Promise.resolve(createEmptyState()),
      fetchRankingContext(userId, safeTakes),
    ]);
    const signalSummary = userId ? getSignalSummary(userId) : {
      hasSignals: false,
      totalSignals: 0,
      topInterests: { categories: [], hashtags: [], authors: [], searchTerms: [] },
    };

    const ranked = diversifyRankedTakes(
      safeTakes
      .map((take) => ({
        ...take,
        for_you_score: scoreTake(take, state, rankingContext, signalSummary),
        for_you_reason: buildTakeReason(take, state, rankingContext),
        for_you_debate_state: getDebateBoosts(
          take,
          rankingContext && rankingContext.discussionByTakeId
            ? rankingContext.discussionByTakeId.get(String(take && take.id || "")) || createEmptyDiscussionMetrics()
            : createEmptyDiscussionMetrics()
        ).debateState,
      }))
      .sort((left, right) => {
        const scoreDiff = Number(right.for_you_score || 0) - Number(left.for_you_score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      })
    );

    const withExplore = injectExploreSlots(ranked, signalSummary);

    return {
      takes: withExplore,
      meta: buildFeedSummary(userId, withExplore),
    };
  }

  window.ClashePersonalization = {
    SIGNALS_TABLE,
    hydrateUserState,
    recordSearch,
    recordHashtagVisit,
    recordCategoryVisit,
    recordTakeEngagement,
    getTopInterests,
    getSignalSummary,
    rankForYou,
  };
})();
