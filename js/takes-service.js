(function () {
  const TAKES_TABLE = "takes";
  const VOTES_TABLE = "votes";
  const FOLLOWS_TABLE = "follows";
  const BOOKMARKS_TABLE = "bookmarks";
  const HASHTAGS_TABLE = "hashtags";
  const TAKE_HASHTAGS_TABLE = "take_hashtags";
  const CATEGORIES_TABLE = "categories";
  const TAKE_CATEGORIES_TABLE = "take_categories";
  const TAKE_IMAGES_BUCKET = "take-images";
  const MAX_CONTENT_LENGTH = 180;
  const MAX_HASHTAGS_PER_TAKE = 3;
  const MAX_IMAGES_PER_TAKE = 2;
  const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
  const MIN_CONTROVERSIAL_VOTES = 6;
  const DEFAULT_PAGE_SIZE = 15;
  const MAX_PAGE_SIZE = 30;

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

  function sanitizeContent(content) {
    return String(content || "").trim();
  }

  function validateTakeContent(content) {
    const safeContent = sanitizeContent(content);
    if (!safeContent) {
      return "Take content is required.";
    }

    if (safeContent.length > MAX_CONTENT_LENGTH) {
      return `Take content must be ${MAX_CONTENT_LENGTH} characters or fewer.`;
    }

    const hashtagError = validateHashtags(safeContent);
    if (hashtagError) {
      return hashtagError;
    }

    return "";
  }

  function normalizeHashtag(tag) {
    return String(tag || "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
  }

  function normalizeCategorySlug(slug) {
    return String(slug || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  }

  function extractHashtags(content) {
    const matches = String(content || "").match(/#[a-z0-9_]+/gi) || [];
    const uniqueTags = [];

    matches.forEach((match) => {
      const normalized = normalizeHashtag(match);
      if (!normalized) return;
      if (!/^[a-z0-9_]{1,32}$/.test(normalized)) return;
      if (uniqueTags.includes(normalized)) return;
      uniqueTags.push(normalized);
    });

    return uniqueTags;
  }

  function validateHashtags(content) {
    const hashtags = extractHashtags(content);
    if (hashtags.length > MAX_HASHTAGS_PER_TAKE) {
      return `Use up to ${MAX_HASHTAGS_PER_TAKE} hashtags per take.`;
    }
    return "";
  }

  function validateCategory(categorySlug) {
    const safeCategorySlug = normalizeCategorySlug(categorySlug);
    if (!safeCategorySlug) {
      return "Select a category for this take.";
    }

    if (!/^[a-z0-9_]+$/.test(safeCategorySlug)) {
      return "Category selection is invalid.";
    }

    return "";
  }

  function getFileExtension(filename) {
    return String(filename || "")
      .split(".")
      .pop()
      .toLowerCase();
  }

  function validateImageFile(file) {
    if (!file) {
      return { valid: true, error: "" };
    }

    const extension = getFileExtension(file.name);
    const typeAllowed = ALLOWED_MIME_TYPES.includes(file.type);
    const extensionAllowed = ALLOWED_EXTENSIONS.includes(extension);

    if (!typeAllowed && !extensionAllowed) {
      return {
        valid: false,
        error: "Unsupported image format. Use JPG, JPEG, PNG, or WEBP.",
      };
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return {
        valid: false,
        error: "Image is too large. Maximum size is 5MB.",
      };
    }

    return { valid: true, error: "" };
  }

  function validateImageFiles(files) {
    const safeFiles = Array.from(files || []).filter(Boolean);
    if (safeFiles.length > MAX_IMAGES_PER_TAKE) {
      return {
        valid: false,
        error: `You can upload up to ${MAX_IMAGES_PER_TAKE} images per take.`,
      };
    }

    for (const file of safeFiles) {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        return validation;
      }
    }

    return { valid: true, error: "" };
  }

  function normalizeVoteType(voteType) {
    const safe = String(voteType || "").toLowerCase();
    if (safe === "agree" || safe === "disagree") return safe;
    return "";
  }

  function validateVoteType(voteType) {
    const safe = normalizeVoteType(voteType);
    if (!safe) {
      return "Vote type must be agree or disagree.";
    }
    return "";
  }

  async function uploadTakeImage(file, userId) {
    if (!file) {
      return { imageUrl: "", error: null };
    }

    const imageValidation = validateImageFile(file);
    if (!imageValidation.valid) {
      return { imageUrl: "", error: new Error(imageValidation.error) };
    }

    const client = getClientOrThrow();
    const extension = getFileExtension(file.name) || "jpg";
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const uploadResult = await client.storage.from(TAKE_IMAGES_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

    if (uploadResult.error) {
      return { imageUrl: "", error: uploadResult.error };
    }

    const publicResult = client.storage.from(TAKE_IMAGES_BUCKET).getPublicUrl(path);
    return {
      imageUrl: publicResult.data ? publicResult.data.publicUrl : "",
      error: null,
    };
  }

  async function uploadTakeImages(files, userId) {
    const safeFiles = Array.from(files || []).filter(Boolean).slice(0, MAX_IMAGES_PER_TAKE);
    if (!safeFiles.length) {
      return { imageUrls: [], error: null };
    }

    const uploadResults = await Promise.all(safeFiles.map((file) => uploadTakeImage(file, userId)));
    const failedResult = uploadResults.find((result) => result.error);
    if (failedResult) {
      return {
        imageUrls: [],
        error: failedResult.error,
      };
    }

    return {
      imageUrls: uploadResults.map((result) => result.imageUrl).filter(Boolean),
      error: null,
    };
  }

  function normalizeTakeImageUrls(value) {
    const safeUrls = [];
    const pushUrl = (url) => {
      const safeUrl = String(url || "").trim();
      if (!safeUrl || safeUrls.includes(safeUrl)) return;
      safeUrls.push(safeUrl);
    };

    if (Array.isArray(value)) {
      value.forEach(pushUrl);
      return safeUrls.slice(0, MAX_IMAGES_PER_TAKE);
    }

    const rawValue = String(value || "").trim();
    if (!rawValue) {
      return [];
    }

    if (rawValue.startsWith("[")) {
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          parsed.forEach(pushUrl);
          return safeUrls.slice(0, MAX_IMAGES_PER_TAKE);
        }
      } catch (_error) {
        // Fall back to legacy single URL handling.
      }
    }

    pushUrl(rawValue);
    return safeUrls.slice(0, MAX_IMAGES_PER_TAKE);
  }

  function serializeTakeImageUrls(imageUrls) {
    const safeUrls = normalizeTakeImageUrls(imageUrls);
    if (!safeUrls.length) return null;
    if (safeUrls.length === 1) return safeUrls[0];
    return JSON.stringify(safeUrls);
  }

  function normalizeTakeMedia(take) {
    const imageUrls = normalizeTakeImageUrls(take && take.image_url);
    return {
      ...(take || {}),
      image_url: imageUrls[0] || "",
      image_urls: imageUrls,
    };
  }

  async function createTake(input) {
    const client = getClientOrThrow();
    const cleanContent = sanitizeContent(input.content);
    const contentError = validateTakeContent(cleanContent);
    if (contentError) {
      return { take: null, error: new Error(contentError) };
    }

    const categoryError = validateCategory(input.categorySlug);
    if (categoryError) {
      return { take: null, error: new Error(categoryError) };
    }

    const imageFiles = Array.isArray(input && input.imageFiles)
      ? input.imageFiles
      : input && input.imageFile
        ? [input.imageFile]
        : [];
    const imageValidation = validateImageFiles(imageFiles);
    if (!imageValidation.valid) {
      return { take: null, error: new Error(imageValidation.error) };
    }

    let imageUrls = [];
    if (imageFiles.length) {
      const uploadResult = await uploadTakeImages(imageFiles, input.userId);
      if (uploadResult.error) {
        return { take: null, error: uploadResult.error };
      }
      imageUrls = uploadResult.imageUrls || [];
    }

    const insertResult = await client
      .from(TAKES_TABLE)
      .insert({
        user_id: input.userId,
        content: cleanContent,
        image_url: serializeTakeImageUrls(imageUrls),
      })
      .select("id, user_id, content, image_url, created_at")
      .single();

    if (insertResult.error || !insertResult.data) {
      return {
        take: insertResult.data || null,
        error: insertResult.error,
      };
    }

    const hashtagResult = await syncTakeHashtags(insertResult.data.id, cleanContent);
    if (hashtagResult.error) {
      return {
        take: insertResult.data,
        error: hashtagResult.error,
      };
    }

    const categoryResult = await syncTakeCategory(insertResult.data.id, input.categorySlug);
    if (categoryResult.error) {
      return {
        take: insertResult.data,
        error: categoryResult.error,
      };
    }

    return {
      take: normalizeTakeMedia({
        ...(insertResult.data || {}),
        hashtags: hashtagResult.hashtags || [],
        category: categoryResult.category || null,
      }),
      error: null,
    };
  }

  async function syncTakeHashtags(takeId, content) {
    const client = getClientOrThrow();
    const tags = extractHashtags(content);

    if (!tags.length) {
      return { hashtags: [], error: null };
    }

    const insertTagsResult = await client.from(HASHTAGS_TABLE).upsert(
      tags.map((tag) => ({
        tag,
      })),
      { onConflict: "tag", ignoreDuplicates: true }
    );

    if (insertTagsResult.error) {
      return { hashtags: [], error: insertTagsResult.error };
    }

    const hashtagQuery = await client.from(HASHTAGS_TABLE).select("id, tag").in("tag", tags);
    if (hashtagQuery.error) {
      return { hashtags: [], error: hashtagQuery.error };
    }

    const hashtagRows = hashtagQuery.data || [];
    const joinRows = hashtagRows.map((row) => ({
      take_id: takeId,
      hashtag_id: row.id,
    }));

    if (joinRows.length) {
      const joinResult = await client
        .from(TAKE_HASHTAGS_TABLE)
        .upsert(joinRows, { onConflict: "take_id,hashtag_id", ignoreDuplicates: true });
      if (joinResult.error) {
        return { hashtags: [], error: joinResult.error };
      }
    }

    return {
      hashtags: hashtagRows
        .map((row) => row.tag)
        .filter(Boolean)
        .sort(),
      error: null,
    };
  }

  async function syncTakeCategory(takeId, categorySlug) {
    const client = getClientOrThrow();
    const safeCategorySlug = normalizeCategorySlug(categorySlug);
    const validationError = validateCategory(safeCategorySlug);
    if (validationError) {
      return { category: null, error: new Error(validationError) };
    }

    const categoryQuery = await client
      .from(CATEGORIES_TABLE)
      .select("id, slug, name")
      .eq("slug", safeCategorySlug)
      .maybeSingle();

    if (categoryQuery.error) {
      return { category: null, error: categoryQuery.error };
    }

    if (!categoryQuery.data) {
      return { category: null, error: new Error("Selected category could not be found.") };
    }

    const joinResult = await client.from(TAKE_CATEGORIES_TABLE).upsert(
      {
        take_id: takeId,
        category_id: categoryQuery.data.id,
      },
      { onConflict: "take_id" }
    );

    return {
      category: categoryQuery.data,
      error: joinResult.error,
    };
  }

  async function fetchProfilesByIds(userIds) {
    const safeUserIds = [...new Set((userIds || []).filter(Boolean))];
    if (!safeUserIds.length) return { profiles: [], error: null };

    const cachedProfiles =
      window.ClashlyProfiles && typeof window.ClashlyProfiles.getCachedProfilesByIds === "function"
        ? window.ClashlyProfiles.getCachedProfilesByIds(safeUserIds)
        : [];
    const profileMap = new Map(cachedProfiles.map((profile) => [profile.id, profile]));
    const missingUserIds = safeUserIds.filter((userId) => !profileMap.has(userId));

    if (!missingUserIds.length) {
      return {
        profiles: safeUserIds.map((userId) => profileMap.get(userId)).filter(Boolean),
        error: null,
      };
    }

    const client = getClientOrThrow();
    const queryResult = await client
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", missingUserIds);

    const fetchedProfiles =
      window.ClashlyProfiles && typeof window.ClashlyProfiles.cacheProfiles === "function"
        ? window.ClashlyProfiles.cacheProfiles(queryResult.data || [])
        : queryResult.data || [];

    fetchedProfiles.forEach((profile) => {
      if (profile && profile.id) {
        profileMap.set(profile.id, profile);
      }
    });

    return {
      profiles: safeUserIds.map((userId) => profileMap.get(userId)).filter(Boolean),
      error: queryResult.error,
    };
  }

  async function fetchHashtagsForTakeIds(takeIds) {
    if (!takeIds.length) {
      return { hashtagMap: new Map(), error: null };
    }

    const client = getClientOrThrow();
    const joinQuery = await client
      .from(TAKE_HASHTAGS_TABLE)
      .select("take_id, hashtag_id")
      .in("take_id", takeIds);

    if (joinQuery.error) {
      return { hashtagMap: new Map(), error: joinQuery.error };
    }

    const joinRows = joinQuery.data || [];
    const hashtagIds = [...new Set(joinRows.map((row) => row.hashtag_id).filter(Boolean))];
    if (!hashtagIds.length) {
      return { hashtagMap: new Map(), error: null };
    }

    const hashtagQuery = await client.from(HASHTAGS_TABLE).select("id, tag").in("id", hashtagIds);
    if (hashtagQuery.error) {
      return { hashtagMap: new Map(), error: hashtagQuery.error };
    }

    const hashtagRows = hashtagQuery.data || [];
    const hashtagById = new Map(
      hashtagRows
        .filter((row) => row && row.id && row.tag)
        .map((row) => [row.id, row.tag])
    );

    const hashtagMap = new Map();
    joinRows.forEach((row) => {
      const tag = hashtagById.get(row.hashtag_id);
      if (!tag) return;

      const existing = hashtagMap.get(row.take_id) || [];
      if (!existing.includes(tag)) {
        existing.push(tag);
        hashtagMap.set(row.take_id, existing);
      }
    });

    hashtagMap.forEach((tags, takeId) => {
      hashtagMap.set(takeId, [...tags].sort());
    });

    return { hashtagMap, error: null };
  }

  async function fetchCategoriesForTakeIds(takeIds) {
    if (!takeIds.length) {
      return { categoryMap: new Map(), error: null };
    }

    const client = getClientOrThrow();
    const joinQuery = await client
      .from(TAKE_CATEGORIES_TABLE)
      .select("take_id, category_id")
      .in("take_id", takeIds);

    if (joinQuery.error) {
      return { categoryMap: new Map(), error: joinQuery.error };
    }

    const joinRows = joinQuery.data || [];
    const categoryIds = [...new Set(joinRows.map((row) => row.category_id).filter(Boolean))];
    if (!categoryIds.length) {
      return { categoryMap: new Map(), error: null };
    }

    const categoryQuery = await client
      .from(CATEGORIES_TABLE)
      .select("id, slug, name")
      .in("id", categoryIds);

    if (categoryQuery.error) {
      return { categoryMap: new Map(), error: categoryQuery.error };
    }

    const categoryById = new Map(
      (categoryQuery.data || [])
        .filter((row) => row && row.id)
        .map((row) => [row.id, row])
    );

    const categoryMap = new Map();
    joinRows.forEach((row) => {
      const category = categoryById.get(row.category_id);
      if (category) {
        categoryMap.set(row.take_id, category);
      }
    });

    return { categoryMap, error: null };
  }

  function createVoteSummary(agreeCount, disagreeCount, userVote) {
    const agree = Number(agreeCount || 0);
    const disagree = Number(disagreeCount || 0);
    const total = agree + disagree;
    const agreePct = total > 0 ? Math.round((agree / total) * 100) : 0;
    const disagreePct = total > 0 ? 100 - agreePct : 0;

    return {
      agree_count: agree,
      disagree_count: disagree,
      total_votes: total,
      agree_pct: agreePct,
      disagree_pct: disagreePct,
      user_vote: normalizeVoteType(userVote),
    };
  }

  function defaultVoteSummary() {
    return createVoteSummary(0, 0, "");
  }

  // Relevance tiers, highest first: exact match, then prefix match, then a
  // plain substring hit anywhere else in the text. Mirrors the scoring used
  // for user/hashtag search in search-service.js.
  function matchTextRelevance(fieldValue, safeQuery) {
    const normalizedField = String(fieldValue || "").toLowerCase();
    const normalizedQuery = String(safeQuery || "").toLowerCase();
    if (!normalizedQuery) return 0;
    if (normalizedField === normalizedQuery) return 3;
    if (normalizedField.startsWith(normalizedQuery)) return 2;
    if (normalizedField.includes(normalizedQuery)) return 1;
    return 0;
  }

  function previewVoteSummary(vote, nextVoteType) {
    const currentVote = vote || defaultVoteSummary();
    const safeNextVoteType = normalizeVoteType(nextVoteType);
    const safeCurrentVote = normalizeVoteType(currentVote.user_vote);
    let agree = Number(currentVote.agree_count || 0);
    let disagree = Number(currentVote.disagree_count || 0);
    let userVote = safeCurrentVote;

    if (safeCurrentVote === safeNextVoteType) {
      return createVoteSummary(agree, disagree, userVote);
    } else {
      if (safeCurrentVote === "agree") agree = Math.max(0, agree - 1);
      if (safeCurrentVote === "disagree") disagree = Math.max(0, disagree - 1);
      if (safeNextVoteType === "agree") agree += 1;
      if (safeNextVoteType === "disagree") disagree += 1;
      userVote = safeNextVoteType;
    }

    return createVoteSummary(agree, disagree, userVote);
  }

  function resolveSubmittedVoteSummary(optimisticVote, serverVote) {
    if (optimisticVote) {
      return createVoteSummary(
        optimisticVote.agree_count,
        optimisticVote.disagree_count,
        optimisticVote.user_vote
      );
    }

    if (serverVote) {
      return createVoteSummary(
        serverVote.agree_count,
        serverVote.disagree_count,
        serverVote.user_vote
      );
    }

    return defaultVoteSummary();
  }

  function buildVoteSummaryMap(takeIds, voteRows, currentUserId) {
    const map = new Map();
    takeIds.forEach((takeId) => {
      map.set(takeId, defaultVoteSummary());
    });

    voteRows.forEach((row) => {
      const takeId = row.take_id;
      if (!map.has(takeId)) {
        map.set(takeId, defaultVoteSummary());
      }

      const previous = map.get(takeId) || defaultVoteSummary();
      const voteType = normalizeVoteType(row.vote_type);
      let agree = previous.agree_count;
      let disagree = previous.disagree_count;
      let userVote = previous.user_vote;

      if (voteType === "agree") agree += 1;
      if (voteType === "disagree") disagree += 1;
      if (currentUserId && row.user_id === currentUserId) {
        userVote = voteType;
      }

      map.set(takeId, createVoteSummary(agree, disagree, userVote));
    });

    return map;
  }

  async function fetchVotesForTakeIds(takeIds, currentUserId) {
    if (!takeIds.length) {
      return { voteSummaryMap: new Map(), error: null };
    }

    const client = getClientOrThrow();
    const voteQuery = await client
      .from(VOTES_TABLE)
      .select("take_id, user_id, vote_type")
      .in("take_id", takeIds);

    if (voteQuery.error) {
      return { voteSummaryMap: new Map(), error: voteQuery.error };
    }

    return {
      voteSummaryMap: buildVoteSummaryMap(takeIds, voteQuery.data || [], currentUserId),
      error: null,
    };
  }

  function attachVoteSummaryToTakes(rows, voteSummaryMap) {
    return rows.map((take) => {
      const vote = voteSummaryMap.get(take.id) || defaultVoteSummary();
      return {
        ...take,
        vote,
      };
    });
  }

  async function fetchBookmarksForTakeIds(takeIds, currentUserId) {
    if (!currentUserId || !takeIds.length) {
      return { bookmarkedTakeIds: new Set(), error: null };
    }

    const client = getClientOrThrow();
    const queryResult = await client
      .from(BOOKMARKS_TABLE)
      .select("take_id")
      .eq("user_id", currentUserId)
      .in("take_id", takeIds);

    if (queryResult.error) {
      return { bookmarkedTakeIds: new Set(), error: queryResult.error };
    }

    return {
      bookmarkedTakeIds: new Set((queryResult.data || []).map((row) => row.take_id).filter(Boolean)),
      error: null,
    };
  }

  function attachBookmarkStateToTakes(rows, bookmarkedTakeIds) {
    return rows.map((take) => ({
      ...take,
      bookmarked: bookmarkedTakeIds.has(take.id),
    }));
  }

  function attachHashtagsToTakes(rows, hashtagMap) {
    return rows.map((take) => ({
      ...take,
      hashtags: hashtagMap.get(take.id) || [],
    }));
  }

  function attachCategoryToTakes(rows, categoryMap) {
    return rows.map((take) => ({
      ...take,
      category: categoryMap.get(take.id) || null,
    }));
  }

  function normalizeTab(tab) {
    const safe = String(tab || "new").toLowerCase();
    if (safe === "trending" || safe === "controversial" || safe === "new" || safe === "following") {
      return safe;
    }
    return "new";
  }

  function clampPageLimit(limit) {
    const numeric = Number(limit || DEFAULT_PAGE_SIZE);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return DEFAULT_PAGE_SIZE;
    }
    return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(numeric)));
  }

  function normalizeCursor(cursor) {
    if (!cursor || typeof cursor !== "object") return null;
    const createdAt = String(cursor.created_at || "").trim();
    const id = String(cursor.id || "").trim();
    if (!createdAt || !id) return null;
    return { created_at: createdAt, id };
  }

  function buildNextCursor(rows, limit) {
    if (!rows.length || rows.length < limit) return null;
    const last = rows[rows.length - 1];
    if (!last || !last.created_at || !last.id) return null;
    return {
      created_at: last.created_at,
      id: last.id,
    };
  }

  function isMissingRpcFunction(error) {
    if (!error) return false;
    const code = String(error.code || "");
    const message = String(error.message || "").toLowerCase();
    return code === "42883" || message.includes("function public.get_feed_page") || message.includes("function get_feed_page");
  }

  function mapRpcFeedRows(rows) {
    return (rows || []).map((row) => {
      const agree = Number(row.agree_count || 0);
      const disagree = Number(row.disagree_count || 0);
      const vote = createVoteSummary(agree, disagree, row.user_vote || "");
      const hashtags = Array.isArray(row.hashtags) ? row.hashtags.filter(Boolean) : [];
      const category =
        row.category_slug || row.category_name
          ? {
              slug: row.category_slug || "",
              name: row.category_name || "",
            }
          : null;

      return normalizeTakeMedia({
        id: row.id,
        user_id: row.user_id,
        content: row.content || "",
        image_url: row.image_url || "",
        created_at: row.created_at,
        profile: {
          id: row.user_id,
          username: row.username || "",
          avatar_url: row.avatar_url || "",
        },
        vote,
        comment_count: Number(row.comment_count || 0),
        bookmarked: Boolean(row.bookmarked),
        hashtags,
        category,
      });
    });
  }

  async function fetchFeedPageRpc(options) {
    const client = getClientOrThrow();
    const limit = clampPageLimit(options && options.limit);
    const cursor = normalizeCursor(options && options.cursor);
    const mode = String((options && options.mode) || "new").toLowerCase();
    const rpcResult = await client.rpc("get_feed_page", {
      p_viewer_id: options && options.currentUserId ? options.currentUserId : null,
      p_limit: limit,
      p_before_created_at: cursor ? cursor.created_at : null,
      p_before_id: cursor ? cursor.id : null,
      p_mode: mode,
      p_hashtag: options && options.hashtag ? normalizeHashtag(options.hashtag) : null,
      p_profile_id: options && options.profileId ? options.profileId : null,
      p_category_slug: options && options.categorySlug ? normalizeCategorySlug(options.categorySlug) : null,
      p_search_query: options && options.searchQuery ? String(options.searchQuery || "").trim() : null,
    });

    if (rpcResult.error) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: rpcResult.error,
      };
    }

    const takes = mapRpcFeedRows(rpcResult.data || []);
    const nextCursor = buildNextCursor(rpcResult.data || [], limit);
    return {
      takes,
      nextCursor,
      hasMore: Boolean(nextCursor),
      error: null,
    };
  }

  function stableHash(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = (hash << 5) - hash + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function scoreTrending(take) {
    const vote = take.vote || defaultVoteSummary();
    const totalVotes = vote.total_votes || 0;
    const ageMs = Date.now() - new Date(take.created_at).getTime();
    const ageHours = Math.max(0, ageMs / 36e5);
    const recencyScore = Math.max(0, 72 - ageHours) * 1.25;
    const engagementScore = totalVotes * 4.5;
    const qualityBoost = Math.min(18, take.content.length / 10);
    const imageBoost = normalizeTakeImageUrls(take && take.image_url).length ? 4 : 0;
    return recencyScore + engagementScore + qualityBoost + imageBoost;
  }

  function scoreControversial(take) {
    const vote = take.vote || defaultVoteSummary();
    const agree = vote.agree_count || 0;
    const disagree = vote.disagree_count || 0;
    const totalVotes = vote.total_votes || 0;
    if (totalVotes < MIN_CONTROVERSIAL_VOTES) {
      return -1000 + totalVotes;
    }

    const closeness = 1 - Math.abs(agree - disagree) / totalVotes;
    const ageMs = Date.now() - new Date(take.created_at).getTime();
    const ageHours = Math.max(0, ageMs / 36e5);
    const freshness = Math.max(0, 96 - ageHours) * 0.12;
    const stability = Math.min(totalVotes, 80) * 0.45;
    const noiseGuard = (stableHash(take.id) % 7) * 0.01;
    return closeness * 100 + stability + freshness + noiseGuard;
  }

  function applyTabSorting(rows, tab) {
    const safeTab = normalizeTab(tab);
    if (safeTab === "new") {
      return [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    if (safeTab === "trending") {
      return [...rows].sort((a, b) => {
        const scoreDiff = scoreTrending(b) - scoreTrending(a);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    }

    return [...rows].sort((a, b) => {
      const scoreDiff = scoreControversial(b) - scoreControversial(a);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  function mergeTakesWithProfiles(rows, profiles) {
    const profileMap = new Map();
    profiles.forEach((profile) => {
      profileMap.set(profile.id, profile);
    });

    return rows.map((take) => {
      const profile = profileMap.get(take.user_id) || null;
      return normalizeTakeMedia({
        ...take,
        profile,
      });
    });
  }

  async function decorateTakeRows(rows, currentUserId) {
    if (!rows.length) {
      return { takes: [], error: null };
    }

    const userIds = [...new Set(rows.map((take) => take.user_id).filter(Boolean))];
    const takeIds = [...new Set(rows.map((take) => take.id).filter(Boolean))];

    const [profileResult, voteResult, bookmarksResult, hashtagsResult, categoriesResult] = await Promise.all([
      fetchProfilesByIds(userIds),
      fetchVotesForTakeIds(takeIds, currentUserId),
      fetchBookmarksForTakeIds(takeIds, currentUserId),
      fetchHashtagsForTakeIds(takeIds),
      fetchCategoriesForTakeIds(takeIds),
    ]);

    if (profileResult.error) {
      return { takes: [], error: profileResult.error };
    }

    if (voteResult.error) {
      return { takes: [], error: voteResult.error };
    }

    if (bookmarksResult.error) {
      return { takes: [], error: bookmarksResult.error };
    }

    if (hashtagsResult.error) {
      return { takes: [], error: hashtagsResult.error };
    }

    if (categoriesResult.error) {
      return { takes: [], error: categoriesResult.error };
    }

    const rowsWithVotes = attachVoteSummaryToTakes(rows, voteResult.voteSummaryMap);
    const rowsWithBookmarks = attachBookmarkStateToTakes(rowsWithVotes, bookmarksResult.bookmarkedTakeIds);
    const rowsWithHashtags = attachHashtagsToTakes(rowsWithBookmarks, hashtagsResult.hashtagMap);
    const rowsWithCategories = attachCategoryToTakes(rowsWithHashtags, categoriesResult.categoryMap);

    return {
      takes: mergeTakesWithProfiles(rowsWithCategories, profileResult.profiles || []),
      error: null,
    };
  }

  async function fetchFeedTakes(options) {
    const client = getClientOrThrow();
    const limit = clampPageLimit(options && options.limit);
    const tab = normalizeTab(options && options.tab ? options.tab : "new");
    const currentUserId = options && options.currentUserId ? options.currentUserId : "";
    const cursor = normalizeCursor(options && options.cursor);

    const rpcResult = await fetchFeedPageRpc({
      mode: "new",
      limit: tab === "new" ? limit : Math.min(MAX_PAGE_SIZE, limit * 2),
      cursor,
      currentUserId,
    });
    if (!rpcResult.error) {
      const sorted = applyTabSorting(rpcResult.takes || [], tab);
      const takes = tab === "new" ? sorted : sorted.slice(0, limit);
      return {
        takes,
        nextCursor: rpcResult.nextCursor,
        hasMore: rpcResult.hasMore,
        error: null,
      };
    }

    if (!isMissingRpcFunction(rpcResult.error)) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: rpcResult.error,
      };
    }

    let takeQueryBuilder = client
      .from(TAKES_TABLE)
      .select("id, user_id, content, image_url, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (cursor) {
      takeQueryBuilder = takeQueryBuilder.lt("created_at", cursor.created_at);
    }

    const takeQuery = await takeQueryBuilder;
    if (takeQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: takeQuery.error };
    }

    const rows = takeQuery.data || [];
    const decoratedResult = await decorateTakeRows(rows, currentUserId);
    if (decoratedResult.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: decoratedResult.error };
    }

    const nextCursor = buildNextCursor(rows, limit);
    return {
      takes: applyTabSorting(decoratedResult.takes || [], tab),
      nextCursor,
      hasMore: Boolean(nextCursor),
      error: null,
    };
  }

  async function fetchFollowingFeedTakes(options) {
    const client = getClientOrThrow();
    const limit = clampPageLimit(options && options.limit);
    const currentUserId = options && options.currentUserId ? options.currentUserId : "";
    const cursor = normalizeCursor(options && options.cursor);

    if (!currentUserId) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: new Error("You must be logged in to view the Following feed."),
        meta: {
          emptyReason: "unauthenticated",
        },
      };
    }

    const rpcResult = await fetchFeedPageRpc({
      mode: "following",
      limit,
      cursor,
      currentUserId,
    });
    if (!rpcResult.error) {
      if (!rpcResult.takes.length && !cursor) {
        const followExistsResult = await client
          .from(FOLLOWS_TABLE)
          .select("id")
          .eq("follower_id", currentUserId)
          .limit(1);

        if (followExistsResult.error) {
          return {
            takes: [],
            nextCursor: null,
            hasMore: false,
            error: followExistsResult.error,
            meta: {
              emptyReason: "",
            },
          };
        }

        const hasFollowing = Array.isArray(followExistsResult.data) && followExistsResult.data.length > 0;
        return {
          takes: [],
          nextCursor: null,
          hasMore: false,
          error: null,
          meta: {
            emptyReason: hasFollowing ? "no-followed-takes" : "no-following",
          },
        };
      }

      return {
        takes: rpcResult.takes || [],
        nextCursor: rpcResult.nextCursor,
        hasMore: rpcResult.hasMore,
        error: null,
        meta: {
          emptyReason: "",
        },
      };
    }

    if (!isMissingRpcFunction(rpcResult.error)) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: rpcResult.error,
        meta: {
          emptyReason: "",
        },
      };
    }

    const followsQuery = await client
      .from(FOLLOWS_TABLE)
      .select("following_id")
      .eq("follower_id", currentUserId);

    if (followsQuery.error) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: followsQuery.error,
        meta: {
          emptyReason: "",
        },
      };
    }

    const followedUserIds = [...new Set((followsQuery.data || []).map((row) => row.following_id).filter(Boolean))];
    if (!followedUserIds.length) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: null,
        meta: {
          emptyReason: "no-following",
        },
      };
    }

    let takeQueryBuilder = client
      .from(TAKES_TABLE)
      .select("id, user_id, content, image_url, created_at")
      .in("user_id", followedUserIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (cursor) {
      takeQueryBuilder = takeQueryBuilder.lt("created_at", cursor.created_at);
    }

    const takeQuery = await takeQueryBuilder;
    if (takeQuery.error) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: takeQuery.error,
        meta: {
          emptyReason: "",
        },
      };
    }

    const rows = takeQuery.data || [];
    if (!rows.length) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: null,
        meta: {
          emptyReason: "no-followed-takes",
        },
      };
    }

    const decoratedResult = await decorateTakeRows(rows, currentUserId);
    if (decoratedResult.error) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: decoratedResult.error,
        meta: {
          emptyReason: "",
        },
      };
    }

    const nextCursor = buildNextCursor(rows, limit);
    return {
      takes: decoratedResult.takes || [],
      nextCursor,
      hasMore: Boolean(nextCursor),
      error: null,
      meta: {
        emptyReason: "",
      },
    };
  }

  async function fetchTakesByUser(userId, options) {
    const client = getClientOrThrow();
    const limit = clampPageLimit(options && options.limit);
    const currentUserId = options && options.currentUserId ? options.currentUserId : "";
    const cursor = normalizeCursor(options && options.cursor);

    const rpcResult = await fetchFeedPageRpc({
      mode: "profile",
      profileId: userId,
      limit,
      cursor,
      currentUserId,
    });
    if (!rpcResult.error) {
      return {
        takes: rpcResult.takes || [],
        nextCursor: rpcResult.nextCursor,
        hasMore: rpcResult.hasMore,
        error: null,
      };
    }

    if (!isMissingRpcFunction(rpcResult.error)) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: rpcResult.error,
      };
    }

    let takeQueryBuilder = client
      .from(TAKES_TABLE)
      .select("id, user_id, content, image_url, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (cursor) {
      takeQueryBuilder = takeQueryBuilder.lt("created_at", cursor.created_at);
    }

    const takeQuery = await takeQueryBuilder;
    if (takeQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: takeQuery.error };
    }

    const rows = takeQuery.data || [];
    const decorated = await decorateTakeRows(rows, currentUserId);
    if (decorated.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: decorated.error };
    }

    const nextCursor = buildNextCursor(rows, limit);
    return {
      takes: decorated.takes || [],
      nextCursor,
      hasMore: Boolean(nextCursor),
      error: null,
    };
  }

  async function fetchTakeById(takeId, options) {
    const client = getClientOrThrow();
    const currentUserId = options && options.currentUserId ? options.currentUserId : "";

    const takeQuery = await client
      .from(TAKES_TABLE)
      .select("id, user_id, content, image_url, created_at")
      .eq("id", takeId)
      .maybeSingle();

    if (takeQuery.error) {
      return { take: null, error: takeQuery.error };
    }

    if (!takeQuery.data) {
      return { take: null, error: null };
    }

    const decoratedResult = await decorateTakeRows([takeQuery.data], currentUserId);
    if (decoratedResult.error) {
      return { take: null, error: decoratedResult.error };
    }

    const take = (decoratedResult.takes || [])[0] || null;
    return { take, error: null };
  }

  async function fetchBookmarkedTakes(userId, options) {
    const client = getClientOrThrow();
    const limit = clampPageLimit(options && options.limit);
    const currentUserId = options && options.currentUserId ? options.currentUserId : userId;
    const cursor = normalizeCursor(options && options.cursor);

    if (!userId) {
      return { takes: [], nextCursor: null, hasMore: false, error: new Error("User ID is required to load saved takes.") };
    }

    const rpcResult = await fetchFeedPageRpc({
      mode: "saved",
      limit,
      cursor,
      currentUserId: userId,
    });
    if (!rpcResult.error) {
      return {
        takes: (rpcResult.takes || []).map((take) => ({
          ...take,
          bookmarked: true,
        })),
        nextCursor: rpcResult.nextCursor,
        hasMore: rpcResult.hasMore,
        error: null,
      };
    }

    if (!isMissingRpcFunction(rpcResult.error)) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: rpcResult.error,
      };
    }

    let bookmarkQueryBuilder = client
      .from(BOOKMARKS_TABLE)
      .select("take_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cursor) {
      bookmarkQueryBuilder = bookmarkQueryBuilder.lt("created_at", cursor.created_at);
    }

    const bookmarkQuery = await bookmarkQueryBuilder;
    if (bookmarkQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: bookmarkQuery.error };
    }

    const bookmarkRows = bookmarkQuery.data || [];
    const takeIds = bookmarkRows.map((row) => row.take_id).filter(Boolean);
    if (!takeIds.length) {
      return { takes: [], nextCursor: null, hasMore: false, error: null };
    }

    const takeQuery = await client
      .from(TAKES_TABLE)
      .select("id, user_id, content, image_url, created_at")
      .in("id", takeIds);

    if (takeQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: takeQuery.error };
    }

    const takeRows = takeQuery.data || [];
    const decoratedResult = await decorateTakeRows(takeRows, currentUserId);
    if (decoratedResult.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: decoratedResult.error };
    }

    const merged = (decoratedResult.takes || []).map((take) => ({
      ...take,
      bookmarked: true,
    }));
    const takeMap = new Map(merged.map((take) => [take.id, take]));

    const nextCursor = buildNextCursor(bookmarkRows, limit);
    return {
      takes: takeIds.map((takeId) => takeMap.get(takeId)).filter(Boolean),
      nextCursor,
      hasMore: Boolean(nextCursor),
      error: null,
    };
  }

  async function fetchTakesByHashtag(tag, options) {
    const client = getClientOrThrow();
    const safeTag = normalizeHashtag(tag);
    const limit = clampPageLimit(options && options.limit);
    const tab = normalizeTab(options && options.tab ? options.tab : "new");
    const currentUserId = options && options.currentUserId ? options.currentUserId : "";
    const cursor = normalizeCursor(options && options.cursor);

    if (!safeTag) {
      return { takes: [], nextCursor: null, hasMore: false, error: new Error("Hashtag is required.") };
    }

    const rpcResult = await fetchFeedPageRpc({
      mode: "hashtag",
      hashtag: safeTag,
      limit: tab === "new" ? limit : Math.min(MAX_PAGE_SIZE, limit * 2),
      cursor,
      currentUserId,
    });
    if (!rpcResult.error) {
      const sorted = applyTabSorting(rpcResult.takes || [], tab);
      const takes = tab === "new" ? sorted : sorted.slice(0, limit);
      return {
        takes,
        nextCursor: rpcResult.nextCursor,
        hasMore: rpcResult.hasMore,
        error: null,
        hashtag: safeTag,
      };
    }

    if (!isMissingRpcFunction(rpcResult.error)) {
      return { takes: [], nextCursor: null, hasMore: false, error: rpcResult.error, hashtag: safeTag };
    }

    const hashtagQuery = await client
      .from(HASHTAGS_TABLE)
      .select("id, tag")
      .eq("tag", safeTag)
      .maybeSingle();

    if (hashtagQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: hashtagQuery.error };
    }

    if (!hashtagQuery.data) {
      return { takes: [], nextCursor: null, hasMore: false, error: null, hashtag: safeTag };
    }

    let takeHashtagQueryBuilder = client
      .from(TAKE_HASHTAGS_TABLE)
      .select("take_id")
      .eq("hashtag_id", hashtagQuery.data.id);

    if (cursor) {
      takeHashtagQueryBuilder = takeHashtagQueryBuilder.lt("created_at", cursor.created_at);
    }

    const takeHashtagQuery = await takeHashtagQueryBuilder.limit(Math.max(limit * 2, limit));
    if (takeHashtagQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: takeHashtagQuery.error, hashtag: safeTag };
    }

    const takeIds = [...new Set((takeHashtagQuery.data || []).map((row) => row.take_id).filter(Boolean))];
    if (!takeIds.length) {
      return { takes: [], nextCursor: null, hasMore: false, error: null, hashtag: safeTag };
    }

    const takeQuery = await client
      .from(TAKES_TABLE)
      .select("id, user_id, content, image_url, created_at")
      .in("id", takeIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.max(limit * 2, limit));

    if (takeQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: takeQuery.error, hashtag: safeTag };
    }

    const decoratedResult = await decorateTakeRows(takeQuery.data || [], currentUserId);
    if (decoratedResult.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: decoratedResult.error, hashtag: safeTag };
    }

    const sorted = applyTabSorting(decoratedResult.takes || [], tab).slice(0, limit);
    const nextCursor = buildNextCursor(sorted, limit);
    return {
      takes: sorted,
      nextCursor,
      hasMore: Boolean(nextCursor),
      error: null,
      hashtag: safeTag,
    };
  }

  async function fetchTakesByCategory(categorySlug, options) {
    const client = getClientOrThrow();
    const safeCategorySlug = normalizeCategorySlug(categorySlug);
    const limit = clampPageLimit(options && options.limit);
    const tab = normalizeTab(options && options.tab ? options.tab : "new");
    const currentUserId = options && options.currentUserId ? options.currentUserId : "";
    const cursor = normalizeCursor(options && options.cursor);

    if (!safeCategorySlug) {
      return { takes: [], nextCursor: null, hasMore: false, error: new Error("Category is required.") };
    }

    const rpcResult = await fetchFeedPageRpc({
      mode: "category",
      categorySlug: safeCategorySlug,
      limit: tab === "new" ? limit : Math.min(MAX_PAGE_SIZE, limit * 2),
      cursor,
      currentUserId,
    });
    if (!rpcResult.error) {
      let categoryMeta = null;
      if (rpcResult.takes && rpcResult.takes.length && rpcResult.takes[0].category) {
        categoryMeta = {
          slug: rpcResult.takes[0].category.slug || safeCategorySlug,
          name: rpcResult.takes[0].category.name || "",
        };
      }
      if (!categoryMeta) {
        const categoryLookup = await client
          .from(CATEGORIES_TABLE)
          .select("id, slug, name, description, keywords")
          .eq("slug", safeCategorySlug)
          .maybeSingle();
        if (categoryLookup.error) {
          return {
            takes: [],
            nextCursor: null,
            hasMore: false,
            error: categoryLookup.error,
            category: null,
          };
        }
        categoryMeta = categoryLookup.data || null;
      }
      const sorted = applyTabSorting(rpcResult.takes || [], tab);
      const takes = tab === "new" ? sorted : sorted.slice(0, limit);
      return {
        takes,
        nextCursor: rpcResult.nextCursor,
        hasMore: rpcResult.hasMore,
        error: null,
        category: categoryMeta,
      };
    }

    if (!isMissingRpcFunction(rpcResult.error)) {
      return { takes: [], nextCursor: null, hasMore: false, error: rpcResult.error, category: null };
    }

    const categoryQuery = await client
      .from(CATEGORIES_TABLE)
      .select("id, slug, name, description, keywords")
      .eq("slug", safeCategorySlug)
      .maybeSingle();

    if (categoryQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: categoryQuery.error, category: null };
    }

    if (!categoryQuery.data) {
      return { takes: [], nextCursor: null, hasMore: false, error: null, category: null };
    }

    const joinQuery = await client
      .from(TAKE_CATEGORIES_TABLE)
      .select("take_id")
      .eq("category_id", categoryQuery.data.id)
      .limit(Math.max(limit * 2, limit));

    if (joinQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: joinQuery.error, category: categoryQuery.data };
    }

    const takeIds = [...new Set((joinQuery.data || []).map((row) => row.take_id).filter(Boolean))];
    if (!takeIds.length) {
      return { takes: [], nextCursor: null, hasMore: false, error: null, category: categoryQuery.data };
    }

    const takeQuery = await client
      .from(TAKES_TABLE)
      .select("id, user_id, content, image_url, created_at")
      .in("id", takeIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.max(limit * 2, limit));

    if (takeQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: takeQuery.error, category: categoryQuery.data };
    }

    const decoratedResult = await decorateTakeRows(takeQuery.data || [], currentUserId);
    if (decoratedResult.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: decoratedResult.error, category: categoryQuery.data };
    }

    const sorted = applyTabSorting(decoratedResult.takes || [], tab).slice(0, limit);
    const nextCursor = buildNextCursor(sorted, limit);
    return {
      takes: sorted,
      nextCursor,
      hasMore: Boolean(nextCursor),
      error: null,
      category: categoryQuery.data,
    };
  }

  async function searchTakes(query, options) {
    const client = getClientOrThrow();
    const safeQuery = String(query || "").trim();
    const limit = clampPageLimit(options && options.limit ? options.limit : 10);
    const currentUserId = options && options.currentUserId ? options.currentUserId : "";
    const cursor = normalizeCursor(options && options.cursor);

    if (!safeQuery) {
      return { takes: [], nextCursor: null, hasMore: false, error: null };
    }

    const rpcResult = await fetchFeedPageRpc({
      mode: "search",
      searchQuery: safeQuery,
      limit,
      cursor,
      currentUserId,
    });
    if (!rpcResult.error) {
      return {
        takes: rpcResult.takes || [],
        nextCursor: rpcResult.nextCursor,
        hasMore: rpcResult.hasMore,
        error: null,
      };
    }

    if (!isMissingRpcFunction(rpcResult.error)) {
      return {
        takes: [],
        nextCursor: null,
        hasMore: false,
        error: rpcResult.error,
      };
    }

    // Pull a wider candidate window than we'll show — the plain ilike match
    // has no relevance ordering on its own, so we widen the net, decorate
    // with vote data, then score client-side below.
    const candidatePoolSize = Math.min(MAX_PAGE_SIZE, limit * 4);

    let takeQueryBuilder = client
      .from(TAKES_TABLE)
      .select("id, user_id, content, image_url, created_at")
      .ilike("content", `%${safeQuery}%`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(candidatePoolSize);

    if (cursor) {
      takeQueryBuilder = takeQueryBuilder.lt("created_at", cursor.created_at);
    }

    const takeQuery = await takeQueryBuilder;
    if (takeQuery.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: takeQuery.error };
    }

    const decorated = await decorateTakeRows(takeQuery.data || [], currentUserId);
    if (decorated.error) {
      return { takes: [], nextCursor: null, hasMore: false, error: decorated.error };
    }

    const ranked = (decorated.takes || [])
      .map((take) => {
        const vote = take.vote || defaultVoteSummary();
        const relevance = matchTextRelevance(take.content, safeQuery);
        const engagement = Number(vote.total_votes || 0);
        // Relevance dominates the ordering; engagement only breaks ties
        // within the same relevance tier so a wildly popular but weakly
        // matching take can't outrank a strong match.
        return { take, score: relevance * 1000 + Math.min(engagement, 999) };
      })
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return new Date(right.take.created_at) - new Date(left.take.created_at);
      })
      .slice(0, limit)
      .map((entry) => entry.take);

    // Relevance re-sorting breaks the recency-based cursor contract, so this
    // fallback path only supports a single scored page rather than deep
    // pagination. The RPC path above (when available) still paginates fully.
    return {
      takes: ranked,
      nextCursor: null,
      hasMore: false,
      error: null,
    };
  }

  async function fetchVoteSummaryForTake(takeId, currentUserId) {
    const voteResult = await fetchVotesForTakeIds([takeId], currentUserId);
    if (voteResult.error) {
      return { vote: defaultVoteSummary(), error: voteResult.error };
    }

    return {
      vote: voteResult.voteSummaryMap.get(takeId) || defaultVoteSummary(),
      error: null,
    };
  }

  async function submitVote(input) {
    const client = getClientOrThrow();
    const safeVoteType = normalizeVoteType(input.voteType);
    const validationError = validateVoteType(safeVoteType);
    if (validationError) {
      return { vote: defaultVoteSummary(), error: new Error(validationError) };
    }

    if (!input.userId) {
      return { vote: defaultVoteSummary(), error: new Error("You must be logged in to vote.") };
    }

    if (!input.takeId) {
      return { vote: defaultVoteSummary(), error: new Error("Take ID is required.") };
    }

    const currentVote = normalizeVoteType(input.currentVote);
    if (currentVote && currentVote === safeVoteType) {
      return fetchVoteSummaryForTake(input.takeId, input.userId);
    } else {
      const upsertResult = await client.from(VOTES_TABLE).upsert(
        {
          user_id: input.userId,
          take_id: input.takeId,
          vote_type: safeVoteType,
        },
        { onConflict: "user_id,take_id" }
      );

      if (upsertResult.error) {
        return { vote: defaultVoteSummary(), error: upsertResult.error };
      }
    }

    return fetchVoteSummaryForTake(input.takeId, input.userId);
  }

  async function toggleBookmark(input) {
    const client = getClientOrThrow();
    if (!input.userId) {
      return { bookmarked: false, error: new Error("You must be logged in to save takes.") };
    }

    if (!input.takeId) {
      return { bookmarked: false, error: new Error("Take ID is required.") };
    }

    if (input.isBookmarked) {
      const deleteResult = await client
        .from(BOOKMARKS_TABLE)
        .delete()
        .eq("user_id", input.userId)
        .eq("take_id", input.takeId);

      return {
        bookmarked: false,
        error: deleteResult.error,
      };
    }

    const insertResult = await client.from(BOOKMARKS_TABLE).upsert(
      {
        user_id: input.userId,
        take_id: input.takeId,
      },
      { onConflict: "user_id,take_id" }
    );

    return {
      bookmarked: !insertResult.error,
      error: insertResult.error,
    };
  }

  async function deleteTake(input) {
    const client = getClientOrThrow();
    if (!input.userId) {
      return { deleted: false, error: new Error("You must be logged in to delete takes.") };
    }

    if (!input.takeId) {
      return { deleted: false, error: new Error("Take ID is required.") };
    }

    const deleteResult = await client
      .from(TAKES_TABLE)
      .delete()
      .eq("id", input.takeId)
      .eq("user_id", input.userId);

    return {
      deleted: !deleteResult.error,
      error: deleteResult.error,
    };
  }

  window.ClashlyTakes = {
    TAKES_TABLE,
    VOTES_TABLE,
    BOOKMARKS_TABLE,
    HASHTAGS_TABLE,
    TAKE_IMAGES_BUCKET,
    CATEGORIES_TABLE,
    TAKE_CATEGORIES_TABLE,
    MAX_CONTENT_LENGTH,
    MAX_HASHTAGS_PER_TAKE,
    MAX_IMAGES_PER_TAKE,
    MAX_IMAGE_SIZE_BYTES,
    MIN_CONTROVERSIAL_VOTES,
    extractHashtags,
    validateTakeContent,
    validateHashtags,
    validateCategory,
    validateImageFile,
    validateImageFiles,
    validateVoteType,
    createTake,
    fetchFeedTakes,
    fetchFollowingFeedTakes,
    fetchTakesByHashtag,
    fetchTakesByCategory,
    searchTakes,
    fetchTakesByUser,
    fetchBookmarkedTakes,
    fetchTakeById,
    submitVote,
    previewVoteSummary,
    resolveSubmittedVoteSummary,
    toggleBookmark,
    deleteTake,
  };
})();
