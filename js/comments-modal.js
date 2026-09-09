(function () {
  const DRAWER_ID = "comments-drawer";
  const UPDATE_EVENT = "clashly:take-updated";
  const BOOKMARK_UPDATE_EVENT = "clashly:take-bookmark-updated";

  let currentUserId = "";
  let currentTake = null;
  let currentTakeId = "";
  let currentComments = [];
  let currentCommentsCount = 0;
  let currentCommentsSort = "newest";
  let activeReplyTarget = null;
  let expandedReplyIds = new Set();
  let pendingCommentLikeIds = new Set();
  let activeCommentsChannel = null;
  let activeChannelTakeId = "";
  let unreadNewCommentsCount = 0;
  let dragState = {
    active: false,
    startY: 0,
    currentY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
  };

  function isDesktopLayout() {
    return window.matchMedia("(min-width: 980px)").matches;
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 640px)").matches;
  }

  function getDrawer() {
    return document.getElementById(DRAWER_ID);
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function buildMarkup() {
    return `
      <div id="${DRAWER_ID}" class="comments-drawer" hidden>
        <div class="comments-drawer__backdrop" data-close-comments-drawer="true"></div>
        <section class="comments-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="comments-drawer-title">
          <div class="comments-drawer__handle" aria-hidden="true"></div>
          <header class="comments-drawer__head">
            <div>
              <h2 id="comments-drawer-title">Comments</h2>
              <p><span id="comments-drawer-total">0</span> reactions in this debate.</p>
            </div>
            <button
              type="button"
              class="comments-drawer__close"
              data-close-comments-drawer="true"
              aria-label="Close comments drawer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </header>

          <div class="comments-drawer__layout">
            <section id="comments-drawer-stage" class="comments-drawer__stage">
              <section id="comments-drawer-take" class="comments-drawer__take"></section>
              <section id="comments-drawer-media" class="comments-drawer__media" hidden></section>
            </section>

            <section class="comments-drawer__discussion">
              <section class="comments-drawer__body">
                <div class="comments-shell">
                  <header class="comments-shell__head">
                    <label class="comments-sort comments-sort--compact" aria-label="Sort comments">
                      <span class="comments-sort__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path d="M4.75 6.5h14.5"></path>
                          <path d="M7.5 12h9"></path>
                          <path d="M10.25 17.5h3.5"></path>
                        </svg>
                      </span>
                      <span class="comments-sort__label">Sort comments</span>
                      <select id="comments-drawer-sort">
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                      </select>
                    </label>
                    <button type="button" id="comments-drawer-new-pill" class="comments-drawer__new-pill" hidden aria-live="polite">
                      <span class="comments-drawer__new-pill-icon" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                      </span>
                      <span id="comments-drawer-new-pill-text">1 new comment</span>
                    </button>
                  </header>

                  <p id="comments-drawer-state" class="comments-drawer__status feed-state" hidden></p>
                  <section id="comments-drawer-thread" class="comments-thread" aria-label="Take comments"></section>
                </div>
              </section>

              <div class="comments-drawer__composer">
                <form id="comments-drawer-form" class="comment-compose comment-compose--inline" novalidate>
                  <div class="comment-compose__replying" id="comments-drawer-replying" hidden>
                    <span id="comments-drawer-replying-text">Replying</span>
                    <button type="button" class="comment-compose__cancel" id="comments-drawer-cancel-reply">Cancel</button>
                  </div>
                  <div class="comment-compose__row">
                    <label class="comment-compose__field" for="comments-drawer-input">
                      <textarea
                        id="comments-drawer-input"
                        name="comment"
                        rows="1"
                        placeholder="Add a comment..."
                        required
                      ></textarea>
                    </label>
                    <button type="submit" class="btn btn--primary comment-compose__submit" id="comments-drawer-submit">Post</button>
                  </div>
                  <footer class="comment-compose__footer">
                    <span class="comment-compose__count" id="comments-drawer-count">0</span>
                  </footer>
                </form>
              </div>
            </section>
          </div>
        </section>
      </div>
    `;
  }

  function ensureDrawer() {
    if (getDrawer() || !document.body) return;
    document.body.insertAdjacentHTML("beforeend", buildMarkup());
  }

  function setDrawerState(message, type) {
    const stateEl = getEl("comments-drawer-state");
    if (!stateEl) return;
    stateEl.hidden = !message;
    stateEl.textContent = message || "";
    stateEl.classList.remove("is-error", "is-success");
    if (type === "error") stateEl.classList.add("is-error");
    if (type === "success") stateEl.classList.add("is-success");
  }

  function updateCountLabel() {
    const input = getEl("comments-drawer-input");
    const countEl = getEl("comments-drawer-count");
    if (!input || !countEl) return;
    countEl.textContent = String(input.value.length);
  }

  function autoSizeInput() {
    const input = getEl("comments-drawer-input");
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  }

  function syncComposerExpandedState() {
    const form = getEl("comments-drawer-form");
    const input = getEl("comments-drawer-input");
    if (!form || !input) return;
    const shouldExpand = document.activeElement === input || Boolean(input.value.trim()) || Boolean(activeReplyTarget);
    form.classList.toggle("comment-compose--expanded", shouldExpand);
  }

  function syncKeyboardOffset() {
    const drawer = getDrawer();
    if (!drawer) return;

    if (drawer.hidden || !isMobileViewport()) {
      drawer.style.setProperty("--comments-keyboard-offset", "0px");
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      drawer.style.setProperty("--comments-keyboard-offset", "0px");
      return;
    }

    const keyboardOffset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    drawer.style.setProperty("--comments-keyboard-offset", `${keyboardOffset}px`);
  }

  function keepComposerVisible() {
    const drawer = getDrawer();
    const input = getEl("comments-drawer-input");
    if (!drawer || drawer.hidden || !input) return;
    if (document.activeElement !== input) return;

    syncKeyboardOffset();
    window.requestAnimationFrame(() => {
      input.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });
  }

  function setReplyTarget(commentId, username) {
    activeReplyTarget = commentId ? { commentId, username } : null;
    const wrapper = getEl("comments-drawer-replying");
    const textEl = getEl("comments-drawer-replying-text");
    if (!wrapper || !textEl) return;

    if (!activeReplyTarget) {
      wrapper.hidden = true;
      textEl.textContent = "";
      syncComposerExpandedState();
      return;
    }

    wrapper.hidden = false;
    textEl.textContent = `Replying to ${username}`;
    syncComposerExpandedState();
  }

  function resetComposer() {
    const input = getEl("comments-drawer-input");
    if (input) {
      input.value = "";
    }
    updateCountLabel();
    autoSizeInput();
    setReplyTarget("", "");
    syncComposerExpandedState();
  }

  function updateTotals() {
    const totalEls = [getEl("comments-drawer-total"), getEl("comments-drawer-thread-total")];
    totalEls.forEach((el) => {
      if (el) el.textContent = String(currentCommentsCount);
    });
  }

  function renderTake() {
    const streamEl = getEl("comments-drawer-take");
    const stageEl = getEl("comments-drawer-stage");
    const mediaEl = getEl("comments-drawer-media");
    if (!streamEl || !window.ClashlyTakeRenderer) return;
    const imageUrls =
      currentTake && Array.isArray(currentTake.image_urls) && currentTake.image_urls.length
        ? currentTake.image_urls.slice(0, 2)
        : currentTake && currentTake.image_url
          ? [currentTake.image_url]
          : [];
    const showMedia = isDesktopLayout() && imageUrls.length > 0;

    const takeForPreview =
      currentTake && imageUrls.length
        ? {
            ...currentTake,
            image_url: "",
            image_urls: [],
          }
        : currentTake;

    window.ClashlyTakeRenderer.renderTakeList(streamEl, takeForPreview ? [takeForPreview] : [], {
      currentUserId,
      hideCommentsAction: true,
      hideShareAction: true,
      hideActionRow: true,
    });

    if (stageEl) {
      stageEl.classList.toggle("comments-drawer__stage--media", showMedia);
    }

    if (mediaEl) {
      if (showMedia) {
        const username = currentTake.profile && currentTake.profile.username ? String(currentTake.profile.username) : "clashe";
        mediaEl.hidden = false;
        mediaEl.innerHTML =
          imageUrls.length === 1
            ? `
              <div class="comments-drawer__media-frame">
                <img src="${window.ClashlyUtils.escapeHtml(imageUrls[0])}" alt="${window.ClashlyUtils.escapeHtml(
                  username
                )} take image" decoding="async" />
              </div>
            `
            : `
              <div class="comments-drawer__media-frame comments-drawer__media-frame--split">
                ${imageUrls
                  .map(
                    (imageUrl, index) => `
                      <div class="comments-drawer__media-slot">
                        <img
                          src="${window.ClashlyUtils.escapeHtml(imageUrl)}"
                          alt="${window.ClashlyUtils.escapeHtml(username)} take image ${index + 1}"
                          decoding="async"
                        />
                      </div>
                    `
                  )
                  .join("")}
              </div>
            `;
      } else {
        mediaEl.hidden = true;
        mediaEl.innerHTML = "";
      }
    }

    window.ClashlyTakeRenderer.bindShareActions(streamEl, {
      onStatus: setDrawerState,
      onShare: handleShareOpen,
    });
    window.ClashlyTakeRenderer.bindVoteActions(streamEl, {
      onStatus: setDrawerState,
      onVote: handleVote,
    });
    window.ClashlyTakeRenderer.bindBookmarkActions(streamEl, {
      onStatus: setDrawerState,
      onBookmark: handleBookmark,
    });
  }

  function renderComments() {
    const threadEl = getEl("comments-drawer-thread");
    if (!threadEl || !window.ClashlyCommentsRenderer) return;

    window.ClashlyCommentsRenderer.renderCommentThread(threadEl, currentComments, {
      currentUserId,
      expandedReplyIds,
      takeAuthorId: currentTake ? currentTake.user_id : "",
    });
  }

  function syncTakeState() {
    const streamEl = getEl("comments-drawer-take");
    if (!streamEl || !currentTake || !window.ClashlyTakeRenderer || typeof window.ClashlyTakeRenderer.syncTakeState !== "function") return;
    window.ClashlyTakeRenderer.syncTakeState(streamEl, currentTake);
  }

  function escapeCommentSelector(commentId) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(commentId || ""));
    }
    return String(commentId || "").replace(/"/g, '\\"');
  }

  function syncCommentLikeButton(commentId, isDisabled) {
    const threadEl = getEl("comments-drawer-thread");
    const targetComment = findCommentById(currentComments, commentId);
    if (!threadEl || !targetComment) return;

    const likeButton = threadEl.querySelector(
      `[data-comment-id="${escapeCommentSelector(commentId)}"] [data-action='toggle-like-comment']`
    );
    if (!(likeButton instanceof HTMLElement)) return;

    const likedByMe = Boolean(targetComment.liked_by_me);
    const likeCount = Math.max(0, Number(targetComment.like_count || 0));
    const likeLabel = likedByMe ? "Unlike comment" : "Like comment";
    likeButton.classList.toggle("is-active", likedByMe);
    likeButton.setAttribute("data-liked", likedByMe ? "true" : "false");
    likeButton.setAttribute("aria-pressed", likedByMe ? "true" : "false");
    likeButton.setAttribute("aria-label", likeLabel);
    likeButton.setAttribute("title", likeLabel);
    if (isDisabled) {
      likeButton.setAttribute("disabled", "true");
    } else {
      likeButton.removeAttribute("disabled");
    }

    const countEl = likeButton.querySelector(".comment-action__count");
    if (countEl) {
      countEl.textContent = likeCount.toLocaleString();
    }
  }

  function findCommentById(items, commentId) {
    for (const item of items || []) {
      if (item.id === commentId) return item;
      const nested = findCommentById(item.replies || [], commentId);
      if (nested) return nested;
    }
    return null;
  }

  function applyCommentLikeState(commentId, liked, delta) {
    if (!window.ClashlyComments || !commentId) return;
    currentComments = window.ClashlyComments.applyCommentLikeState(currentComments, {
      commentId,
      liked,
      delta,
    });
    syncCommentLikeButton(commentId);
  }

  async function loadComments(options) {
    if (!currentTakeId || !window.ClashlyComments) return;

    const skipSkeleton = Boolean(options && options.skipSkeleton);
    const threadEl = getEl("comments-drawer-thread");
    if (!skipSkeleton && threadEl && currentComments.length === 0 && typeof window.clasheShowCommentsSkeleton === "function") {
      window.clasheShowCommentsSkeleton(threadEl, 4);
    }

    setDrawerState("", "");
    try {
      const result = await window.ClashlyComments.fetchCommentsByTake(currentTakeId, {
        sort: currentCommentsSort,
        currentUserId,
      });

      if (result.error) throw result.error;

      currentComments = result.comments || [];
      currentCommentsCount = result.count || 0;
      updateTotals();
      renderComments();
      setDrawerState("", "");
    } catch (error) {
      if (threadEl && currentComments.length === 0) {
        threadEl.innerHTML = "";
      }
      setDrawerState(window.ClashlyUtils.reportError("Comments drawer load failed.", error, "Could not load comments."), "error");
    }
  }

  function countCommentDescendants(replies) {
    if (!Array.isArray(replies) || !replies.length) return 0;
    let count = replies.length;
    for (const reply of replies) {
      count += countCommentDescendants(reply.replies);
    }
    return count;
  }

  function removeCommentById(items, commentId) {
    let removedCount = 0;
    function filterTree(list) {
      const nextList = [];
      for (const item of list || []) {
        if (item.id === commentId) {
          removedCount += 1 + countCommentDescendants(item.replies);
        } else {
          const nextReplies = item.replies && item.replies.length ? filterTree(item.replies) : [];
          nextList.push({
            ...item,
            replies: nextReplies,
          });
        }
      }
      return nextList;
    }
    const nextItems = filterTree(items);
    return { nextItems, removedCount };
  }

  function getScrollContainer() {
    const drawer = getDrawer();
    return drawer ? drawer.querySelector(".comments-drawer__body") : null;
  }

  function isUserScrolledDown() {
    const bodyEl = getScrollContainer();
    if (!bodyEl) return false;
    return bodyEl.scrollTop > 80;
  }

  function preserveScrollDuring(fn) {
    const bodyEl = getScrollContainer();
    if (!bodyEl) {
      fn();
      return;
    }
    const prevScrollTop = bodyEl.scrollTop;
    const prevScrollHeight = bodyEl.scrollHeight;
    fn();
    if (prevScrollTop > 20) {
      const heightDelta = bodyEl.scrollHeight - prevScrollHeight;
      if (heightDelta !== 0) {
        bodyEl.scrollTop = prevScrollTop + heightDelta;
      }
    }
  }

  function updateNewCommentPill() {
    const pill = getEl("comments-drawer-new-pill");
    const text = getEl("comments-drawer-new-pill-text");
    if (!pill || !text) return;
    if (unreadNewCommentsCount > 0) {
      text.textContent = `${unreadNewCommentsCount} new ${unreadNewCommentsCount === 1 ? "comment" : "comments"}`;
      pill.hidden = false;
    } else {
      pill.hidden = true;
    }
  }

  function clearNewCommentPill() {
    unreadNewCommentsCount = 0;
    const pill = getEl("comments-drawer-new-pill");
    if (pill) pill.hidden = true;
  }

  function scrollToNewComments() {
    const bodyEl = getScrollContainer();
    if (!bodyEl) return;
    bodyEl.scrollTo({ top: 0, behavior: "smooth" });
    clearNewCommentPill();
  }

  async function handleRealtimeInsert(rawRow) {
    if (!rawRow || !rawRow.id) return;
    if (!currentTakeId || rawRow.take_id !== currentTakeId) return;

    // Deduplicate against already rendered or optimistic comment
    if (findCommentById(currentComments, rawRow.id)) return;

    let profile = null;
    if (rawRow.user_id && window.ClashlyComments && typeof window.ClashlyComments.fetchProfilesByIds === "function") {
      try {
        const profileRes = await window.ClashlyComments.fetchProfilesByIds([rawRow.user_id]);
        if (profileRes && Array.isArray(profileRes.profiles) && profileRes.profiles.length > 0) {
          profile = profileRes.profiles[0];
        }
      } catch (_) {}
    }

    // Re-check take and dedupe in case state changed during profile fetch
    if (!currentTakeId || rawRow.take_id !== currentTakeId) return;
    if (findCommentById(currentComments, rawRow.id)) return;

    const newComment = {
      id: rawRow.id,
      user_id: rawRow.user_id,
      take_id: rawRow.take_id,
      parent_id: rawRow.parent_id || null,
      content: rawRow.content,
      created_at: rawRow.created_at,
      profile,
      is_owner: Boolean(currentUserId && rawRow.user_id === currentUserId),
      like_count: 0,
      liked_by_me: false,
      replies: [],
    };

    const isScrolledDown = isUserScrolledDown();

    if (rawRow.parent_id) {
      const parent = findCommentById(currentComments, rawRow.parent_id);
      if (parent) {
        if (!Array.isArray(parent.replies)) {
          parent.replies = [];
        }
        if (currentCommentsSort === "oldest") {
          parent.replies.push(newComment);
        } else {
          parent.replies.unshift(newComment);
        }
        if (newComment.is_owner) {
          expandedReplyIds.add(parent.id);
        }
      } else {
        if (currentCommentsSort === "oldest") {
          currentComments.push(newComment);
        } else {
          currentComments.unshift(newComment);
        }
      }
    } else {
      if (currentCommentsSort === "oldest") {
        currentComments.push(newComment);
      } else {
        currentComments.unshift(newComment);
      }
    }

    currentCommentsCount++;
    updateTotals();
    window.dispatchEvent(
      new CustomEvent(UPDATE_EVENT, {
        detail: {
          takeId: currentTakeId,
          commentCount: currentCommentsCount,
        },
      })
    );

    if (currentCommentsSort === "newest" && !rawRow.parent_id && isScrolledDown && !newComment.is_owner) {
      unreadNewCommentsCount++;
      updateNewCommentPill();
      preserveScrollDuring(renderComments);
    } else {
      if (newComment.is_owner) {
        clearNewCommentPill();
      }
      preserveScrollDuring(renderComments);
    }
  }

  function handleRealtimeUpdate(rawRow) {
    if (!rawRow || !rawRow.id) return;
    if (!currentTakeId || rawRow.take_id !== currentTakeId) return;
    const existing = findCommentById(currentComments, rawRow.id);
    if (!existing) return;
    existing.content = rawRow.content;
    preserveScrollDuring(renderComments);
  }

  function handleRealtimeDelete(oldRow) {
    if (!oldRow || !oldRow.id) return;
    const { nextItems, removedCount } = removeCommentById(currentComments, oldRow.id);
    if (removedCount > 0) {
      currentComments = nextItems;
      currentCommentsCount = Math.max(0, currentCommentsCount - removedCount);
      updateTotals();
      window.dispatchEvent(
        new CustomEvent(UPDATE_EVENT, {
          detail: {
            takeId: currentTakeId,
            commentCount: currentCommentsCount,
          },
        })
      );
      preserveScrollDuring(renderComments);
    }
  }

  function unsubscribeRealtimeComments() {
    if (activeCommentsChannel) {
      try {
        const client = window.ClashlySupabase && typeof window.ClashlySupabase.getClient === "function"
          ? window.ClashlySupabase.getClient()
          : null;
        if (client && typeof client.removeChannel === "function") {
          client.removeChannel(activeCommentsChannel);
        } else if (typeof activeCommentsChannel.unsubscribe === "function") {
          activeCommentsChannel.unsubscribe();
        }
      } catch (err) {
        console.warn("[Clashly] Error unsubscribing realtime comments:", err);
      }
      activeCommentsChannel = null;
    }
    activeChannelTakeId = "";
  }

  function subscribeRealtimeComments(takeId) {
    unsubscribeRealtimeComments();
    if (!takeId || !window.ClashlySupabase) return;

    const client = window.ClashlySupabase.getClient();
    if (!client || typeof client.channel !== "function") return;

    try {
      const channelName = `comments-take-${takeId}-${Date.now()}`;
      activeChannelTakeId = takeId;
      activeCommentsChannel = client
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "comments",
            filter: `take_id=eq.${takeId}`,
          },
          (payload) => {
            if (!payload || !payload.eventType) return;
            if (payload.eventType === "INSERT") {
              handleRealtimeInsert(payload.new);
            } else if (payload.eventType === "UPDATE") {
              handleRealtimeUpdate(payload.new);
            } else if (payload.eventType === "DELETE") {
              handleRealtimeDelete(payload.old);
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("[Clashly] Error subscribing to realtime comments:", err);
    }
  }

  async function loadCommentsSilently() {
    if (!currentTakeId || !window.ClashlyComments) return;
    try {
      const result = await window.ClashlyComments.fetchCommentsByTake(currentTakeId, {
        sort: currentCommentsSort,
        currentUserId,
      });
      if (result.error) return;
      currentComments = result.comments || [];
      currentCommentsCount = result.count || 0;
      updateTotals();
      preserveScrollDuring(renderComments);
    } catch (_) {}
  }

  async function ensureTakeLoaded(takeId) {
    // If the caller already handed us a full take (the common case — they
    // tapped "comment" from a card the feed already rendered with vote
    // counts, images, everything), skip re-fetching the exact same take
    // from the network before the drawer can show anything. Vote/comment
    // counts on it may be a few seconds stale, which is an acceptable
    // trade for not making the drawer wait on a redundant round trip for
    // data we already have in hand.
    if (currentTake && currentTake.id === takeId) return;

    const result = await window.ClashlyTakes.fetchTakeById(takeId, {
      currentUserId,
    });
    if (result.error) throw result.error;
    currentTake = result.take || null;
  }

  async function handleVote(input) {
    if (!currentUserId) {
      setDrawerState("Please log in to vote.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    if (!currentTake || currentTake.vote_loading) return;
    const previousVote = currentTake.vote || null;
    const optimisticVote =
      window.ClashlyTakes && typeof window.ClashlyTakes.previewVoteSummary === "function"
        ? window.ClashlyTakes.previewVoteSummary(previousVote, input.voteType)
        : previousVote;
    currentTake = {
      ...currentTake,
      vote_loading: true,
      vote: optimisticVote || currentTake.vote,
    };
    syncTakeState();

    try {
      const voteResult = await window.ClashlyTakes.submitVote({
        userId: currentUserId,
        takeId: input.takeId,
        voteType: input.voteType,
        currentVote: previousVote ? previousVote.user_vote : "",
      });

      if (voteResult.error) throw voteResult.error;

      const reconciledVote =
        window.ClashlyTakes && typeof window.ClashlyTakes.resolveSubmittedVoteSummary === "function"
          ? window.ClashlyTakes.resolveSubmittedVoteSummary(optimisticVote, voteResult.vote)
          : optimisticVote || voteResult.vote;
      currentTake = {
        ...currentTake,
        vote_loading: false,
        vote: reconciledVote || currentTake.vote,
      };
      syncTakeState();
      setDrawerState("", "");
      window.dispatchEvent(
        new CustomEvent(UPDATE_EVENT, {
          detail: {
            takeId: currentTake.id,
            vote: reconciledVote || currentTake.vote,
          },
        })
      );
    } catch (error) {
      currentTake = {
        ...currentTake,
        vote_loading: false,
        vote: previousVote,
      };
      syncTakeState();
      throw error;
    }
  }

  async function handleBookmark(input) {
    if (!currentUserId) {
      setDrawerState("Please log in to save takes.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    if (!currentTake) return;

    const previousBookmarked = Boolean(currentTake.bookmarked);
    currentTake = {
      ...currentTake,
      bookmarked: !previousBookmarked,
    };
    syncTakeState();

    const result = await window.ClashlyTakes.toggleBookmark({
      userId: currentUserId,
      takeId: input.takeId,
      isBookmarked: input.isBookmarked,
    });

    if (result.error) {
      currentTake = {
        ...currentTake,
        bookmarked: previousBookmarked,
      };
      syncTakeState();
      throw result.error;
    }

    if (result.bookmarked && currentTake && window.ClashlyNotifications) {
      window.ClashlyNotifications.createNotification({
        userId: currentTake.user_id,
        actorId: currentUserId,
        type: "bookmark",
        targetId: currentTake.id,
        targetTakeId: currentTake.id,
      }).catch(() => {});
    }

    currentTake = {
      ...currentTake,
      bookmarked: result.bookmarked,
    };
    syncTakeState();
    setDrawerState("", "");
    window.dispatchEvent(
      new CustomEvent(BOOKMARK_UPDATE_EVENT, {
        detail: {
          takeId: currentTake.id,
          bookmarked: result.bookmarked,
        },
      })
    );
  }

  function handleShareOpen(input) {
    if (window.ClashlyShareModal) {
      window.ClashlyShareModal.open({
        take: currentTake,
      });
      return;
    }

    window.ClashlyUtils.copyText(input.shareUrl)
      .then(() => setDrawerState("", ""))
      .catch((error) => setDrawerState(window.ClashlyUtils.reportError("Fallback share failed.", error, "Could not copy link."), "error"));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!currentTakeId) return;
    if (!currentUserId) {
      setDrawerState("Please log in to comment.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    const input = getEl("comments-drawer-input");
    const submitBtn = getEl("comments-drawer-submit");
    if (!input || !submitBtn) return;

    submitBtn.disabled = true;
    submitBtn.textContent = activeReplyTarget ? "Replying..." : "Posting...";

    try {
      const createResult = await window.ClashlyComments.createComment({
        userId: currentUserId,
        takeId: currentTakeId,
        parentId: activeReplyTarget ? activeReplyTarget.commentId : "",
        content: input.value,
      });

      if (createResult.error) throw createResult.error;
      const createdComment = createResult.comment || null;
      const replyTarget = activeReplyTarget ? findCommentById(currentComments, activeReplyTarget.commentId) : null;
      const notificationTargetUserId = replyTarget ? replyTarget.user_id : currentTake.user_id;
      const notificationType = replyTarget ? "reply" : "comment";
      if (activeReplyTarget && activeReplyTarget.commentId) {
        expandedReplyIds.add(activeReplyTarget.commentId);
      }

      input.value = "";
      updateCountLabel();
      autoSizeInput();
      setReplyTarget("", "");
      setDrawerState("", "");
      await loadComments();

      if (window.ClashlyNotifications && notificationTargetUserId) {
        window.ClashlyNotifications.createNotification({
          userId: notificationTargetUserId,
          actorId: currentUserId,
          type: notificationType,
          targetId: currentTake.id,
          targetTakeId: currentTake.id,
          targetCommentId: createdComment && createdComment.id ? createdComment.id : "",
        }).catch(() => {});
      }
    } catch (error) {
      setDrawerState(window.ClashlyUtils.reportError("Comment post failed.", error, "Could not post comment."), "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Post";
    }
  }

  async function handleThreadClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const input = getEl("comments-drawer-input");

    const replyButton = target.closest("[data-action='reply']");
    if (replyButton && input) {
      const commentId = replyButton.getAttribute("data-comment-id") || "";
      const username = replyButton.getAttribute("data-comment-user") || "user";
      setReplyTarget(commentId, username);
      expandedReplyIds.add(commentId);
      input.focus();
      return;
    }

    const toggleRepliesButton = target.closest("[data-action='toggle-replies']");
    if (toggleRepliesButton) {
      const commentId = toggleRepliesButton.getAttribute("data-comment-id") || "";
      if (!commentId) return;
      if (expandedReplyIds.has(commentId)) {
        expandedReplyIds.delete(commentId);
      } else {
        expandedReplyIds.add(commentId);
      }
      renderComments();
      return;
    }

    const likeButton = target.closest("[data-action='toggle-like-comment']");
    if (likeButton) {
      const commentId = likeButton.getAttribute("data-comment-id") || "";
      if (!commentId) return;
      if (pendingCommentLikeIds.has(commentId)) return;
      const targetComment = findCommentById(currentComments, commentId);

      if (!currentUserId) {
        setDrawerState("Please log in to like comments.", "error");
        window.setTimeout(() => {
          window.location.replace("auth.html");
        }, 250);
        return;
      }

      const wasLiked = likeButton.getAttribute("data-liked") === "true";
      const optimisticLiked = !wasLiked;
      const optimisticDelta = wasLiked ? -1 : 1;
      pendingCommentLikeIds.add(commentId);
      applyCommentLikeState(commentId, optimisticLiked, optimisticDelta);
      syncCommentLikeButton(commentId, false);
      try {
        const likeResult = await window.ClashlyComments.toggleCommentLike({
          commentId,
          userId: currentUserId,
          isLiked: wasLiked,
        });

        if (likeResult.error) throw likeResult.error;

        const likeDeltaAdjustment = Number(likeResult.delta || 0) - optimisticDelta;
        if (likeResult.liked !== optimisticLiked || likeDeltaAdjustment !== 0) {
          applyCommentLikeState(commentId, likeResult.liked, likeDeltaAdjustment);
        }
        syncCommentLikeButton(commentId, false);
        setDrawerState("", "");

        if (
          likeResult.liked &&
          targetComment &&
          targetComment.user_id &&
          targetComment.user_id !== currentUserId &&
          window.ClashlyNotifications
        ) {
          window.ClashlyNotifications.createNotification({
            userId: targetComment.user_id,
            actorId: currentUserId,
            type: "comment_like",
            targetId: commentId,
            targetTakeId: targetComment.take_id || currentTake.id,
            targetCommentId: commentId,
          }).catch(() => {});
        }
      } catch (error) {
        applyCommentLikeState(commentId, wasLiked, -optimisticDelta);
        syncCommentLikeButton(commentId, false);
        setDrawerState(window.ClashlyUtils.reportError("Comment like toggle failed.", error, "Could not update comment like."), "error");
      } finally {
        pendingCommentLikeIds.delete(commentId);
      }
      return;
    }

    const deleteButton = target.closest("[data-action='delete-comment']");
    if (!deleteButton || !currentUserId) return;

    const commentId = deleteButton.getAttribute("data-comment-id") || "";
    if (!commentId) return;

    deleteButton.setAttribute("disabled", "true");
    try {
      const deleteResult = await window.ClashlyComments.deleteComment({
        commentId,
        userId: currentUserId,
      });

      if (deleteResult.error) throw deleteResult.error;
      if (activeReplyTarget && activeReplyTarget.commentId === commentId) {
        setReplyTarget("", "");
      }

      setDrawerState("", "");
      await loadComments();
    } catch (error) {
      deleteButton.removeAttribute("disabled");
      setDrawerState(window.ClashlyUtils.reportError("Comment delete failed.", error, "Could not delete comment."), "error");
    }
  }

  function openDrawerShell() {
    const drawer = getDrawer();
    if (!drawer) return;
    drawer.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      drawer.classList.add("is-open");
      syncKeyboardOffset();
    });
  }

  function close() {
    unsubscribeRealtimeComments();
    clearNewCommentPill();
    currentTakeId = "";
    currentTake = null;
    currentComments = [];
    currentCommentsCount = 0;
    const drawer = getDrawer();
    if (!drawer) return;
    const panel = drawer.querySelector(".comments-drawer__panel");
    const backdrop = drawer.querySelector(".comments-drawer__backdrop");
    if (panel instanceof HTMLElement) {
      panel.classList.remove("is-dragging");
      panel.style.transform = "";
    }
    if (backdrop instanceof HTMLElement) {
      backdrop.style.opacity = "";
    }
    dragState.active = false;
    dragState.startY = 0;
    dragState.currentY = 0;
    resetComposer();
    drawer.classList.remove("is-open");
    drawer.style.setProperty("--comments-keyboard-offset", "0px");
    document.body.style.overflow = "";
    window.setTimeout(() => {
      drawer.hidden = true;
    }, 260);
  }

  function setDragOffset(offset) {
    const drawer = getDrawer();
    if (!drawer) return;
    const panel = drawer.querySelector(".comments-drawer__panel");
    const backdrop = drawer.querySelector(".comments-drawer__backdrop");
    if (!(panel instanceof HTMLElement) || !(backdrop instanceof HTMLElement)) return;

    const safeOffset = Math.max(0, offset);
    panel.style.transform = `translateY(${safeOffset}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - safeOffset / 320));
  }

  function beginDrag(pointerY) {
    if (isDesktopLayout()) return;
    const drawer = getDrawer();
    if (!drawer || drawer.hidden) return;
    const panel = drawer.querySelector(".comments-drawer__panel");
    if (!(panel instanceof HTMLElement)) return;

    dragState.active = true;
    dragState.startY = pointerY;
    dragState.currentY = 0;
    dragState.lastY = pointerY;
    dragState.lastTime = Date.now();
    dragState.velocity = 0;
    panel.classList.add("is-dragging");
  }

  function updateDrag(pointerY) {
    if (isDesktopLayout()) return;
    if (!dragState.active) return;
    const now = Date.now();
    const deltaY = pointerY - dragState.lastY;
    const deltaTime = Math.max(1, now - dragState.lastTime);
    dragState.velocity = deltaY / deltaTime;
    dragState.lastY = pointerY;
    dragState.lastTime = now;
    dragState.currentY = Math.max(0, pointerY - dragState.startY);
    setDragOffset(dragState.currentY);
  }

  function endDrag() {
    if (isDesktopLayout()) return;
    const drawer = getDrawer();
    if (!drawer) return;
    const panel = drawer.querySelector(".comments-drawer__panel");
    const shouldClose = dragState.currentY > 140 || dragState.velocity > 0.7;

    dragState.active = false;
    dragState.startY = 0;
    dragState.lastY = 0;
    dragState.lastTime = 0;

    if (panel instanceof HTMLElement) {
      panel.classList.remove("is-dragging");
    }

    if (shouldClose) {
      close();
      return;
    }

    dragState.currentY = 0;
    dragState.velocity = 0;
    setDragOffset(0);
  }

  async function open(options) {
    ensureDrawer();
    unsubscribeRealtimeComments();
    clearNewCommentPill();

    currentTakeId = options && options.takeId ? options.takeId : "";
    currentTake = options && options.take ? options.take : null;
    currentUserId = options && options.currentUserId ? options.currentUserId : "";
    currentComments = [];
    currentCommentsCount = 0;
    currentCommentsSort = "newest";
    activeReplyTarget = null;
    expandedReplyIds = new Set();
    resetComposer();
    updateTotals();
    openDrawerShell();

    const threadEl = getEl("comments-drawer-thread");
    if (threadEl && typeof window.clasheShowCommentsSkeleton === "function") {
      window.clasheShowCommentsSkeleton(threadEl, 4);
    }

    try {
      if (!currentUserId && window.ClashlySession) {
        const sessionState = await window.ClashlySession.resolveSession();
        currentUserId = sessionState.user ? sessionState.user.id : "";
      }

      // ensureTakeLoaded resolves instantly when the caller already passed
      // a full take (see its comment above) and only awaits the network
      // when it genuinely has to — either way, render the take as soon as
      // it's ready and kick off the comment fetch at the same time rather
      // than waiting for the take render to finish first, since the two
      // don't depend on each other.
      const takePromise = ensureTakeLoaded(currentTakeId).then(renderTake);
      const commentsPromise = loadComments();
      await Promise.all([takePromise, commentsPromise]);

      const sortSelect = getEl("comments-drawer-sort");
      if (sortSelect) sortSelect.value = currentCommentsSort;
      updateCountLabel();
      autoSizeInput();
      syncComposerExpandedState();
      syncKeyboardOffset();

      subscribeRealtimeComments(currentTakeId);
    } catch (error) {
      setDrawerState(window.ClashlyUtils.reportError("Comments drawer open failed.", error, "Could not load comments."), "error");
    }
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const closeTrigger = target.closest("[data-close-comments-drawer='true']");
      if (closeTrigger) {
        event.preventDefault();
        close();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && getDrawer() && !getDrawer().hidden) {
        close();
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const pill = target.closest("#comments-drawer-new-pill");
      if (pill) {
        event.preventDefault();
        scrollToNewComments();
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest("[data-action='comments']");
      if (!trigger) return;

      if (event.defaultPrevented) return;

      const takeId = trigger.getAttribute("data-take-id");
      if (!takeId) return;

      event.preventDefault();
      open({ takeId });
    });

    document.addEventListener(
      "scroll",
      (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.classList.contains("comments-drawer__body")) {
          if (target.scrollTop < 30 && unreadNewCommentsCount > 0) {
            clearNewCommentPill();
          }
        }
      },
      { passive: true, capture: true }
    );

    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const handle = target.closest(".comments-drawer__handle, .comments-drawer__head");
      if (!handle) return;
      if (target.closest("button, input, textarea, select, a")) return;
      beginDrag(event.clientY);
    });

    document.addEventListener("pointermove", (event) => {
      if (!dragState.active) return;
      updateDrag(event.clientY);
    });

    document.addEventListener("pointerup", () => {
      if (!dragState.active) return;
      endDrag();
    });

    document.addEventListener("pointercancel", () => {
      if (!dragState.active) return;
      endDrag();
    });

    document.addEventListener("submit", (event) => {
      if (event.target && event.target.id === "comments-drawer-form") {
        handleSubmit(event);
      }
    });

    document.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || target.id !== "comments-drawer-sort") return;
      clearNewCommentPill();
      currentCommentsSort = target.value === "oldest" ? "oldest" : "newest";
      await loadComments();
    });

    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const thread = target.closest("#comments-drawer-thread");
      if (!thread) return;
      await handleThreadClick(event);
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const cancelBtn = target.closest("#comments-drawer-cancel-reply");
      if (!cancelBtn) return;
      event.preventDefault();
      setReplyTarget("", "");
      const input = getEl("comments-drawer-input");
      if (input) input.focus();
    });

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement) || target.id !== "comments-drawer-input") return;
      updateCountLabel();
      autoSizeInput();
      syncComposerExpandedState();
      keepComposerVisible();
    });

    document.addEventListener("focusin", (event) => {
      if (event.target instanceof HTMLElement && event.target.id === "comments-drawer-input") {
        syncComposerExpandedState();
        window.setTimeout(keepComposerVisible, 120);
      }
    });

    document.addEventListener("focusout", (event) => {
      if (event.target instanceof HTMLElement && event.target.id === "comments-drawer-input") {
        window.setTimeout(() => {
          syncComposerExpandedState();
          syncKeyboardOffset();
        }, 0);
      }
    });

    window.addEventListener("resize", () => {
      const drawer = getDrawer();
      if (!drawer || drawer.hidden || !currentTake) return;
      syncKeyboardOffset();
      renderTake();
    });

    if (window.visualViewport) {
      const handleViewportChange = () => {
        const drawer = getDrawer();
        if (!drawer || drawer.hidden) return;
        syncKeyboardOffset();
        keepComposerVisible();
      };
      window.visualViewport.addEventListener("resize", handleViewportChange);
      window.visualViewport.addEventListener("scroll", handleViewportChange);
    }

    window.addEventListener("online", () => {
      const drawer = getDrawer();
      if (drawer && !drawer.hidden && currentTakeId) {
        loadCommentsSilently();
        if (!activeCommentsChannel) {
          subscribeRealtimeComments(currentTakeId);
        }
      }
    });
  }

  function boot() {
    ensureDrawer();
    bindEvents();
  }

  window.ClashlyCommentsModal = {
    open,
    close,
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
