(function () {
  const AI_JUDGE_MIN_VOTES = 20;
  const AI_JUDGE_MIN_COMMENTS = 6;

  let currentUserId = "";
  let currentTake = null;
  let currentComments = [];
  let currentCommentsCount = 0;
  let currentCommentsSort = "newest";
  let activeReplyTarget = null;
  let expandedReplyIds = new Set();
  let pendingCommentLikeIds = new Set();
  let pendingCommentFocusId = "";
  let isSearchEntry = false;
  let aiJudgeLoading = false;
  let aiJudgeBound = false;

  function getAiJudgeElements() {
    return {
      trigger: document.getElementById("ai-judge-trigger"),
      status: document.getElementById("ai-judge-status"),
      loading: document.getElementById("ai-judge-loading"),
      result: document.getElementById("ai-judge-result"),
    };
  }

  function setSearchEntryMode(isEnabled) {
    isSearchEntry = Boolean(isEnabled);
    document.documentElement.classList.toggle("take-page--from-search", isSearchEntry);
    document.body.classList.toggle("take-page--from-search", isSearchEntry);

    const aiJudgePanel = document.getElementById("ai-judge-panel");
    if (aiJudgePanel) {
      aiJudgePanel.hidden = isSearchEntry;
    }

    const commentsShell = document.querySelector(".comments-shell");
    if (commentsShell instanceof HTMLElement) {
      commentsShell.hidden = isSearchEntry;
    }
  }

  function setAiJudgeStatus(message, type) {
    const { status } = getAiJudgeElements();
    if (!status) return;

    status.hidden = !message;
    status.textContent = message || "";
    status.classList.remove("is-error");
    if (type === "error") status.classList.add("is-error");
  }

  function ensureAiJudgeReasonModal() {
    let modal = document.getElementById("ai-judge-reason-modal");
    if (modal) return modal;

    modal = document.createElement("section");
    modal.id = "ai-judge-reason-modal";
    modal.className = "ai-judge-reason-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="ai-judge-reason-modal__backdrop" data-close-ai-judge-reason="true"></div>
      <article class="ai-judge-reason-modal__panel" role="dialog" aria-modal="true" aria-labelledby="ai-judge-reason-title">
        <h3 id="ai-judge-reason-title" class="ai-judge-reason-modal__title">AI Judge unavailable</h3>
        <p id="ai-judge-reason-text" class="ai-judge-reason-modal__text"></p>
        <div class="ai-judge-reason-modal__actions">
          <button type="button" class="btn btn--ghost" data-close-ai-judge-reason="true">Got it</button>
        </div>
      </article>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function closeAiJudgeReasonModal() {
    const modal = document.getElementById("ai-judge-reason-modal");
    if (!modal) return;
    modal.hidden = true;
  }

  function openAiJudgeReasonModal(message) {
    const modal = ensureAiJudgeReasonModal();
    const textEl = modal.querySelector("#ai-judge-reason-text");
    if (textEl) {
      textEl.textContent = String(message || "AI Judge cannot analyze this take yet.");
    }
    modal.hidden = false;
  }

  function bindAiJudgeReasonModal() {
    const modal = ensureAiJudgeReasonModal();
    modal.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-close-ai-judge-reason='true']")) {
        closeAiJudgeReasonModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) {
        closeAiJudgeReasonModal();
      }
    });
  }

  function setAiJudgeLoading(isLoading) {
    aiJudgeLoading = Boolean(isLoading);
    const { trigger, loading } = getAiJudgeElements();
    if (loading) {
      loading.hidden = !aiJudgeLoading;
      loading.setAttribute("aria-hidden", aiJudgeLoading ? "false" : "true");
    }
    if (trigger) {
      trigger.disabled = aiJudgeLoading || !currentTake || !window.ClashlyAiJudge;
      trigger.textContent = aiJudgeLoading ? "Analyzing..." : "Analyze with AI Judge";
    }
  }

  function clearAiJudgeResult() {
    const { result } = getAiJudgeElements();
    if (!result) return;
    result.hidden = true;
    result.innerHTML = "";
  }

  function setInlineAiJudgeState(judgeState) {
    if (!currentTake) return;
    currentTake = {
      ...currentTake,
      ai_judge: judgeState,
    };
    renderTake();
  }

  function getTakeVoteStats() {
    const vote = currentTake && currentTake.vote ? currentTake.vote : {};
    return {
      agreeVotes: Number(vote.agree_count || 0),
      disagreeVotes: Number(vote.disagree_count || 0),
      totalVotes: Number(vote.total_votes || 0),
    };
  }

  function evaluateLocalAiJudgeEligibility() {
    const voteStats = getTakeVoteStats();
    const hasBothSides = voteStats.agreeVotes > 0 && voteStats.disagreeVotes > 0;
    if (voteStats.totalVotes < AI_JUDGE_MIN_VOTES || currentCommentsCount < AI_JUDGE_MIN_COMMENTS) {
      return {
        eligible: false,
        reason: `Not enough debate yet for AI Judge. It unlocks at ${AI_JUDGE_MIN_VOTES}+ votes and ${AI_JUDGE_MIN_COMMENTS}+ comments.`,
      };
    }

    if (!hasBothSides) {
      return {
        eligible: false,
        reason: "AI Judge needs both agree and disagree sides represented before analyzing.",
      };
    }

    return {
      eligible: true,
      reason: "",
    };
  }

  function formatAiJudgeTimestamp(isoDate) {
    const safeIso = String(isoDate || "").trim();
    if (!safeIso) return "";

    const date = new Date(safeIso);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString();
  }

  function renderAiJudgeTopPick(title, pick) {
    if (!pick || !pick.commentId || !pick.excerpt) return "";
    return `
      <article class="ai-judge__pick">
        <p class="ai-judge__pick-title">${window.ClashlyUtils.escapeHtml(title)}</p>
        <p class="ai-judge__pick-copy">${window.ClashlyUtils.escapeHtml(pick.excerpt)}</p>
        <button
          type="button"
          class="ai-judge__pick-jump"
          data-action="jump-ai-judge-comment"
          data-comment-id="${window.ClashlyUtils.escapeHtml(pick.commentId)}"
        >
          Jump to comment
        </button>
      </article>
    `;
  }

  function renderAiJudgeResult(result, sourceStatus) {
    const { result: resultEl } = getAiJudgeElements();
    if (!resultEl || !result) return;

    const analyzedAt = formatAiJudgeTimestamp(result.analyzedAt);
    const metaParts = [];
    if (sourceStatus === "cached") {
      metaParts.push("Cached result");
    }
    if (analyzedAt) {
      metaParts.push(`Analyzed ${analyzedAt}`);
    }

    const picksMarkup = [renderAiJudgeTopPick("Top Argument (Agree)", result.agreeTop), renderAiJudgeTopPick("Top Argument (Disagree)", result.disagreeTop)]
      .filter(Boolean)
      .join("");

    resultEl.innerHTML = `
      <div class="ai-judge__row">
        <span class="ai-judge__label">Verdict</span>
        <span class="ai-judge__value">${window.ClashlyUtils.escapeHtml(result.verdict)}</span>
      </div>
      <div class="ai-judge__row">
        <span class="ai-judge__label">Confidence</span>
        <span class="ai-judge__value">${window.ClashlyUtils.escapeHtml(result.confidence)}</span>
      </div>
      <p class="ai-judge__reason">${window.ClashlyUtils.escapeHtml(result.reason)}</p>
      ${metaParts.length ? `<p class="ai-judge__meta">${window.ClashlyUtils.escapeHtml(metaParts.join(" | "))}</p>` : ""}
      ${picksMarkup ? `<section class="ai-judge__picks">${picksMarkup}</section>` : ""}
    `;
    resultEl.hidden = false;
  }

  function jumpToCommentById(commentId) {
    const safeCommentId = String(commentId || "").trim();
    if (!safeCommentId) return;

    const found = expandReplyTrailForComment(currentComments, safeCommentId);
    if (!found) {
      setAiJudgeStatus("That highlighted comment is no longer available in this thread.", "error");
      return;
    }

    renderComments();
    window.requestAnimationFrame(() => {
      const escapedId =
        window.CSS && typeof window.CSS.escape === "function"
          ? window.CSS.escape(safeCommentId)
          : safeCommentId.replace(/"/g, '\\"');
      const targetComment = document.querySelector(`[data-comment-id="${escapedId}"]`);
      if (targetComment instanceof HTMLElement) {
        targetComment.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  async function handleAiJudgeAnalyze() {
    if (aiJudgeLoading || !currentTake) return;
    if (!currentUserId) {
      setAiJudgeStatus("Please log in to use AI Judge.", "error");
      return;
    }
    if (!window.ClashlyAiJudge) {
      setAiJudgeStatus("AI Judge is unavailable right now. Please try again.", "error");
      return;
    }

    const localEligibility = evaluateLocalAiJudgeEligibility();
    if (!localEligibility.eligible) {
      setAiJudgeStatus("", "");
      openAiJudgeReasonModal(localEligibility.reason);
      return;
    }

    setAiJudgeStatus("", "");
    clearAiJudgeResult();
    setAiJudgeLoading(true);

    try {
      const judgeResult = await window.ClashlyAiJudge.analyzeTake(currentTake.id);
      if (judgeResult.error) {
        throw judgeResult.error;
      }

      const payload = judgeResult.data || null;
      if (!payload) {
        throw new Error("AI Judge returned an empty response.");
      }

      if (payload.status === "not_eligible") {
        const reason =
          payload.eligibility && payload.eligibility.reason
            ? payload.eligibility.reason
            : "Not enough debate yet for AI Judge.";
        setAiJudgeStatus("", "");
        openAiJudgeReasonModal(reason);
        clearAiJudgeResult();
        return;
      }

      if ((payload.status === "fresh" || payload.status === "cached") && payload.result) {
        if (payload.status === "fresh" && window.ClashlyComments && typeof window.ClashlyComments.recordAiJudgeCitations === "function") {
          window.ClashlyComments.recordAiJudgeCitations(currentTake.id, payload.result).catch((err) => {
            console.warn("[Clashe] Failed to record AI Judge citations:", err);
          });
        }
        setAiJudgeStatus(payload.status === "cached" ? "Showing recent AI Judge analysis." : "", "");
        renderAiJudgeResult(payload.result, payload.status);
        return;
      }

      throw new Error("AI Judge returned an unexpected response.");
    } catch (_error) {
      setAiJudgeStatus("AI Judge is unavailable right now. Please try again.", "error");
      clearAiJudgeResult();
    } finally {
      setAiJudgeLoading(false);
    }
  }

  async function handleInlineAiJudge(input) {
    if (!input || !input.takeId || !currentTake || currentTake.id !== input.takeId) return;
    if (!currentUserId) {
      setTakeState("Please log in to use AI Judge.", "error");
      return;
    }
    if (!window.ClashlyAiJudge) {
      setTakeState("AI Judge is unavailable right now. Please try again.", "error");
      return;
    }
    if (currentTake.ai_judge && currentTake.ai_judge.status === "loading") return;

    const localEligibility = evaluateLocalAiJudgeEligibility();
    if (!localEligibility.eligible) {
      openAiJudgeReasonModal(localEligibility.reason);
      return;
    }

    setInlineAiJudgeState({
      status: "loading",
      message: "",
    });
    setTakeState("", "");

    try {
      const judgeResult = await window.ClashlyAiJudge.analyzeTake(input.takeId);
      if (judgeResult.error) {
        throw judgeResult.error;
      }

      const payload = judgeResult.data || null;
      if (!payload) {
        throw new Error("AI Judge returned an empty response.");
      }

      if (payload.status === "not_eligible") {
        const reason =
          payload.eligibility && payload.eligibility.reason
            ? payload.eligibility.reason
            : "Not enough debate yet for AI Judge.";
        setInlineAiJudgeState(null);
        openAiJudgeReasonModal(reason);
        return;
      }

      if ((payload.status === "fresh" || payload.status === "cached") && payload.result) {
        if (payload.status === "fresh" && window.ClashlyComments && typeof window.ClashlyComments.recordAiJudgeCitations === "function") {
          window.ClashlyComments.recordAiJudgeCitations(input.takeId, payload.result).catch((err) => {
            console.warn("[Clashe] Failed to record AI Judge citations:", err);
          });
        }
        setInlineAiJudgeState({
          status: "ready",
          source: payload.status,
          result: payload.result,
        });
        setTakeState("", "");
        return;
      }

      throw new Error("AI Judge returned an unexpected response.");
    } catch (error) {
      setInlineAiJudgeState({
        status: "error",
        message: "AI Judge is unavailable right now. Please try again.",
      });
      setTakeState(window.ClashlyUtils.reportError("Take inline AI Judge failed.", error, "AI Judge is unavailable right now. Please try again."), "error");
    }
  }

  function bindAiJudgePanel() {
    if (aiJudgeBound) return;
    const { trigger, result } = getAiJudgeElements();
    if (!trigger || !result) return;

    trigger.addEventListener("click", () => {
      handleAiJudgeAnalyze().catch(() => {
        setAiJudgeStatus("AI Judge is unavailable right now. Please try again.", "error");
      });
    });

    result.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const jumpButton = target.closest("[data-action='jump-ai-judge-comment']");
      if (!jumpButton) return;

      const commentId = jumpButton.getAttribute("data-comment-id") || "";
      jumpToCommentById(commentId);
    });

    aiJudgeBound = true;
    setAiJudgeLoading(false);
  }

  function setTakeState(message, type) {
    const stateEl = document.getElementById("take-state");
    if (!stateEl) return;

    stateEl.hidden = !message;
    stateEl.textContent = message || "";
    stateEl.classList.remove("is-error", "is-success");
    if (type === "error") stateEl.classList.add("is-error");
    if (type === "success") stateEl.classList.add("is-success");
  }

  function setCommentsState(message, type) {
    const stateEl = document.getElementById("comments-state");
    if (!stateEl) return;

    stateEl.hidden = !message;
    stateEl.textContent = message || "";
    stateEl.classList.remove("is-error", "is-success");
    if (type === "error") stateEl.classList.add("is-error");
    if (type === "success") stateEl.classList.add("is-success");
  }

  function updateCommentCount() {
    const input = document.getElementById("comment-input");
    const countEl = document.getElementById("comment-count");
    if (!input || !countEl) return;
    countEl.textContent = String(input.value.length);
  }

  function autoSizeCommentInput() {
    const input = document.getElementById("comment-input");
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  }

  function syncComposerExpandedState() {
    const form = document.getElementById("comment-form");
    const input = document.getElementById("comment-input");
    if (!form || !input) return;

    const shouldExpand = document.activeElement === input || Boolean(input.value.trim()) || Boolean(activeReplyTarget);
    form.classList.toggle("comment-compose--expanded", shouldExpand);
  }

  function updateCommentsSummary() {
    const totalEl = document.getElementById("comments-total");
    if (!totalEl) return;
    totalEl.textContent = String(currentCommentsCount);
  }

  function setReplyTarget(commentId, username) {
    activeReplyTarget = commentId ? { commentId, username } : null;
    const wrapper = document.getElementById("comment-replying");
    const textEl = document.getElementById("comment-replying-text");
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

  function renderComments() {
    const threadEl = document.getElementById("comments-thread");
    if (!threadEl || !window.ClashlyCommentsRenderer) return;

    window.ClashlyCommentsRenderer.renderCommentThread(threadEl, currentComments, {
      currentUserId,
      expandedReplyIds,
      takeAuthorId: currentTake ? currentTake.user_id : "",
    });
  }

  function findCommentById(items, commentId) {
    for (const item of items || []) {
      if (item.id === commentId) return item;
      const nested = findCommentById(item.replies || [], commentId);
      if (nested) return nested;
    }
    return null;
  }

  function expandReplyTrailForComment(items, commentId) {
    for (const item of items || []) {
      if (item.id === commentId) return true;
      if (Array.isArray(item.replies) && item.replies.length) {
        const foundInReply = expandReplyTrailForComment(item.replies, commentId);
        if (foundInReply) {
          expandedReplyIds.add(item.id);
          return true;
        }
      }
    }
    return false;
  }

  function focusCommentFromQueryIfNeeded() {
    const commentId = String(pendingCommentFocusId || "").trim();
    if (!commentId) return;

    const found = expandReplyTrailForComment(currentComments, commentId);
    if (!found) return;

    renderComments();
    window.requestAnimationFrame(() => {
      const escapedId =
        window.CSS && typeof window.CSS.escape === "function"
          ? window.CSS.escape(commentId)
          : commentId.replace(/"/g, '\\"');
      const targetComment = document.querySelector(`[data-comment-id="${escapedId}"]`);
      if (targetComment instanceof HTMLElement) {
        targetComment.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    pendingCommentFocusId = "";
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
    if (!currentTake || !window.ClashlyComments) return;

    const skipSkeleton = Boolean(options && options.skipSkeleton);
    const threadEl = document.getElementById("comments-thread");
    if (!skipSkeleton && threadEl && currentComments.length === 0 && typeof window.clasheShowCommentsSkeleton === "function") {
      window.clasheShowCommentsSkeleton("comments-thread", 4);
    }

    setCommentsState("", "");
    try {
      const result = await window.ClashlyComments.fetchCommentsByTake(currentTake.id, {
        sort: currentCommentsSort,
        currentUserId,
      });

      if (result.error) {
        throw result.error;
      }

      currentComments = result.comments || [];
      currentCommentsCount = result.count || 0;
      updateCommentsSummary();
      renderComments();
      setCommentsState("", "");
    } catch (error) {
      if (threadEl && currentComments.length === 0) {
        threadEl.innerHTML = "";
      }
      setCommentsState(window.ClashlyUtils.reportError("Take comments load failed.", error, "Could not load comments."), "error");
    }
  }

  function renderTake() {
    const streamEl = document.getElementById("take-detail-stream");
    if (!streamEl) return;

    window.ClashlyTakeRenderer.renderTakeList(streamEl, currentTake ? [currentTake] : [], {
      currentUserId,
      hideCommentsAction: isSearchEntry,
      showAiJudgeAction: isSearchEntry,
      hideInlineAiJudgeResult: true,
      emptyMessage: "Take not found.",
    });

    window.ClashlyTakeRenderer.bindShareActions(streamEl, {
      onStatus: setTakeState,
      onShare: handleShareOpen,
    });
    window.ClashlyTakeRenderer.bindVoteActions(streamEl, {
      onStatus: setTakeState,
      onVote: handleVote,
    });
    window.ClashlyTakeRenderer.bindBookmarkActions(streamEl, {
      onStatus: setTakeState,
      onBookmark: handleBookmark,
    });
    if (isSearchEntry) {
      window.ClashlyTakeRenderer.bindAiJudgeActions(streamEl, {
        onStatus: setTakeState,
        onAiJudge: handleInlineAiJudge,
      });
    }
  }

  function syncCurrentTakeState() {
    const streamEl = document.getElementById("take-detail-stream");
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
    const threadEl = document.getElementById("comments-thread");
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

  function bindCommentComposer() {
    const form = document.getElementById("comment-form");
    const input = document.getElementById("comment-input");
    const submitBtn = document.getElementById("comment-submit");
    const cancelReplyBtn = document.getElementById("comment-cancel-reply");
    const sortSelect = document.getElementById("comments-sort");
    const threadEl = document.getElementById("comments-thread");
    if (!form || !input || !submitBtn || !cancelReplyBtn || !sortSelect || !threadEl || !window.ClashlyComments) {
      return;
    }

    input.addEventListener("input", updateCommentCount);
    input.addEventListener("input", autoSizeCommentInput);
    input.addEventListener("input", syncComposerExpandedState);
    input.addEventListener("focus", syncComposerExpandedState);
    input.addEventListener("blur", syncComposerExpandedState);
    updateCommentCount();
    autoSizeCommentInput();
    syncComposerExpandedState();

    cancelReplyBtn.addEventListener("click", () => {
      setReplyTarget("", "");
      input.focus();
    });

    sortSelect.addEventListener("change", async () => {
      currentCommentsSort = sortSelect.value === "oldest" ? "oldest" : "newest";
      await loadComments();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!currentTake) return;
      if (!currentUserId) {
        setCommentsState("Please log in to comment.", "error");
        window.setTimeout(() => {
          window.location.replace("auth.html");
        }, 250);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = activeReplyTarget ? "Replying..." : "Posting...";

      try {
        const createResult = await window.ClashlyComments.createComment({
          userId: currentUserId,
          takeId: currentTake.id,
          parentId: activeReplyTarget ? activeReplyTarget.commentId : "",
          content: input.value,
        });

        if (createResult.error) {
          throw createResult.error;
        }

        const createdComment = createResult.comment || null;
        const replyTarget = activeReplyTarget ? findCommentById(currentComments, activeReplyTarget.commentId) : null;
        const notificationTargetUserId = replyTarget ? replyTarget.user_id : currentTake.user_id;
        const notificationType = replyTarget ? "reply" : "comment";

        if (activeReplyTarget && activeReplyTarget.commentId) {
          expandedReplyIds.add(activeReplyTarget.commentId);
        }

        input.value = "";
        updateCommentCount();
        autoSizeCommentInput();
        setReplyTarget("", "");
        setCommentsState("", "");
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
        setCommentsState(window.ClashlyUtils.reportError("Take comment post failed.", error, "Could not post comment."), "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Post";
      }
    });

    threadEl.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const replyButton = target.closest("[data-action='reply']");
      if (replyButton) {
        const commentId = replyButton.getAttribute("data-comment-id") || "";
        const username = replyButton.getAttribute("data-comment-user") || "user";
        setReplyTarget(commentId, username);
        expandedReplyIds.add(commentId);
        form.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
          setCommentsState("Please log in to like comments.", "error");
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

          if (likeResult.error) {
            throw likeResult.error;
          }

          const likeDeltaAdjustment = Number(likeResult.delta || 0) - optimisticDelta;
          if (likeResult.liked !== optimisticLiked || likeDeltaAdjustment !== 0) {
            applyCommentLikeState(commentId, likeResult.liked, likeDeltaAdjustment);
          }
          syncCommentLikeButton(commentId, false);
          setCommentsState("", "");

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
          setCommentsState(window.ClashlyUtils.reportError("Take comment like toggle failed.", error, "Could not update comment like."), "error");
        } finally {
          pendingCommentLikeIds.delete(commentId);
        }
        return;
      }

      const deleteButton = target.closest("[data-action='delete-comment']");
      if (!deleteButton) return;

      const commentId = deleteButton.getAttribute("data-comment-id") || "";
      if (!commentId) return;
      if (!currentUserId) {
        setCommentsState("Please log in to manage comments.", "error");
        return;
      }

      deleteButton.setAttribute("disabled", "true");
      try {
        const deleteResult = await window.ClashlyComments.deleteComment({
          commentId,
          userId: currentUserId,
        });

        if (deleteResult.error) {
          throw deleteResult.error;
        }

        if (activeReplyTarget && activeReplyTarget.commentId === commentId) {
          setReplyTarget("", "");
        }

        setCommentsState("", "");
        await loadComments();
      } catch (error) {
        deleteButton.removeAttribute("disabled");
        setCommentsState(window.ClashlyUtils.reportError("Take comment delete failed.", error, "Could not delete comment."), "error");
      }
    });
  }

  async function handleVote(input) {
    if (!currentUserId) {
      setTakeState("Please log in to vote.", "error");
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
    syncCurrentTakeState();

    try {
      const voteResult = await window.ClashlyTakes.submitVote({
        userId: currentUserId,
        takeId: input.takeId,
        voteType: input.voteType,
        currentVote: previousVote ? previousVote.user_vote : "",
      });

      if (voteResult.error) {
        throw voteResult.error;
      }

      const reconciledVote =
        window.ClashlyTakes && typeof window.ClashlyTakes.resolveSubmittedVoteSummary === "function"
          ? window.ClashlyTakes.resolveSubmittedVoteSummary(optimisticVote, voteResult.vote)
          : optimisticVote || voteResult.vote;
      currentTake = {
        ...currentTake,
        vote_loading: false,
        vote: reconciledVote || currentTake.vote,
      };
      syncCurrentTakeState();
      setAiJudgeStatus("", "");
      setTakeState("", "");
    } catch (error) {
      currentTake = {
        ...currentTake,
        vote_loading: false,
        vote: previousVote,
      };
      syncCurrentTakeState();
      throw error;
    }
  }

  async function handleBookmark(input) {
    if (!currentUserId) {
      setTakeState("Please log in to save takes.", "error");
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
    syncCurrentTakeState();

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
      syncCurrentTakeState();
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
    syncCurrentTakeState();
    setTakeState("", "");
  }

  function handleShareOpen(input) {
    if (window.ClashlyShareModal) {
      window.ClashlyShareModal.open({
        take: currentTake,
      });
      return;
    }

    window.ClashlyUtils.copyText(input.shareUrl)
      .then(() => setTakeState("", ""))
      .catch((error) => setTakeState(window.ClashlyUtils.reportError("Fallback share failed.", error, "Could not copy link."), "error"));
  }

  async function initTakePage() {
    try {
      if (
        !window.ClashlyTakes ||
        !window.ClashlyTakeRenderer ||
        !window.ClashlySession ||
        !window.ClashlyComments ||
        !window.ClashlyCommentsRenderer
      ) {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const takeId = params.get("id");
      pendingCommentFocusId = String(params.get("commentId") || "").trim();
      setSearchEntryMode(params.get("from") === "search");
      if (!takeId) {
        setTakeState("Missing take id.", "error");
        return;
      }

      // Show take & comment skeletons immediately — before any network calls
      const streamEl = document.getElementById("take-detail-stream");
      if (streamEl && typeof window.clasheShowFeedSkeleton === "function") {
        window.clasheShowFeedSkeleton("take-detail-stream", 1);
      }
      const threadEl = document.getElementById("comments-thread");
      if (threadEl && typeof window.clasheShowCommentsSkeleton === "function") {
        window.clasheShowCommentsSkeleton("comments-thread", 4);
      }

      if (!isSearchEntry) {
        bindCommentComposer();
        bindAiJudgePanel();
      }
      bindAiJudgeReasonModal();
      updateCommentsSummary();

      const sessionState = await window.ClashlySession.resolveSession();
      currentUserId = sessionState.user ? sessionState.user.id : "";
      const takeResult = await window.ClashlyTakes.fetchTakeById(takeId, { currentUserId });

      if (takeResult.error) {
        throw takeResult.error;
      }

      if (!takeResult.take) {
        setTakeState("Take not found.", "error");
        return;
      }

      currentTake = takeResult.take;
      currentCommentsCount = Number((currentTake && currentTake.comment_count) || 0);

      setTakeState("", "");
      renderTake();
      if (!isSearchEntry) {
        setAiJudgeLoading(false);
        await loadComments();
        focusCommentFromQueryIfNeeded();
      }
      setTakeState("", "");
    } catch (error) {
      setTakeState(window.ClashlyUtils.reportError("Take page load failed.", error, "Could not load take."), "error");
      setCommentsState("Comments unavailable until take loads.", "error");
    } finally {
      if (window.ClasheLoader) {
        window.ClasheLoader.release("page-data");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", initTakePage);
})();
