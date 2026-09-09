(function () {
  const NOTIFICATIONS_TABLE = "notifications";
  const FOLLOWS_TABLE = "follows";
  const COMMENTS_TABLE = "comments";
  const COMMENT_LIKES_TABLE = "comment_likes";
  const BOOKMARKS_TABLE = "bookmarks";
  const TYPES = new Set(["follow", "comment", "reply", "bookmark", "comment_like"]);
  const DEFAULT_LIMIT = 25;
  const MAX_LIMIT = 60;
  const CACHE_TTL_MS = 15_000;
  const FULL_NOTIFICATION_COLUMNS = "id, user_id, actor_id, type, target_id, target_take_id, target_comment_id, is_read, created_at";
  const BASE_NOTIFICATION_COLUMNS = "id, user_id, actor_id, type, target_id, is_read, created_at";
  const LOCAL_READ_STORAGE_PREFIX = "clashe-notifications-read";
  const SYNTHETIC_ID_PREFIX = "derived:";
  const notificationsCache = new Map();

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

  function normalizeType(type) {
    const safeType = String(type || "").trim().toLowerCase();
    return TYPES.has(safeType) ? safeType : "";
  }

  function clampLimit(limit) {
    const numeric = Number(limit || DEFAULT_LIMIT);
    if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, Math.floor(numeric)));
  }

  function normalizeCursor(cursor) {
    if (!cursor || typeof cursor !== "object") return null;
    const createdAt = String(cursor.created_at || "").trim();
    const id = String(cursor.id || "").trim();
    if (!createdAt || !id) return null;
    return {
      created_at: createdAt,
      id,
    };
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

  function isMissingColumn(error, columnName) {
    if (!error || !columnName) return false;
    const code = String(error.code || "");
    const message = String(error.message || "").toLowerCase();
    return code === "42703" || message.includes(String(columnName).toLowerCase());
  }

  function isMissingNotificationTargetColumns(error) {
    return isMissingColumn(error, "target_take_id") || isMissingColumn(error, "target_comment_id");
  }

  function getCachedNotifications(cacheKey) {
    const cacheEntry = notificationsCache.get(cacheKey);
    if (!cacheEntry) return null;
    if (Date.now() - cacheEntry.at > CACHE_TTL_MS) {
      notificationsCache.delete(cacheKey);
      return null;
    }
    return cacheEntry.value;
  }

  function setCachedNotifications(cacheKey, payload) {
    notificationsCache.set(cacheKey, {
      at: Date.now(),
      value: payload,
    });
  }

  function invalidateNotificationCacheForUser(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return;
    Array.from(notificationsCache.keys()).forEach((cacheKey) => {
      if (cacheKey.startsWith(`${safeUserId}|`)) {
        notificationsCache.delete(cacheKey);
      }
    });
  }

  function getLocalReadStorageKey(userId) {
    return `${LOCAL_READ_STORAGE_PREFIX}:${String(userId || "").trim()}`;
  }

  function getLocalReadIds(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return new Set();

    try {
      const raw = window.localStorage.getItem(getLocalReadStorageKey(safeUserId));
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value || "").trim()).filter(Boolean) : []);
    } catch (_error) {
      return new Set();
    }
  }

  function markLocalNotificationsRead(userId, notificationIds) {
    const safeUserId = String(userId || "").trim();
    const ids = [...new Set((notificationIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
    if (!safeUserId || !ids.length) return;

    try {
      const nextReadIds = getLocalReadIds(safeUserId);
      ids.forEach((id) => nextReadIds.add(id));
      window.localStorage.setItem(getLocalReadStorageKey(safeUserId), JSON.stringify(Array.from(nextReadIds)));
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  function isSyntheticNotificationId(notificationId) {
    return String(notificationId || "").startsWith(SYNTHETIC_ID_PREFIX);
  }

  function buildSyntheticNotificationId(input) {
    return [
      SYNTHETIC_ID_PREFIX,
      String(input.type || "").trim(),
      String(input.actorId || "").trim(),
      String(input.targetTakeId || "").trim(),
      String(input.targetCommentId || "").trim(),
      String(input.createdAt || "").trim(),
    ].join("|");
  }

  function createEmptyQueryResult() {
    return Promise.resolve({ data: [], error: null });
  }

  async function fetchCommentLikeNotificationRows(client, ownedCommentIds, safeUserId, limit) {
    if (!ownedCommentIds.length) {
      return { data: [], error: null };
    }

    let result = await client
      .from(COMMENT_LIKES_TABLE)
      .select("comment_id, user_id, created_at")
      .in("comment_id", ownedCommentIds)
      .neq("user_id", safeUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (result.error && isMissingColumn(result.error, "created_at")) {
      result = await client
        .from(COMMENT_LIKES_TABLE)
        .select("comment_id, user_id")
        .in("comment_id", ownedCommentIds)
        .neq("user_id", safeUserId)
        .limit(limit);

      if (!result.error) {
        result = {
          data: (result.data || []).map((row) => ({
            ...row,
            created_at: "",
          })),
          error: null,
        };
      }
    }

    return result;
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

  async function fetchTakesByIds(takeIds) {
    if (!takeIds.length) {
      return { takes: [], error: null };
    }

    const client = getClientOrThrow();
    const result = await client
      .from("takes")
      .select("id, content")
      .in("id", takeIds);

    return {
      takes: result.data || [],
      error: result.error,
    };
  }

  async function fetchCommentsByIds(commentIds) {
    if (!commentIds.length) {
      return { comments: [], error: null };
    }

    const client = getClientOrThrow();
    const result = await client
      .from("comments")
      .select("id, take_id")
      .in("id", commentIds);

    return {
      comments: result.data || [],
      error: result.error,
    };
  }

  async function fetchOwnedTakes(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
      return { takes: [], error: null };
    }

    const client = getClientOrThrow();
    const result = await client
      .from("takes")
      .select("id, content")
      .eq("user_id", safeUserId);

    return {
      takes: result.data || [],
      error: result.error,
    };
  }

  async function fetchOwnedComments(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
      return { comments: [], error: null };
    }

    const client = getClientOrThrow();
    const result = await client
      .from(COMMENTS_TABLE)
      .select("id, take_id, parent_id")
      .eq("user_id", safeUserId);

    return {
      comments: result.data || [],
      error: result.error,
    };
  }

  function sortNotificationsByCreatedAt(items) {
    return [...(items || [])].sort((left, right) => {
      const leftTime = new Date(left && left.created_at ? left.created_at : 0).getTime();
      const rightTime = new Date(right && right.created_at ? right.created_at : 0).getTime();
      return rightTime - leftTime;
    });
  }

  function buildDerivedNotification(input, actorsById, takesById, localReadIds) {
    const actorId = String(input.actor_id || "").trim();
    const targetTakeId = String(input.target_take_id || "").trim();
    const targetCommentId = String(input.target_comment_id || "").trim();
    const createdAt = String(input.created_at || "").trim();
    const take = targetTakeId ? takesById.get(targetTakeId) || null : null;
    const notification = {
      id: buildSyntheticNotificationId({
        type: input.type,
        actorId,
        targetTakeId,
        targetCommentId,
        createdAt,
      }),
      user_id: input.user_id,
      actor_id: actorId,
      type: input.type,
      target_id: input.target_id || targetTakeId || targetCommentId || null,
      target_take_id: targetTakeId || null,
      target_comment_id: targetCommentId || null,
      is_read: localReadIds.has(
        buildSyntheticNotificationId({
          type: input.type,
          actorId,
          targetTakeId,
          targetCommentId,
          createdAt,
        })
      ),
      created_at: createdAt,
      actor: actorsById.get(actorId) || null,
      take,
    };

    return {
      ...notification,
      href: buildHref(notification),
      message: buildMessage(notification),
      snippet: buildSnippet(notification),
    };
  }

  async function fetchDerivedNotifications(userId, limit) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
      return { notifications: [], nextCursor: null, hasMore: false, error: new Error("User ID is required.") };
    }

    const [ownedTakesResult, ownedCommentsResult] = await Promise.all([fetchOwnedTakes(safeUserId), fetchOwnedComments(safeUserId)]);
    if (ownedTakesResult.error) {
      return { notifications: [], nextCursor: null, hasMore: false, error: ownedTakesResult.error };
    }
    if (ownedCommentsResult.error) {
      return { notifications: [], nextCursor: null, hasMore: false, error: ownedCommentsResult.error };
    }

    const ownedTakes = ownedTakesResult.takes || [];
    const ownedComments = ownedCommentsResult.comments || [];
    const ownedTakeIds = [...new Set(ownedTakes.map((take) => take.id).filter(Boolean))];
    const ownedCommentIds = [...new Set(ownedComments.map((comment) => comment.id).filter(Boolean))];
    const ownedCommentsById = new Map(ownedComments.map((comment) => [comment.id, comment]));
    const overscanLimit = Math.max(limit * 4, 40);
    const client = getClientOrThrow();

    const [followsResult, commentsResult, repliesResult, commentLikesResult, bookmarksResult] = await Promise.all([
      client
        .from(FOLLOWS_TABLE)
        .select("follower_id, created_at")
        .eq("following_id", safeUserId)
        .order("created_at", { ascending: false })
        .limit(overscanLimit),
      ownedTakeIds.length
        ? client
            .from(COMMENTS_TABLE)
            .select("id, user_id, take_id, parent_id, created_at")
            .in("take_id", ownedTakeIds)
            .is("parent_id", null)
            .neq("user_id", safeUserId)
            .order("created_at", { ascending: false })
            .limit(overscanLimit)
        : createEmptyQueryResult(),
      ownedCommentIds.length
        ? client
            .from(COMMENTS_TABLE)
            .select("id, user_id, take_id, parent_id, created_at")
            .in("parent_id", ownedCommentIds)
            .neq("user_id", safeUserId)
            .order("created_at", { ascending: false })
            .limit(overscanLimit)
        : createEmptyQueryResult(),
      ownedCommentIds.length
        ? fetchCommentLikeNotificationRows(client, ownedCommentIds, safeUserId, overscanLimit)
        : createEmptyQueryResult(),
      ownedTakeIds.length
        ? client
            .from(BOOKMARKS_TABLE)
            .select("take_id, user_id, created_at")
            .in("take_id", ownedTakeIds)
            .neq("user_id", safeUserId)
            .order("created_at", { ascending: false })
            .limit(overscanLimit)
        : createEmptyQueryResult(),
    ]);

    const sourceError =
      followsResult.error ||
      commentsResult.error ||
      repliesResult.error ||
      commentLikesResult.error ||
      bookmarksResult.error ||
      null;
    if (sourceError) {
      return { notifications: [], nextCursor: null, hasMore: false, error: sourceError };
    }

    const topLevelComments = commentsResult.data || [];
    const replies = repliesResult.data || [];
    const commentLikes = commentLikesResult.data || [];
    const bookmarks = bookmarksResult.data || [];
    const actorIds = [
      ...new Set(
        []
          .concat((followsResult.data || []).map((row) => row.follower_id))
          .concat(topLevelComments.map((row) => row.user_id))
          .concat(replies.map((row) => row.user_id))
          .concat(commentLikes.map((row) => row.user_id))
          .concat(bookmarks.map((row) => row.user_id))
          .filter(Boolean)
      ),
    ];

    const takeIds = [
      ...new Set(
        ownedTakeIds
          .concat(topLevelComments.map((row) => row.take_id))
          .concat(replies.map((row) => row.take_id))
          .concat(bookmarks.map((row) => row.take_id))
          .concat(
            commentLikes
              .map((row) => {
                const ownedComment = ownedCommentsById.get(row.comment_id);
                return ownedComment ? ownedComment.take_id : "";
              })
              .filter(Boolean)
          )
          .filter(Boolean)
      ),
    ];

    const [profilesResult, takeSnippetsResult] = await Promise.all([fetchProfilesByIds(actorIds), fetchTakesByIds(takeIds)]);
    if (profilesResult.error) {
      return { notifications: [], nextCursor: null, hasMore: false, error: profilesResult.error };
    }
    if (takeSnippetsResult.error) {
      return { notifications: [], nextCursor: null, hasMore: false, error: takeSnippetsResult.error };
    }

    const actorsById = new Map((profilesResult.profiles || []).map((profile) => [profile.id, profile]));
    const takesById = new Map((takeSnippetsResult.takes || []).map((take) => [take.id, take]));
    const localReadIds = getLocalReadIds(safeUserId);
    const notifications = [];

    (followsResult.data || []).forEach((row) => {
      notifications.push(
        buildDerivedNotification(
          {
            user_id: safeUserId,
            actor_id: row.follower_id,
            type: "follow",
            target_id: row.follower_id,
            created_at: row.created_at,
          },
          actorsById,
          takesById,
          localReadIds
        )
      );
    });

    topLevelComments.forEach((row) => {
      notifications.push(
        buildDerivedNotification(
          {
            user_id: safeUserId,
            actor_id: row.user_id,
            type: "comment",
            target_id: row.take_id,
            target_take_id: row.take_id,
            target_comment_id: row.id,
            created_at: row.created_at,
          },
          actorsById,
          takesById,
          localReadIds
        )
      );
    });

    replies.forEach((row) => {
      notifications.push(
        buildDerivedNotification(
          {
            user_id: safeUserId,
            actor_id: row.user_id,
            type: "reply",
            target_id: row.take_id,
            target_take_id: row.take_id,
            target_comment_id: row.id,
            created_at: row.created_at,
          },
          actorsById,
          takesById,
          localReadIds
        )
      );
    });

    bookmarks.forEach((row) => {
      notifications.push(
        buildDerivedNotification(
          {
            user_id: safeUserId,
            actor_id: row.user_id,
            type: "bookmark",
            target_id: row.take_id,
            target_take_id: row.take_id,
            created_at: row.created_at,
          },
          actorsById,
          takesById,
          localReadIds
        )
      );
    });

    commentLikes.forEach((row) => {
      const ownedComment = ownedCommentsById.get(row.comment_id);
      if (!ownedComment) return;
      notifications.push(
        buildDerivedNotification(
          {
            user_id: safeUserId,
            actor_id: row.user_id,
            type: "comment_like",
            target_id: row.comment_id,
            target_take_id: ownedComment.take_id,
            target_comment_id: row.comment_id,
            created_at: row.created_at,
          },
          actorsById,
          takesById,
          localReadIds
        )
      );
    });

    const sortedNotifications = sortNotificationsByCreatedAt(notifications);
    const limitedNotifications = sortedNotifications.slice(0, limit);
    return {
      notifications: limitedNotifications,
      nextCursor: null,
      hasMore: sortedNotifications.length > limit,
      error: null,
    };
  }

  function buildHref(notification) {
    if (!notification) return "notifications.html";

    if (notification.type === "follow") {
      return `profile.html?id=${encodeURIComponent(notification.actor_id)}`;
    }

    const targetTakeId = String(notification.target_take_id || "").trim();
    const targetCommentId = String(notification.target_comment_id || "").trim();

    if (notification.type === "comment_like") {
      if (!targetTakeId) return "notifications.html";
      const takeUrl = `take.html?id=${encodeURIComponent(targetTakeId)}`;
      return targetCommentId ? `${takeUrl}&commentId=${encodeURIComponent(targetCommentId)}` : takeUrl;
    }

    if (targetTakeId) {
      const takeUrl = `take.html?id=${encodeURIComponent(targetTakeId)}`;
      return targetCommentId ? `${takeUrl}&commentId=${encodeURIComponent(targetCommentId)}` : takeUrl;
    }

    if (notification.target_id) {
      return `take.html?id=${encodeURIComponent(notification.target_id)}`;
    }

    return "notifications.html";
  }

  function buildMessage(notification) {
    const username = notification.actor && notification.actor.username ? String(notification.actor.username) : "user";
    const messages = {
      follow: `${username} followed you.`,
      comment: `${username} commented on your take.`,
      reply: `${username} replied to your comment.`,
      bookmark: `${username} saved your take.`,
      comment_like: `${username} liked your comment.`,
    };

    return messages[notification.type] || `${username} interacted with your account.`;
  }

  function buildSnippet(notification) {
    if (!notification.take || !notification.take.content) return "";
    const text = String(notification.take.content).trim();
    if (text.length <= 120) return text;
    return `${text.slice(0, 117)}...`;
  }

  function mapRowsToNotifications(rows) {
    return (rows || []).map((row) => {
      const actor = row.actor_username
        ? {
            id: row.actor_id,
            username: row.actor_username,
            avatar_url: row.actor_avatar_url || "",
          }
        : null;
      const take = row.take_content
        ? {
            id: row.target_take_id || row.target_id,
            content: row.take_content,
          }
        : null;
      const notification = {
        id: row.id,
        user_id: row.user_id,
        actor_id: row.actor_id,
        type: row.type,
        target_id: row.target_id,
        target_take_id: row.target_take_id || (row.type === "comment_like" ? "" : row.target_id),
        target_comment_id: row.target_comment_id || (row.type === "comment_like" ? row.target_id : null),
        is_read: Boolean(row.is_read),
        created_at: row.created_at,
        actor,
        take,
      };

      return {
        ...notification,
        href: buildHref(notification),
        message: buildMessage(notification),
        snippet: buildSnippet(notification),
      };
    });
  }

  async function createNotification(input) {
    const safeType = normalizeType(input.type);
    if (!safeType) {
      return { notification: null, error: new Error("Notification type is invalid.") };
    }

    const userId = String(input.userId || "").trim();
    const actorId = String(input.actorId || "").trim();
    const targetId = String(input.targetId || "").trim();
    const targetTakeId = String(input.targetTakeId || "").trim();
    const targetCommentId = String(input.targetCommentId || "").trim();

    if (!userId || !actorId) {
      return { notification: null, error: new Error("Notification is missing required users.") };
    }

    if (userId === actorId) {
      return { notification: null, error: null, skipped: true };
    }

    const client = getClientOrThrow();
    const insertPayload = {
      user_id: userId,
      actor_id: actorId,
      type: safeType,
      target_id: targetId || null,
      target_take_id: targetTakeId || null,
      target_comment_id: targetCommentId || null,
    };
    let result = await client
      .from(NOTIFICATIONS_TABLE)
      .insert(insertPayload)
      .select(FULL_NOTIFICATION_COLUMNS)
      .single();

    if (result.error && isMissingNotificationTargetColumns(result.error)) {
      result = await client
        .from(NOTIFICATIONS_TABLE)
        .insert({
          user_id: userId,
          actor_id: actorId,
          type: safeType,
          target_id: targetId || null,
        })
        .select(BASE_NOTIFICATION_COLUMNS)
        .single();
    }

    if (result.error && result.error.code === "23505") {
      return {
        notification: null,
        error: null,
        skipped: true,
      };
    }

    if (!result.error) {
      invalidateNotificationCacheForUser(userId);
    }

    // Always dispatch email notification via Clashe email service
    if (window.ClashlyEmail && typeof window.ClashlyEmail.sendNotificationEmail === "function") {
      window.ClashlyEmail.sendNotificationEmail({
        recipientId: userId,
        actorId,
        type: safeType,
        targetTakeId: targetTakeId || undefined,
        targetCommentId: targetCommentId || undefined,
        metadata: input.metadata || {},
      }).catch((err) => {
        console.warn("[ClasheNotifications] Email dispatch notice:", err);
      });
    }

    return {
      notification: result.data || null,
      error: result.error,
      skipped: false,
    };
  }

  async function fetchNotifications(userId, options) {
    const safeUserId = String(userId || "").trim();
    const limit = clampLimit(options && options.limit);
    const cursor = normalizeCursor(options && options.cursor);
    if (!safeUserId) {
      return { notifications: [], nextCursor: null, hasMore: false, error: new Error("User ID is required.") };
    }

    const cacheKey = `${safeUserId}|${limit}`;
    if (!cursor) {
      const cached = getCachedNotifications(cacheKey);
      if (cached) return cached;
    }

    const client = getClientOrThrow();
    const rpcResult = await client.rpc("get_notifications_page", {
      p_user_id: safeUserId,
      p_limit: limit,
      p_before_created_at: cursor ? cursor.created_at : null,
      p_before_id: cursor ? cursor.id : null,
    });

    if (!rpcResult.error) {
      const rows = rpcResult.data || [];
      const nextCursor = buildNextCursor(rows, limit);
      const payload = {
        notifications: mapRowsToNotifications(rows),
        nextCursor,
        hasMore: Boolean(nextCursor),
        error: null,
      };

      if (payload.notifications.length) {
        if (!cursor) {
          setCachedNotifications(cacheKey, payload);
        }
        return payload;
      }
    }

    if (rpcResult.error && !isMissingRpcFunction(rpcResult.error, "get_notifications_page")) {
      const derivedResult = await fetchDerivedNotifications(safeUserId, limit);
      if (!derivedResult.error) {
        if (!cursor) {
          setCachedNotifications(cacheKey, derivedResult);
        }
        return derivedResult;
      }
      return {
        notifications: [],
        nextCursor: null,
        hasMore: false,
        error: rpcResult.error,
      };
    }

    function buildFallbackQuery(selectColumns) {
      let queryBuilder = client
        .from(NOTIFICATIONS_TABLE)
        .select(selectColumns)
        .eq("user_id", safeUserId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);

      if (cursor) {
        queryBuilder = queryBuilder.lt("created_at", cursor.created_at);
      }

      return queryBuilder;
    }

    let result = await buildFallbackQuery(FULL_NOTIFICATION_COLUMNS);
    if (result.error && isMissingNotificationTargetColumns(result.error)) {
      result = await buildFallbackQuery(BASE_NOTIFICATION_COLUMNS);
    }

    if (result.error) {
      const derivedResult = await fetchDerivedNotifications(safeUserId, limit);
      if (!derivedResult.error) {
        if (!cursor) {
          setCachedNotifications(cacheKey, derivedResult);
        }
        return derivedResult;
      }
      return { notifications: [], nextCursor: null, hasMore: false, error: result.error };
    }

    const rows = result.data || [];
    const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))];
    const commentTargetIds = [
      ...new Set(
        rows
          .map((row) => {
            if (row.type === "comment_like") {
              return row.target_comment_id || row.target_id || "";
            }
            if (row.type === "reply") {
              return row.target_comment_id || "";
            }
            return "";
          })
          .filter(Boolean)
      ),
    ];

    const [profilesResult, commentsResult] = await Promise.all([fetchProfilesByIds(actorIds), fetchCommentsByIds(commentTargetIds)]);
    if (profilesResult.error) {
      return { notifications: [], nextCursor: null, hasMore: false, error: profilesResult.error };
    }
    if (commentsResult.error) {
      return { notifications: [], nextCursor: null, hasMore: false, error: commentsResult.error };
    }

    const commentMap = new Map((commentsResult.comments || []).map((comment) => [comment.id, comment]));
    const directTakeIds = rows
      .map((row) => {
        if (row.type === "follow") return "";
        if (row.target_take_id) return row.target_take_id;
        if (row.type === "comment_like") return "";
        return row.target_id || "";
      })
      .filter(Boolean);
    const commentTakeIds = (commentsResult.comments || []).map((comment) => comment.take_id).filter(Boolean);
    const takeIds = [...new Set(directTakeIds.concat(commentTakeIds))];

    const takesResult = await fetchTakesByIds(takeIds);
    if (takesResult.error) {
      return { notifications: [], nextCursor: null, hasMore: false, error: takesResult.error };
    }

    const profileMap = new Map((profilesResult.profiles || []).map((profile) => [profile.id, profile]));
    const takeMap = new Map((takesResult.takes || []).map((take) => [take.id, take]));

    const notifications = rows.map((row) => {
      const actor = profileMap.get(row.actor_id) || null;
      const targetTakeId =
        row.target_take_id ||
        (row.type === "comment_like"
          ? ((commentMap.get(row.target_comment_id || row.target_id) && commentMap.get(row.target_comment_id || row.target_id).take_id) || "")
          : row.target_id || "");
      const targetCommentId = row.target_comment_id || (row.type === "comment_like" ? row.target_id || "" : null);
      const take = targetTakeId ? takeMap.get(targetTakeId) || null : null;
      const notification = {
        ...row,
        target_take_id: targetTakeId || null,
        target_comment_id: targetCommentId,
        actor,
        take,
      };
      return {
        ...notification,
        href: buildHref(notification),
        message: buildMessage(notification),
        snippet: buildSnippet(notification),
      };
    });

    const nextCursor = buildNextCursor(rows, limit);
    const payload = {
      notifications,
      nextCursor,
      hasMore: Boolean(nextCursor),
      error: null,
    };

    if (payload.notifications.length) {
      if (!cursor) {
        setCachedNotifications(cacheKey, payload);
      }
      return payload;
    }

    const derivedResult = await fetchDerivedNotifications(safeUserId, limit);
    if (!derivedResult.error) {
      if (!cursor) {
        setCachedNotifications(cacheKey, derivedResult);
      }
      return derivedResult;
    }

    if (!cursor) {
      setCachedNotifications(cacheKey, payload);
    }

    return payload;
  }

  async function markNotificationsRead(userId, notificationIds) {
    const ids = [...new Set((notificationIds || []).filter(Boolean))];
    if (!userId || !ids.length) {
      return { error: null };
    }

    const localIds = ids.filter(isSyntheticNotificationId);
    if (localIds.length) {
      markLocalNotificationsRead(userId, localIds);
      invalidateNotificationCacheForUser(userId);
    }

    const databaseIds = ids.filter((id) => !isSyntheticNotificationId(id));
    if (!databaseIds.length) {
      return { error: null };
    }

    const client = getClientOrThrow();
    const result = await client
      .from(NOTIFICATIONS_TABLE)
      .update({ is_read: true })
      .eq("user_id", userId)
      .in("id", databaseIds);

    if (!result.error) {
      invalidateNotificationCacheForUser(userId);
    }

    return {
      error: result.error,
    };
  }

  async function fetchUnreadCount(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return { count: 0, error: null };

    // 1. Check in-memory cache
    for (const [cacheKey, cacheEntry] of notificationsCache.entries()) {
      if (cacheKey.startsWith(`${safeUserId}|`) && Date.now() - cacheEntry.at <= CACHE_TTL_MS) {
        const cached = cacheEntry.value;
        if (cached && Array.isArray(cached.notifications)) {
          const unreadCount = cached.notifications.filter((item) => !item.is_read).length;
          return { count: unreadCount, error: null };
        }
      }
    }

    // 2. Direct count query from Supabase
    try {
      const client = getClientOrThrow();
      const { count, error } = await client
        .from(NOTIFICATIONS_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("user_id", safeUserId)
        .eq("is_read", false);

      if (!error && typeof count === "number") {
        return { count, error: null };
      }
    } catch (_) {}

    // 3. Fallback to fetchNotifications (checks derived/local notifications)
    try {
      const listResult = await fetchNotifications(safeUserId, { limit: 25 });
      const count = (listResult.notifications || []).filter((item) => !item.is_read).length;
      return { count, error: listResult.error || null };
    } catch (err) {
      return { count: 0, error: err };
    }
  }

  window.ClashlyNotifications = {
    NOTIFICATIONS_TABLE,
    createNotification,
    fetchNotifications,
    markNotificationsRead,
    fetchUnreadCount,
  };
})();
