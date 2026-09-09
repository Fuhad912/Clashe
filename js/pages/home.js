(function () {
  const PAGE_SIZE = 15;
  // Requested candidate-window size per DB round trip when refilling the
  // "for-you" ranking pool. The underlying service clamps this to its own
  // max page size (30 as of this writing) — the pool-refill loop below just
  // makes multiple requests to build up a wider window than one page when it
  // needs to, so this constant is a request hint, not a guarantee.
  const RANKING_WINDOW_SIZE = 90;
  const SCROLL_THRESHOLD_PX = 900;
  const AI_JUDGE_MIN_VOTES = 20;
  const AI_JUDGE_MIN_COMMENTS = 6;
  let activeSection = "for-you";
  let currentUserId = "";
  let scrollQueued = false;
  const sectionState = {
    "for-you": {
      takes: [],
      cursor: null,
      hasMore: true,
      loaded: false,
      loading: false,
      meta: null,
      // Ranked-but-not-yet-shown candidates. "for-you" pages are sliced off
      // the front of this pool instead of being fetched one DB page at a
      // time, so ranking can pull from a much wider window than one strict
      // chronological page (see loadForYouFeed below).
      pool: [],
      poolCursor: null,
      poolExhausted: false,
      latestForYouMeta: null,
    },
    following: {
      takes: [],
      cursor: null,
      hasMore: true,
      loaded: false,
      loading: false,
      meta: null,
    },
  };

  function setFeedState(message, type) {
    const stateEl = document.getElementById("feed-state");
    if (!stateEl) return;

    stateEl.hidden = !message;
    stateEl.textContent = message || "";
    stateEl.classList.remove("is-error", "is-success");
    if (type === "error") stateEl.classList.add("is-error");
    if (type === "success") stateEl.classList.add("is-success");
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

  function getHashSection() {
    const hash = window.location.hash.replace("#", "").toLowerCase();
    if (hash === "following") return "following";
    return "for-you";
  }

  function getForYouEmptyMessage(meta) {
    if (meta && meta.hasSignals) {
      return "We're still building your For you mix. Keep searching, opening hashtags, and saving takes.";
    }

    return "No takes yet. Once the floor starts moving, your For you feed will build here.";
  }

  function getSectionState(section) {
    return sectionState[section === "following" ? "following" : "for-you"];
  }

  function resetSection(section) {
    const state = getSectionState(section);
    state.takes = [];
    state.cursor = null;
    state.hasMore = true;
    state.loaded = false;
    state.loading = false;
    state.meta = null;
    if (section === "for-you") {
      state.pool = [];
      state.poolCursor = null;
      state.poolExhausted = false;
      state.latestForYouMeta = null;
    }
  }

  function updateHeader() {
    const buttons = document.querySelectorAll("[data-home-tab]");
    buttons.forEach((button) => {
      const isActive = button.getAttribute("data-home-tab") === activeSection;
      button.classList.toggle("home-switch__btn--active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setActiveSection(nextSection) {
    activeSection = nextSection === "following" ? "following" : "for-you";
    updateHeader();
  }

  function renderPersonalizationContexts() {
    const sideColumnEl = document.querySelector(".side-column");
    const sidePersonalizationEl = document.getElementById("home-side-personalization");
    const sideTitleEl = document.getElementById("home-side-personalization-title");
    const sideTextEl = document.getElementById("home-side-personalization-text");
    const sideChipsEl = document.getElementById("home-side-personalization-chips");
    const sideContextEl = document.getElementById("home-side-context");
    const contextTitleEl = document.getElementById("home-side-context-title");
    const contextTextEl = document.getElementById("home-side-context-text");
    const contextMetaEl = document.getElementById("home-side-context-meta");
    const state = getSectionState(activeSection);
    const isFollowing = activeSection === "following";

    if (sideColumnEl) sideColumnEl.hidden = false;
    if (sidePersonalizationEl) sidePersonalizationEl.hidden = false;
    if (sideContextEl) sideContextEl.hidden = false;

    if (sideTitleEl) {
      sideTitleEl.textContent = isFollowing ? "Following feed" : "Debate pulse";
    }
    if (sideTextEl) {
      sideTextEl.textContent = isFollowing
        ? "This tab stays focused on posts from accounts you already follow."
        : "The wider feed keeps moving with fresh takes from across Clashe.";
    }
    if (sideChipsEl) {
      const chips = isFollowing
        ? ["Following", "Accounts", "Replies"]
        : ["For you", "Fresh takes", "Debates"];
      sideChipsEl.innerHTML = chips.map((label) => `<span class="topic-chip">${window.ClashlyUtils.escapeHtml(label)}</span>`).join("");
    }
    if (contextTitleEl) {
      contextTitleEl.textContent = "How home works";
    }
    if (contextTextEl) {
      contextTextEl.textContent = isFollowing
        ? "Use Following when you want a tighter stream shaped by the people you chose."
        : "Use For you when you want the main feed to surface what is active right now.";
    }
    if (contextMetaEl) {
      const stats = [];
      if (state && Array.isArray(state.takes) && state.takes.length) {
        stats.push(`${state.takes.length} posts loaded`);
      }
      stats.push(isFollowing ? "Relationship-led" : "Discovery-led");
      contextMetaEl.innerHTML = stats
        .map((stat) => `<span class="topic-chip topic-chip--muted">${window.ClashlyUtils.escapeHtml(stat)}</span>`)
        .join("");
    }
  }

  async function rankForYouFeed(takes) {
    if (!window.ClashePersonalization) {
      return {
        takes,
        meta: { hasSignals: false },
      };
    }

    return window.ClashePersonalization.rankForYou(takes, currentUserId);
  }

  function renderCurrentFeed() {
    const feedEl = document.getElementById("feed-stream");
    if (!feedEl) return;

    const state = getSectionState(activeSection);
    renderPersonalizationContexts();
    if (activeSection === "following" && !state.takes.length && state.loaded) {
      feedEl.innerHTML = `
        <section class="feed-empty-visual" aria-label="No following activity yet">
          <div class="feed-empty-visual__art" aria-hidden="true">
            <span class="feed-empty-visual__glow"></span>
            <img src="assets/clashly-mark.svg" alt="" class="feed-empty-visual__mark" />
          </div>
          <div class="feed-empty-visual__copy">
            <p class="feed-empty-visual__eyebrow">Following</p>
            <h2 class="feed-empty-visual__title">Oops, looks like you aren't following anyone.</h2>
            <p class="feed-empty-visual__text">Follow people to build a feed that only shows takes from accounts you care about.</p>
          </div>
        </section>
      `;
      return;
    }

    window.ClashlyTakeRenderer.renderTakeList(feedEl, state.takes, {
      currentUserId,
      showAiJudgeAction: true,
      emptyMessage: activeSection === "following" ? "" : "No takes yet. Be the first to post one.",
    });

    window.ClashlyTakeRenderer.bindShareActions(feedEl, {
      onStatus: setFeedState,
      onShare: handleShareOpen,
    });
    window.ClashlyTakeRenderer.bindVoteActions(feedEl, {
      onStatus: setFeedState,
      onVote: handleVote,
    });
    window.ClashlyTakeRenderer.bindBookmarkActions(feedEl, {
      onStatus: setFeedState,
      onBookmark: handleBookmark,
    });
    window.ClashlyTakeRenderer.bindCommentActions(feedEl, {
      onComments: handleCommentsOpen,
    });
    window.ClashlyTakeRenderer.bindAiJudgeActions(feedEl, {
      onStatus: setFeedState,
      onAiJudge: handleAiJudge,
    });
  }

  function syncActiveTakeState(takeId) {
    const feedEl = document.getElementById("feed-stream");
    if (!feedEl || !window.ClashlyTakeRenderer || typeof window.ClashlyTakeRenderer.syncTakeState !== "function") return;
    const targetTake = getSectionState(activeSection).takes.find((take) => take.id === takeId) || null;
    if (!targetTake) return;
    window.ClashlyTakeRenderer.syncTakeState(feedEl, targetTake);
  }

  // Refills state.pool from the DB (a wide, mostly-recent candidate window,
  // ranked via personalization) whenever it's running low, then slices one
  // PAGE_SIZE page off the front of the pool for display. This is what lets
  // "for-you" surface a still-hot post from a batch further back instead of
  // only ever reordering whichever single page happened to be newest.
  async function loadForYouPage(state) {
    const needed = PAGE_SIZE;

    while (state.pool.length < needed && !state.poolExhausted) {
      const rawResult = await window.ClashlyTakes.fetchFeedTakes({
        tab: "new",
        limit: RANKING_WINDOW_SIZE,
        currentUserId,
        cursor: state.poolCursor,
      });

      if (rawResult.error) throw rawResult.error;

      const rawBatch = rawResult.takes || [];
      state.poolCursor = rawResult.nextCursor || null;
      if (!rawResult.hasMore || !state.poolCursor) {
        state.poolExhausted = true;
      }

      if (!rawBatch.length) {
        // Nothing new came back this round; stop looping if there's also
        // nothing left to fetch, otherwise try once more for the next batch.
        if (state.poolExhausted) break;
        continue;
      }

      const alreadyShownIds = new Set(state.takes.map((take) => take.id));
      const alreadyPooledIds = new Set(state.pool.map((take) => take.id));
      const freshCandidates = rawBatch.filter(
        (take) => !alreadyShownIds.has(take.id) && !alreadyPooledIds.has(take.id)
      );

      const ranked = await rankForYouFeed(freshCandidates);
      state.pool = state.pool.concat(ranked.takes || []);
      state.latestForYouMeta = ranked.meta || state.latestForYouMeta || null;
    }

    const page = state.pool.splice(0, needed);
    state.takes = state.takes.concat(page);
    state.hasMore = state.pool.length > 0 || !state.poolExhausted;
    state.meta = state.latestForYouMeta || null;
    return { page, meta: state.meta };
  }

  async function loadFeed(options) {
    const feedEl = document.getElementById("feed-stream");
    if (!feedEl) return;

    const state = getSectionState(activeSection);
    const append = Boolean(options && options.append);
    const skipSkeleton = Boolean(options && options.skipSkeleton);
    if (state.loading) return;
    if (append && !state.hasMore) return;

    state.loading = true;
    if (!append) {
      state.takes = [];
      state.cursor = null;
      state.hasMore = true;
      state.meta = null;
      if (activeSection === "for-you") {
        state.pool = [];
        state.poolCursor = null;
        state.poolExhausted = false;
      }
      setFeedState("", "");
      // Show skeleton immediately — hides blank screen while DB responds
      if (!skipSkeleton) {
        if (typeof window.clasheShowFeedSkeleton === "function") {
          window.clasheShowFeedSkeleton("feed-stream", 5);
        } else {
          feedEl.innerHTML = "";
        }
      }
    }

    try {
      if (activeSection === "following") {
        const feedResult = await window.ClashlyTakes.fetchFollowingFeedTakes({
          limit: PAGE_SIZE,
          currentUserId,
          cursor: append ? state.cursor : null,
        });

        if (feedResult.error) throw feedResult.error;

        const incoming = feedResult.takes || [];
        state.takes = append ? state.takes.concat(incoming) : incoming;
        state.cursor = feedResult.nextCursor || null;
        state.hasMore = Boolean(feedResult.hasMore);
        state.meta = feedResult.meta || null;
        state.loaded = true;

        if (append) {
          window.ClashlyTakeRenderer.appendTakeList(feedEl, incoming, {
            currentUserId,
            showAiJudgeAction: true,
          });
          window.ClashlyTakeRenderer.bindShareActions(feedEl, {
            onStatus: setFeedState,
            onShare: handleShareOpen,
          });
          window.ClashlyTakeRenderer.bindVoteActions(feedEl, {
            onStatus: setFeedState,
            onVote: handleVote,
          });
          window.ClashlyTakeRenderer.bindBookmarkActions(feedEl, {
            onStatus: setFeedState,
            onBookmark: handleBookmark,
          });
          window.ClashlyTakeRenderer.bindCommentActions(feedEl, {
            onComments: handleCommentsOpen,
          });
          window.ClashlyTakeRenderer.bindAiJudgeActions(feedEl, {
            onStatus: setFeedState,
            onAiJudge: handleAiJudge,
          });
        } else {
          renderCurrentFeed();
        }
        setFeedState("", "");
        return;
      }

      // "for-you" pages come off a ranked pool rather than a single DB page —
      // see loadForYouPage for why (wider candidate window than PAGE_SIZE).
      const forYouResult = await loadForYouPage(state);
      state.loaded = true;

      if (append) {
        const incoming = (forYouResult && forYouResult.page) || [];
        window.ClashlyTakeRenderer.appendTakeList(feedEl, incoming, {
          currentUserId,
          showAiJudgeAction: true,
        });
        window.ClashlyTakeRenderer.bindShareActions(feedEl, {
          onStatus: setFeedState,
          onShare: handleShareOpen,
        });
        window.ClashlyTakeRenderer.bindVoteActions(feedEl, {
          onStatus: setFeedState,
          onVote: handleVote,
        });
        window.ClashlyTakeRenderer.bindBookmarkActions(feedEl, {
          onStatus: setFeedState,
          onBookmark: handleBookmark,
        });
        window.ClashlyTakeRenderer.bindCommentActions(feedEl, {
          onComments: handleCommentsOpen,
        });
        window.ClashlyTakeRenderer.bindAiJudgeActions(feedEl, {
          onStatus: setFeedState,
          onAiJudge: handleAiJudge,
        });
      } else {
        renderCurrentFeed();
      }

      if (!state.takes.length) {
        setFeedState(getForYouEmptyMessage(forYouResult && forYouResult.meta), "");
        return;
      }
      setFeedState("", "");
      saveCurrentHomeState();
    } catch (error) {
      setFeedState(window.ClashlyUtils.reportError("Home feed load failed.", error, "Could not load feed."), "error");
    } finally {
      state.loading = false;
    }
  }

  function updateTakeInAllSections(takeId, updater) {
    Object.keys(sectionState).forEach((key) => {
      const state = sectionState[key];
      state.takes = state.takes.map((take) => (take.id === takeId ? updater(take) : take));
    });
  }

  function evaluateAiJudgeEligibility(take) {
    const vote = take && take.vote ? take.vote : {};
    const totalVotes = Number(vote.total_votes || 0);
    const agreeVotes = Number(vote.agree_count || 0);
    const disagreeVotes = Number(vote.disagree_count || 0);
    const totalComments = Number(take && take.comment_count ? take.comment_count : 0);

    if (totalVotes < AI_JUDGE_MIN_VOTES || totalComments < AI_JUDGE_MIN_COMMENTS) {
      return {
        eligible: false,
        reason: `Not enough debate yet for AI Judge. It unlocks at ${AI_JUDGE_MIN_VOTES}+ votes and ${AI_JUDGE_MIN_COMMENTS}+ comments.`,
      };
    }

    if (agreeVotes <= 0 || disagreeVotes <= 0) {
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

  function setTakeAiJudgeState(takeId, judgeState) {
    updateTakeInAllSections(takeId, (take) => ({
      ...take,
      ai_judge: judgeState,
    }));
    renderCurrentFeed();
  }

  function handleCommentsOpen(input) {
    const targetTake = getSectionState(activeSection).takes.find((take) => take.id === input.takeId) || null;
    if (currentUserId && targetTake && window.ClashePersonalization) {
      window.ClashePersonalization.recordTakeEngagement(currentUserId, targetTake, "comment").catch(() => {});
    }

    if (!window.ClashlyCommentsModal) {
      window.location.href = `take.html?id=${encodeURIComponent(input.takeId)}`;
      return;
    }

    window.ClashlyCommentsModal.open({
      takeId: input.takeId,
      take: targetTake,
      currentUserId,
    });
  }

  function handleShareOpen(input) {
    const targetTake = getSectionState(activeSection).takes.find((take) => take.id === input.takeId) || null;
    if (currentUserId && targetTake && window.ClashePersonalization) {
      window.ClashePersonalization.recordTakeEngagement(currentUserId, targetTake, "open").catch(() => {});
    }

    if (window.ClashlyShareModal) {
      window.ClashlyShareModal.open({
        take: targetTake,
      });
      return;
    }

    window.ClashlyUtils.copyText(input.shareUrl)
      .then(() => setFeedState("", ""))
      .catch((error) => setFeedState(window.ClashlyUtils.reportError("Fallback share failed.", error, "Could not copy link."), "error"));
  }

  function handleTakeUpdated(event) {
    const detail = event.detail || {};
    if (!detail.takeId || !detail.vote) return;
    updateTakeInAllSections(detail.takeId, (take) => ({
      ...take,
      vote: detail.vote,
      vote_loading: false,
    }));
    syncActiveTakeState(detail.takeId);
  }

  function handleTakeBookmarkUpdated(event) {
    const detail = event.detail || {};
    if (!detail.takeId || typeof detail.bookmarked !== "boolean") return;
    updateTakeInAllSections(detail.takeId, (take) => ({
      ...take,
      bookmarked: detail.bookmarked,
    }));
    syncActiveTakeState(detail.takeId);
  }

  async function handleVote(input) {
    if (!currentUserId) {
      setFeedState("Please log in to vote.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    const activeState = getSectionState(activeSection);
    const target = activeState.takes.find((take) => take.id === input.takeId);
    if (!target || target.vote_loading) return;
    const previousVote = target.vote ? { ...target.vote } : null;
    const optimisticVote = window.ClashlyTakes && typeof window.ClashlyTakes.previewVoteSummary === "function"
      ? window.ClashlyTakes.previewVoteSummary(previousVote, input.voteType)
      : previousVote;

    // Apply optimistic update instantly — vote_loading:true guards against
    // double-submission without visually disabling buttons (renderer ignores it)
    updateTakeInAllSections(input.takeId, (take) => ({
      ...take,
      vote_loading: true,
      vote: optimisticVote || take.vote,
    }));
    syncActiveTakeState(input.takeId);

    try {
      const voteResult = await window.ClashlyTakes.submitVote({
        userId: currentUserId,
        takeId: input.takeId,
        voteType: input.voteType,
        currentVote: previousVote ? previousVote.user_vote : "",
      });

      if (voteResult.error) throw voteResult.error;

      if (window.ClashePersonalization) {
        window.ClashePersonalization.recordTakeEngagement(currentUserId, target, "vote").catch(() => {});
      }

      const reconciledVote =
        window.ClashlyTakes && typeof window.ClashlyTakes.resolveSubmittedVoteSummary === "function"
          ? window.ClashlyTakes.resolveSubmittedVoteSummary(optimisticVote, voteResult.vote)
          : optimisticVote || voteResult.vote;
      updateTakeInAllSections(input.takeId, (take) => ({
        ...take,
        vote_loading: false,
        vote: reconciledVote || take.vote,
      }));
      syncActiveTakeState(input.takeId);
    } catch (error) {
      // Roll back on failure
      updateTakeInAllSections(input.takeId, (take) => ({
        ...take,
        vote_loading: false,
        vote: previousVote || take.vote,
      }));
      syncActiveTakeState(input.takeId);
      throw error;
    }
  }

  async function handleBookmark(input) {
    if (!currentUserId) {
      setFeedState("Please log in to save takes.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    const target = getSectionState(activeSection).takes.find((take) => take.id === input.takeId) || null;
    const previousBookmarked = Boolean(target && target.bookmarked);

    // Apply optimistic update instantly — no full re-render
    updateTakeInAllSections(input.takeId, (take) => ({
      ...take,
      bookmarked: !previousBookmarked,
    }));
    syncActiveTakeState(input.takeId);

    try {
      const result = await window.ClashlyTakes.toggleBookmark({
        userId: currentUserId,
        takeId: input.takeId,
        isBookmarked: input.isBookmarked,
      });

      if (result.error) throw result.error;

      if (result.bookmarked && target && window.ClashePersonalization) {
        window.ClashePersonalization.recordTakeEngagement(currentUserId, target, "bookmark").catch(() => {});
      }

      if (result.bookmarked && target && window.ClashlyNotifications) {
        window.ClashlyNotifications.createNotification({
          userId: target.user_id,
          actorId: currentUserId,
          type: "bookmark",
          targetId: target.id,
          targetTakeId: target.id,
        }).catch(() => {});
      }

      // Reconcile with server result — surgical DOM update only
      updateTakeInAllSections(input.takeId, (take) => ({
        ...take,
        bookmarked: result.bookmarked,
      }));
      syncActiveTakeState(input.takeId);
    } catch (error) {
      // Roll back on failure
      updateTakeInAllSections(input.takeId, (take) => ({
        ...take,
        bookmarked: previousBookmarked,
      }));
      syncActiveTakeState(input.takeId);
      throw error;
    }
  }

  async function handleAiJudge(input) {
    if (!input || !input.takeId) return;
    if (!currentUserId) {
      setFeedState("Please log in to use AI Judge.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    if (!window.ClashlyAiJudge) {
      setFeedState("AI Judge is unavailable right now. Please try again.", "error");
      return;
    }

    const target = getSectionState(activeSection).takes.find((take) => take.id === input.takeId) || null;
    if (!target) return;
    if (target.ai_judge && target.ai_judge.status === "loading") return;

    const eligibility = evaluateAiJudgeEligibility(target);
    if (!eligibility.eligible) {
      openAiJudgeReasonModal(eligibility.reason);
      return;
    }

    setTakeAiJudgeState(input.takeId, {
      status: "loading",
      message: "",
    });

    try {
      const result = await window.ClashlyAiJudge.analyzeTake(input.takeId);
      if (result.error) throw result.error;

      const payload = result.data || null;
      if (!payload) throw new Error("Empty AI Judge response.");

      if (payload.status === "not_eligible") {
        const reason =
          payload.eligibility && payload.eligibility.reason
            ? payload.eligibility.reason
            : "Not enough debate yet for AI Judge.";
        setTakeAiJudgeState(input.takeId, null);
        openAiJudgeReasonModal(reason);
        return;
      }

      if ((payload.status === "fresh" || payload.status === "cached") && payload.result) {
        setTakeAiJudgeState(input.takeId, {
          status: "ready",
          source: payload.status,
          result: payload.result,
        });
        setFeedState(payload.status === "cached" ? "Showing recent AI Judge analysis." : "", "");
        return;
      }

      throw new Error("Unexpected AI Judge response.");
    } catch (error) {
      setTakeAiJudgeState(input.takeId, {
        status: "error",
        message: "AI Judge is unavailable right now. Please try again.",
      });
      setFeedState(window.ClashlyUtils.reportError("Home AI Judge failed.", error, "AI Judge is unavailable right now. Please try again."), "error");
    }
  }

  async function handleHashChange() {
    const nextSection = getHashSection();
    setActiveSection(nextSection);
    resetSection(nextSection);
    await loadFeed({ append: false });
  }

  async function handleTakeCreated() {
    resetSection("for-you");
    setActiveSection("for-you");
    if (window.location.hash !== "#for-you") {
      window.location.hash = "for-you";
      return;
    }
    await loadFeed({ append: false });
  }

  function bindHomeSwitch() {
    const buttons = document.querySelectorAll("[data-home-tab]");
    buttons.forEach((button) => {
      button.addEventListener("click", async () => {
        const nextSection = button.getAttribute("data-home-tab") === "following" ? "following" : "for-you";
        if (nextSection === activeSection) {
          resetSection(nextSection);
          await loadFeed({ append: false });
          return;
        }
        setActiveSection(nextSection);
        window.location.hash = nextSection;
      });
    });
  }

  let feedSentinelObserver = null;

  function ensureFeedSentinel() {
    let sentinel = document.getElementById("feed-scroll-sentinel");
    if (sentinel) return sentinel;

    sentinel = document.createElement("div");
    sentinel.id = "feed-scroll-sentinel";
    sentinel.className = "feed-scroll-sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "height: 1px; width: 100%; pointer-events: none; margin: 0; padding: 0;";

    const feedColumn = document.querySelector(".feed-column");
    if (feedColumn) {
      feedColumn.appendChild(sentinel);
    }
    return sentinel;
  }

  function shouldLoadMore() {
    const state = getSectionState(activeSection);
    if (!state.loaded || state.loading || !state.hasMore) return false;
    const viewportBottom = window.scrollY + window.innerHeight;
    const pageBottom = document.documentElement.scrollHeight;
    return viewportBottom >= pageBottom - SCROLL_THRESHOLD_PX;
  }

  function bindInfiniteScroll() {
    const sentinel = ensureFeedSentinel();
    if (typeof IntersectionObserver !== "undefined" && sentinel) {
      if (feedSentinelObserver) {
        feedSentinelObserver.disconnect();
      }

      feedSentinelObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry || !entry.isIntersecting) return;
          const state = getSectionState(activeSection);
          if (!state.loaded || state.loading || !state.hasMore) return;
          loadFeed({ append: true });
        },
        {
          root: null,
          rootMargin: "900px 0px 900px 0px",
          threshold: 0,
        }
      );

      feedSentinelObserver.observe(sentinel);
      return;
    }

    // Fallback if IntersectionObserver is unavailable
    window.addEventListener(
      "scroll",
      () => {
        if (scrollQueued) return;
        scrollQueued = true;
        window.requestAnimationFrame(async () => {
          scrollQueued = false;
          if (!shouldLoadMore()) return;
          await loadFeed({ append: true });
        });
      },
      { passive: true }
    );
  }

  function saveCurrentHomeState() {
    if (!window.ClasheCache) return;
    const state = getSectionState(activeSection);
    if (!state || !Array.isArray(state.takes) || !state.takes.length) return;
    window.ClasheCache.savePageState("home", {
      section: activeSection,
      takes: state.takes,
      hasMore: state.hasMore,
      cursor: state.cursor,
    });
  }

  async function silentRevalidateFeed() {
    try {
      const state = getSectionState(activeSection);
      if (activeSection === "for-you") {
        const freshResult = await window.ClashlyTakes.fetchFeedTakes({
          tab: "new",
          limit: PAGE_SIZE,
          currentUserId,
        });
        if (freshResult && Array.isArray(freshResult.takes) && freshResult.takes.length > 0) {
          const existingIds = new Set(state.takes.map((t) => t.id));
          const newTakes = freshResult.takes.filter((t) => !existingIds.has(t.id));
          if (newTakes.length > 0) {
            const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
            if (currentScrollY < 60) {
              state.takes = [...newTakes, ...state.takes];
              renderCurrentFeed();
            }
          }
          saveCurrentHomeState();
        }
      }
    } catch (_err) {}
  }

  function handleTakeCreated(event) {
    const newTake = event && event.detail && event.detail.take;
    if (!newTake) return;
    const state = getSectionState(activeSection);
    if (!state.takes.some((t) => t.id === newTake.id)) {
      state.takes.unshift(newTake);
    }
    renderCurrentFeed();
    saveCurrentHomeState();
  }

  function handleTakeUpdated(event) {
    const updatedTake = event && event.detail && event.detail.take;
    if (!updatedTake || !updatedTake.id) return;
    updateTakeInAllSections(updatedTake.id, () => updatedTake);
    syncActiveTakeState(updatedTake.id);
    saveCurrentHomeState();
  }

  function handleTakeBookmarkUpdated(event) {
    const detail = event && event.detail;
    if (!detail || !detail.takeId) return;
    updateTakeInAllSections(detail.takeId, (take) => ({
      ...take,
      bookmarked: Boolean(detail.bookmarked),
    }));
    syncActiveTakeState(detail.takeId);
    saveCurrentHomeState();
  }

  async function initFeedPage() {
    try {
      if (!window.ClashlyTakes || !window.ClashlyTakeRenderer || !window.ClashlySession) return;

      activeSection = getHashSection();

      bindHomeSwitch();
      bindInfiniteScroll();
      bindAiJudgeReasonModal();

      const createEvent = (window.ClashlyApp && window.ClashlyApp.createEventName) || "clashly:take-created";
      window.addEventListener(createEvent, handleTakeCreated);
      window.addEventListener("clashly:take-updated", handleTakeUpdated);
      window.addEventListener("clashly:take-bookmark-updated", handleTakeBookmarkUpdated);
      window.addEventListener("hashchange", handleHashChange);

      // Save scroll and feed state before navigating away
      window.addEventListener("pagehide", () => {
        if (window.ClasheCache) {
          saveCurrentHomeState();
          window.ClasheCache.saveScroll("home");
        }
      });
      window.addEventListener("beforeunload", () => {
        if (window.ClasheCache) {
          saveCurrentHomeState();
          window.ClasheCache.saveScroll("home");
        }
      });

      // Check cache for instant SWR hydration
      const cachedRecord = window.ClasheCache ? window.ClasheCache.getPageState("home") : null;
      const cachedData = cachedRecord && cachedRecord.data;

      if (cachedData && Array.isArray(cachedData.takes) && cachedData.takes.length > 0) {
        if (cachedData.section) {
          activeSection = cachedData.section;
        }
        const state = getSectionState(activeSection);
        state.takes = cachedData.takes;
        state.hasMore = cachedData.hasMore !== false;
        state.cursor = cachedData.cursor || null;
        state.loaded = true;

        setActiveSection(activeSection);
        renderCurrentFeed();
        setFeedState("", "");

        // Restore exact scroll position immediately
        if (typeof cachedRecord.scroll === "number" && cachedRecord.scroll > 0) {
          window.ClasheCache.restoreScroll("home");
        }

        // Silent background session check & feed revalidation
        window.ClashlySession.resolveSession().then((sessionState) => {
          currentUserId = sessionState.user ? sessionState.user.id : "";
          silentRevalidateFeed();
        }).catch(() => {});
      } else {
        // Cold first load: show skeleton and fetch
        setActiveSection(activeSection);
        const feedEl = document.getElementById("feed-stream");
        if (feedEl && typeof window.clasheShowFeedSkeleton === "function") {
          window.clasheShowFeedSkeleton("feed-stream", 5);
        }

        const sessionState = await window.ClashlySession.resolveSession();
        currentUserId = sessionState.user ? sessionState.user.id : "";
        await loadFeed({ append: false, skipSkeleton: true });
        saveCurrentHomeState();
      }
    } finally {
      if (window.ClasheLoader) {
        window.ClasheLoader.release("page-data");
      }
    }
  }

  function tryFastSyncHydrate() {
    const feedEl = document.getElementById("feed-stream");
    if (!feedEl || !window.ClasheCache || !window.ClashlyTakeRenderer) return;
    const cachedRecord = window.ClasheCache.getPageState("home");
    const cachedData = cachedRecord && cachedRecord.data;
    if (cachedData && Array.isArray(cachedData.takes) && cachedData.takes.length > 0) {
      if (cachedData.section) {
        activeSection = cachedData.section;
      }
      const state = getSectionState(activeSection);
      state.takes = cachedData.takes;
      state.hasMore = cachedData.hasMore !== false;
      state.cursor = cachedData.cursor || null;
      state.loaded = true;
      renderCurrentFeed();
      if (typeof cachedRecord.scroll === "number" && cachedRecord.scroll > 0) {
        window.ClasheCache.restoreScroll("home");
      }
    }
  }

  tryFastSyncHydrate();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFeedPage);
  } else {
    initFeedPage();
  }
})();
