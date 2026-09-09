(function () {
  const COMMENTS_TABLE = "comments";
  const COMMENT_LIKES_TABLE = "comment_likes";

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

  function sanitizeId(value) {
    return String(value || "").trim();
  }

  function validateCommentContent(content) {
    const safeContent = sanitizeContent(content);
    if (!safeContent) {
      return "Comment cannot be empty.";
    }

    return "";
  }

  async function fetchProfilesByIds(userIds) {
    if (!userIds.length) {
      return { profiles: [], error: null };
    }

    const client = getClientOrThrow();
    const result = await client
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", userIds);

    return {
      profiles: result.data || [],
      error: result.error,
    };
  }

  function sortRows(rows, sort) {
    const direction = sort === "oldest" ? 1 : -1;
    return [...rows].sort((a, b) => direction * (new Date(a.created_at) - new Date(b.created_at)));
  }

  function normalizeLikeCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) return 0;
    return Math.floor(count);
  }

  function buildThread(rows, profiles, currentUserId, sort, likeCountByCommentId, likedCommentIds) {
    const profileMap = new Map();
    profiles.forEach((profile) => {
      profileMap.set(profile.id, profile);
    });

    const commentMap = new Map();
    rows.forEach((row) => {
      commentMap.set(row.id, {
        ...row,
        profile: profileMap.get(row.user_id) || null,
        is_owner: Boolean(currentUserId && row.user_id === currentUserId),
        like_count: normalizeLikeCount(likeCountByCommentId.get(row.id)),
        liked_by_me: Boolean(currentUserId && likedCommentIds.has(row.id)),
        replies: [],
      });
    });

    const roots = [];
    sortRows(rows, sort).forEach((row) => {
      const comment = commentMap.get(row.id);
      if (!comment) return;

      if (row.parent_id && commentMap.has(row.parent_id)) {
        commentMap.get(row.parent_id).replies.push(comment);
      } else {
        roots.push(comment);
      }
    });

    const normalizeReplies = (items) =>
      items.map((item) => ({
        ...item,
        replies: normalizeReplies(sortRows(item.replies, sort)),
      }));

    return normalizeReplies(roots);
  }

  async function fetchCommentLikeState(commentIds, currentUserId) {
    if (!commentIds.length) {
      return {
        likeCountByCommentId: new Map(),
        likedCommentIds: new Set(),
        error: null,
      };
    }

    const client = getClientOrThrow();
    const likesResult = await client
      .from(COMMENT_LIKES_TABLE)
      .select("comment_id, user_id")
      .in("comment_id", commentIds);

    if (likesResult.error) {
      return {
        likeCountByCommentId: new Map(),
        likedCommentIds: new Set(),
        error: likesResult.error,
      };
    }

    const likeCountByCommentId = new Map();
    const likedCommentIds = new Set();
    (likesResult.data || []).forEach((row) => {
      const commentId = sanitizeId(row && row.comment_id);
      if (!commentId) return;

      likeCountByCommentId.set(commentId, (likeCountByCommentId.get(commentId) || 0) + 1);
      if (currentUserId && row.user_id === currentUserId) {
        likedCommentIds.add(commentId);
      }
    });

    return {
      likeCountByCommentId,
      likedCommentIds,
      error: null,
    };
  }

  async function fetchCommentsByTake(takeId, options) {
    const client = getClientOrThrow();
    const safeSort = options && options.sort === "oldest" ? "oldest" : "newest";
    const currentUserId = options && options.currentUserId ? options.currentUserId : "";

    const result = await client
      .from(COMMENTS_TABLE)
      .select("id, user_id, take_id, parent_id, content, created_at")
      .eq("take_id", takeId)
      .order("created_at", { ascending: safeSort === "oldest" });

    if (result.error) {
      return { comments: [], count: 0, error: result.error };
    }

    const rows = result.data || [];
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const commentIds = rows.map((row) => row.id);

    // Profiles and like-state each depend only on the comment rows above —
    // not on each other — so fetch them together instead of one after the
    // other. This alone cuts the drawer's slowest-case network time by
    // roughly a third, since these two round trips used to be serialized
    // for no reason.
    const [profilesResult, likeStateResult] = await Promise.all([
      fetchProfilesByIds(userIds),
      fetchCommentLikeState(commentIds, currentUserId),
    ]);

    if (profilesResult.error) {
      return { comments: [], count: 0, error: profilesResult.error };
    }
    if (likeStateResult.error) {
      return { comments: [], count: 0, error: likeStateResult.error };
    }

    return {
      comments: buildThread(
        rows,
        profilesResult.profiles || [],
        currentUserId,
        safeSort,
        likeStateResult.likeCountByCommentId,
        likeStateResult.likedCommentIds
      ),
      count: rows.length,
      error: null,
    };
  }

  async function createComment(input) {
    const client = getClientOrThrow();
    const safeContent = sanitizeContent(input.content);
    const validationError = validateCommentContent(safeContent);
    if (validationError) {
      return { comment: null, error: new Error(validationError) };
    }

    const payload = {
      user_id: input.userId,
      take_id: input.takeId,
      parent_id: input.parentId || null,
      content: safeContent,
    };

    const result = await client
      .from(COMMENTS_TABLE)
      .insert(payload)
      .select("id, user_id, take_id, parent_id, content, created_at")
      .single();

    return {
      comment: result.data || null,
      error: result.error,
    };
  }

  async function deleteComment(input) {
    const client = getClientOrThrow();
    const result = await client
      .from(COMMENTS_TABLE)
      .delete()
      .eq("id", input.commentId)
      .eq("user_id", input.userId);

    return {
      error: result.error,
    };
  }

  async function toggleCommentLike(input) {
    const client = getClientOrThrow();
    const userId = sanitizeId(input && input.userId);
    const commentId = sanitizeId(input && input.commentId);
    const isLiked = Boolean(input && input.isLiked);

    if (!userId) {
      return { liked: false, delta: 0, error: new Error("You must be logged in to like comments.") };
    }

    if (!commentId) {
      return { liked: false, delta: 0, error: new Error("Comment ID is required.") };
    }

    if (isLiked) {
      const deleteResult = await client
        .from(COMMENT_LIKES_TABLE)
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", userId);

      return {
        liked: false,
        delta: deleteResult.error ? 0 : -1,
        error: deleteResult.error,
      };
    }

    const insertResult = await client.from(COMMENT_LIKES_TABLE).insert({
      user_id: userId,
      comment_id: commentId,
    });

    if (insertResult.error) {
      if (insertResult.error.code === "23505") {
        return { liked: true, delta: 0, error: null };
      }

      return { liked: false, delta: 0, error: insertResult.error };
    }

    return {
      liked: true,
      delta: 1,
      error: null,
    };
  }

  function applyCommentLikeState(comments, input) {
    const safeCommentId = sanitizeId(input && input.commentId);
    const safeLiked = Boolean(input && input.liked);
    const rawDelta = Number(input && input.delta);
    const safeDelta = Number.isFinite(rawDelta) ? rawDelta : safeLiked ? 1 : -1;

    if (!safeCommentId || !Array.isArray(comments) || !comments.length) {
      return Array.isArray(comments) ? comments : [];
    }

    function updateItems(items) {
      let changed = false;
      const nextItems = items.map((item) => {
        let nextItem = item;
        let nextReplies = Array.isArray(item.replies) ? item.replies : [];

        if (nextReplies.length) {
          const replyResult = updateItems(nextReplies);
          if (replyResult.changed) {
            nextReplies = replyResult.items;
            nextItem = {
              ...nextItem,
              replies: nextReplies,
            };
            changed = true;
          }
        }

        if (item.id === safeCommentId) {
          const likeCount = Math.max(0, normalizeLikeCount(item.like_count) + safeDelta);
          nextItem = {
            ...nextItem,
            like_count: likeCount,
            liked_by_me: safeLiked,
          };
          changed = true;
        }

        return nextItem;
      });

      return {
        items: nextItems,
        changed,
      };
    }

    return updateItems(comments).items;
  }

  window.ClashlyComments = {
    COMMENTS_TABLE,
    COMMENT_LIKES_TABLE,
    fetchProfilesByIds,
    validateCommentContent,
    fetchCommentsByTake,
    createComment,
    deleteComment,
    toggleCommentLike,
    applyCommentLikeState,
  };
})();
