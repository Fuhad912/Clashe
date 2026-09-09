(function () {
  const AI_JUDGE_MIN_VOTES = 20;
  const AI_JUDGE_MIN_COMMENTS = 6;
  let currentUserId = "";
  let currentQuery = "";
  let currentTakeResults = [];
  let currentUserResults = [];
  let currentHashtagResults = [];
  let currentTrendingTopics = [];
  let expandedTakeId = "";

  function getQuery() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("q") || "").trim();
  }

  function getExpandedTakeQuery() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("expandTake") || "").trim();
  }

  function normalizeSearchTerm(value) {
    return String(value || "").trim();
  }

  const RECENT_SEARCHES_KEY_PREFIX = "clashe-recent-searches";

  function getRecentSearchesStorageKey() {
    return `${RECENT_SEARCHES_KEY_PREFIX}:${currentUserId || "guest"}`;
  }

  function getRecentSearches() {
    try {
      const raw = window.localStorage.getItem(getRecentSearchesStorageKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => normalizeSearchTerm(item))
        .filter(Boolean)
        .slice(0, 6);
    } catch (_error) {
      return [];
    }
  }

  function saveRecentSearches(items) {
    try {
      window.localStorage.setItem(getRecentSearchesStorageKey(), JSON.stringify((items || []).slice(0, 6)));
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  function addRecentSearch(query) {
    const normalized = normalizeSearchTerm(query);
    if (!normalized) return;

    const deduped = getRecentSearches().filter((item) => item.toLowerCase() !== normalized.toLowerCase());
    deduped.unshift(normalized);
    saveRecentSearches(deduped);
  }

  function goToSearchQuery(query) {
    const normalized = normalizeSearchTerm(query);
    const nextUrl = normalized ? `search.html?q=${encodeURIComponent(normalized)}` : "search.html";
    window.location.href = nextUrl;
  }

  function syncSearchInput() {
    const input = document.getElementById("search-page-input");
    if (!input) return;
    input.value = currentQuery;
  }

  let stateTimer = null;

  function setState(message, type) {
    const stateEl = document.getElementById("search-state");
    if (!stateEl) return;

    // Cancel any pending auto-dismiss
    if (stateTimer) { clearTimeout(stateTimer); stateTimer = null; }

    stateEl.hidden = !message;
    stateEl.textContent = message || "";
    stateEl.classList.remove("is-error", "is-success");
    if (type === "error") stateEl.classList.add("is-error");
    if (type === "success") stateEl.classList.add("is-success");

    // Auto-dismiss success messages after 3 seconds
    if (type === "success" && message) {
      stateTimer = setTimeout(() => {
        stateEl.hidden = true;
        stateEl.textContent = "";
        stateEl.classList.remove("is-error", "is-success");
        stateTimer = null;
      }, 3000);
    }
  }

  function setGroupCount(elementId, count) {
    const countEl = document.getElementById(elementId);
    if (!countEl) return;
    const safeCount = Math.max(0, Number(count || 0));
    countEl.hidden = safeCount === 0;
    countEl.textContent = safeCount ? safeCount.toLocaleString() : "";
  }


  async function decorateUsersWithFollowState(users) {
    const safeUsers = Array.isArray(users) ? users : [];
    if (!safeUsers.length) return [];

    const userIds = safeUsers.map((user) => user && user.id).filter(Boolean);
    if (
      !currentUserId ||
      !window.ClashlyFollows ||
      typeof window.ClashlyFollows.fetchFollowingSet !== "function" ||
      typeof window.ClashlyFollows.fetchFollowerSet !== "function"
    ) {
      return safeUsers.map((user) => ({
        ...user,
        is_self: Boolean(currentUserId && user && user.id === currentUserId),
        is_following: false,
        follows_you: false,
      }));
    }

    const [followState, followerState] = await Promise.all([
      window.ClashlyFollows.fetchFollowingSet(currentUserId, userIds),
      window.ClashlyFollows.fetchFollowerSet(currentUserId, userIds),
    ]);
    if (followState.error) throw followState.error;
    if (followerState.error) throw followerState.error;

    return safeUsers.map((user) => {
      const isFollowing = Boolean(user && followState.followingSet && followState.followingSet.has(user.id));
      const followsYou = Boolean(user && followerState.followerSet && followerState.followerSet.has(user.id));
      return {
        ...user,
        is_self: Boolean(currentUserId && user && user.id === currentUserId),
        is_following: isFollowing,
        follows_you: followsYou,
      };
    });
  }

  function renderUserRelationship(user) {
    if (!user || user.is_self) return "";

    const bits = [];
    if (user.is_following && user.follows_you) {
      bits.push('<span class="search-result__relationship-badge search-result__relationship-badge--mutual">Mutual</span>');
    }
    if (user.follows_you) {
      bits.push('<span class="search-result__relationship-badge">Follows you</span>');
    }

    if (!bits.length) return "";
    return `<div class="search-result__relationship">${bits.join("")}</div>`;
  }

  function setDiscoveryVisibility(isVisible) {
    const discoveryEl = document.getElementById("search-discovery");
    if (!discoveryEl) return;
    discoveryEl.hidden = !isVisible;
  }

  function setExploreVisibility(isVisible) {
    const exploreEl = document.getElementById("search-explore");
    if (!exploreEl) return;
    exploreEl.hidden = !isVisible;
  }

  function setTrendingState(message, type) {
    const stateEl = document.getElementById("search-trending-state");
    if (!stateEl) return;

    stateEl.hidden = !message;
    stateEl.textContent = message || "";
    stateEl.classList.remove("is-error");
    if (type === "error") {
      stateEl.classList.add("is-error");
    }
  }

  function setExploreState(message, type) {
    const stateEl = document.getElementById("search-explore-state");
    if (!stateEl) return;

    stateEl.hidden = !message;
    stateEl.textContent = message || "";
    stateEl.classList.remove("is-error");
    if (type === "error") {
      stateEl.classList.add("is-error");
    }
  }

  function updateHeader() {
    const titleEl = document.getElementById("search-title");
    const subtitleEl = document.getElementById("search-subtitle");
    const backLinkEl = document.getElementById("search-back-link");

    if (!currentQuery) {
      document.title = "Clashe | Search";
      if (titleEl) titleEl.textContent = "Discover";
      if (subtitleEl) subtitleEl.textContent = "Search people, takes, and tags from one social floor.";
      if (backLinkEl) backLinkEl.hidden = true;
      syncSearchInput();
      return;
    }

    document.title = `Clashe | Search: ${currentQuery}`;
    if (titleEl) titleEl.textContent = `Searching "${currentQuery}"`;
    if (subtitleEl) subtitleEl.textContent = "People, takes, and tags moving around the same conversation.";
    if (backLinkEl) backLinkEl.hidden = false;
    syncSearchInput();
  }

  function toCategoryHref(slug) {
    return `category.html?category=${encodeURIComponent(slug)}`;
  }

  function scoreExploreCategory(category, signalSummary) {
    const topCategorySlugs = new Set(
      ((signalSummary && signalSummary.topInterests && signalSummary.topInterests.categories) || []).map((slug) => String(slug || "").toLowerCase())
    );
    const topHashtags = new Set(
      ((signalSummary && signalSummary.topInterests && signalSummary.topInterests.hashtags) || []).map((tag) => String(tag || "").toLowerCase())
    );
    const keywordList = Array.isArray(category.keywords) ? category.keywords.map((keyword) => String(keyword || "").toLowerCase()) : [];
    const trendingMatches = currentTrendingTopics.filter((topic) => keywordList.includes(String(topic.tag || "").toLowerCase())).length;
    const personalMatches = keywordList.filter((keyword) => topHashtags.has(keyword)).length;
    const preferredCategory = topCategorySlugs.has(String(category.slug || "").toLowerCase()) ? 18 : 0;
    return preferredCategory + personalMatches * 6 + trendingMatches * 4 + Math.min(Number(category.take_count || 0), 36);
  }

  function renderExploreSignals(categories, signalSummary) {
    const signalsEl = document.getElementById("search-explore-signals");
    const subtitleEl = document.getElementById("search-explore-subtitle");
    if (!signalsEl || !subtitleEl) return;

    const topCategorySlugs = ((signalSummary && signalSummary.topInterests && signalSummary.topInterests.categories) || []).slice(0, 3);
    const topHashtags = ((signalSummary && signalSummary.topInterests && signalSummary.topInterests.hashtags) || []).slice(0, 4);
    const categoryNameMap = new Map((categories || []).map((category) => [String(category.slug || "").toLowerCase(), category.name]));
    const bits = [
      ...topCategorySlugs.map((slug) => ({
        label: categoryNameMap.get(String(slug || "").toLowerCase()) || slug,
        kind: "lane",
      })),
      ...topHashtags.map((tag) => ({
        label: `#${tag}`,
        kind: "tag",
      })),
    ].slice(0, 6);

    if (!bits.length) {
      signalsEl.hidden = true;
      signalsEl.innerHTML = "";
      subtitleEl.textContent = "Live categories, trending signals, and keyword clusters pulled into one social discovery floor.";
      return;
    }

    subtitleEl.textContent = "Ordered using your recent searches, hashtag trails, and live category momentum.";
    signalsEl.hidden = false;
    signalsEl.innerHTML = bits
      .map(
        (bit) => `
          <span class="search-explore__signal search-explore__signal--${window.ClashlyUtils.escapeHtml(bit.kind)}">
            ${window.ClashlyUtils.escapeHtml(bit.label)}
          </span>
        `
      )
      .join("");
  }

  function renderExploreCategories(categories, signalSummary) {
    const gridEl = document.getElementById("search-explore-grid");
    if (!gridEl) return;

    if (!categories.length) {
      gridEl.hidden = true;
      gridEl.innerHTML = "";
      setExploreState("No lanes are available yet.", "");
      return;
    }

    const ranked = categories
      .slice()
      .sort((left, right) => {
        const scoreDiff = scoreExploreCategory(right, signalSummary) - scoreExploreCategory(left, signalSummary);
        if (scoreDiff !== 0) return scoreDiff;
        const countDiff = Number(right.take_count || 0) - Number(left.take_count || 0);
        if (countDiff !== 0) return countDiff;
        return (Number(left.sort_order || 0) - Number(right.sort_order || 0));
      })
      .slice(0, 8);

    setExploreState("", "");
    gridEl.hidden = false;
    gridEl.innerHTML = ranked
      .map((category) => {
        const takeCount = Number(category.take_count || 0);
        return `
          <article class="search-explore-card">
            <div class="search-explore-card__head">
              <h3 class="search-explore-card__title">
                <a href="${toCategoryHref(category.slug)}">${window.ClashlyUtils.escapeHtml(category.name)}</a>
              </h3>
            </div>
            <footer class="search-explore-card__footer">
              <span class="search-explore-card__stat">${window.ClashlyUtils.escapeHtml(
                `${takeCount} ${takeCount === 1 ? "take" : "takes"}`
              )}</span>
              <a class="search-explore-card__cta" href="${toCategoryHref(category.slug)}">Enter</a>
            </footer>
          </article>
        `;
      })
      .join("");
  }

  function renderAvatar(user) {
    if (user.avatar_url) {
      return `<div class="search-result__avatar"><img src="${window.ClashlyUtils.escapeHtml(user.avatar_url)}" alt="@${window.ClashlyUtils.escapeHtml(
        user.username
      )} avatar" loading="lazy" decoding="async" /></div>`;
    }

    return `<div class="search-result__avatar">${window.ClashlyProfiles.initialsFromUsername(user.username)}</div>`;
  }

  function toProfileHref(user) {
    const params = new URLSearchParams();
    if (user && user.id) params.set("id", user.id);
    if (user && user.username) params.set("u", user.username);
    const query = params.toString();
    return query ? `user.html?${query}` : "user.html";
  }

  function renderUsers(users) {
    const groupEl = document.getElementById("search-users-group");
    const bodyEl = document.getElementById("search-users-body");
    if (!groupEl || !bodyEl) return;

    if (!users.length) {
      groupEl.hidden = true;
      bodyEl.innerHTML = "";
      setGroupCount("search-users-count", 0);
      return;
    }

    groupEl.hidden = false;
    setGroupCount("search-users-count", users.length);
    bodyEl.innerHTML = users
      .map(
        (user) => `
          <article class="search-result search-result--user">
            <a class="search-result__avatar-link" href="${toProfileHref(user)}" aria-label="Open ${window.ClashlyUtils.escapeHtml(user.username)} profile">
              ${renderAvatar(user)}
            </a>
            <div class="search-result__content">
              <div class="search-result__identity">
                <a class="search-result__title" href="${toProfileHref(user)}">${window.ClashlyUtils.escapeHtml(user.username)}</a>
                <span class="search-result__handle">@${window.ClashlyUtils.escapeHtml(user.username)}</span>
              </div>
              ${renderUserRelationship(user)}
              <p class="search-result__meta">${window.ClashlyUtils.escapeHtml(user.bio || "No bio yet.")}</p>
            </div>
            ${
              user.is_self
                ? `<a class="search-result__action" href="${toProfileHref(user)}">Profile</a>`
                : `<button
                    type="button"
                    class="search-result__action${user.is_following ? " is-following" : ""}"
                    data-search-follow-action="${user.is_following ? "unfollow" : "follow"}"
                    data-user-id="${window.ClashlyUtils.escapeHtml(user.id)}"
                  >${user.is_following ? "Following" : "Follow"}</button>`
            }
          </article>
        `
      )
      .join("");
  }

  function renderHashtags(hashtags) {
    const groupEl = document.getElementById("search-hashtags-group");
    const bodyEl = document.getElementById("search-hashtags-body");
    if (!groupEl || !bodyEl) return;

    if (!hashtags.length) {
      groupEl.hidden = true;
      bodyEl.innerHTML = "";
      setGroupCount("search-hashtags-count", 0);
      return;
    }

    groupEl.hidden = false;
    setGroupCount("search-hashtags-count", hashtags.length);
    bodyEl.innerHTML = hashtags
      .map(
        (hashtag) => `
          <article class="search-result search-result--hashtag">
            <div class="search-result__content">
              <a class="search-result__title" href="hashtag.html?tag=${encodeURIComponent(hashtag.tag)}">#${window.ClashlyUtils.escapeHtml(
                hashtag.tag
              )}</a>
              <p class="search-result__meta">Jump into the tag feed.</p>
            </div>
            <a class="search-result__action" href="hashtag.html?tag=${encodeURIComponent(hashtag.tag)}">Open</a>
          </article>
        `
      )
      .join("");
  }

  function renderTakes(takes) {
    const groupEl = document.getElementById("search-takes-group");
    const streamEl = document.getElementById("search-takes-stream");
    if (!groupEl || !streamEl) return;

    if (!takes.length) {
      groupEl.hidden = true;
      streamEl.innerHTML = "";
      expandedTakeId = "";
      setGroupCount("search-takes-count", 0);
      return;
    }

    if (expandedTakeId && !takes.some((take) => take.id === expandedTakeId)) {
      expandedTakeId = "";
    }

    groupEl.hidden = false;
    setGroupCount("search-takes-count", takes.length);
    window.ClashlyTakeRenderer.renderTakeList(streamEl, takes, {
      currentUserId,
      hideCommentsAction: true,
      showAiJudgeAction: true,
      hideInlineAiJudgeResult: true,
      showOpenLink: false,
      toggleOpenAction: true,
      expandedTakeId,
      emptyMessage: "No matching takes.",
    });

    window.ClashlyTakeRenderer.bindShareActions(streamEl, {
      onStatus: setState,
      onShare: handleShareOpen,
    });
    window.ClashlyTakeRenderer.bindVoteActions(streamEl, {
      onStatus: setState,
      onVote: handleVote,
    });
    window.ClashlyTakeRenderer.bindBookmarkActions(streamEl, {
      onStatus: setState,
      onBookmark: handleBookmark,
    });
    window.ClashlyTakeRenderer.bindAiJudgeActions(streamEl, {
      onStatus: setState,
      onAiJudge: handleAiJudge,
    });
    bindTakeExpandActions(streamEl);
  }

  function syncSearchTakeState(takeId) {
    const streamEl = document.getElementById("search-takes-stream");
    if (!streamEl || !window.ClashlyTakeRenderer || typeof window.ClashlyTakeRenderer.syncTakeState !== "function") return;
    const targetTake = currentTakeResults.find((take) => take.id === takeId) || null;
    if (!targetTake) return;
    window.ClashlyTakeRenderer.syncTakeState(streamEl, targetTake);
  }

  function toggleExpandedTake(takeId) {
    const safeTakeId = String(takeId || "").trim();
    if (!safeTakeId) return;
    expandedTakeId = expandedTakeId === safeTakeId ? "" : safeTakeId;
    renderTakes(currentTakeResults);
  }

  function bindTakeExpandActions(streamEl) {
    const toggleButtons = streamEl.querySelectorAll("[data-action='toggle-open']");
    toggleButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const takeId = button.getAttribute("data-take-id") || "";
        toggleExpandedTake(takeId);
      });
    });

    const takeItems = streamEl.querySelectorAll(".take-item--toggleable");
    takeItems.forEach((item) => {
      item.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("a, button, input, select, textarea, label")) return;
        const takeId = item.getAttribute("data-take-id") || "";
        toggleExpandedTake(takeId);
      });
    });
  }

  function updateUserFollowState(userId, isFollowing) {
    currentUserResults = currentUserResults.map((user) =>
      user && user.id === userId ? { ...user, is_following: Boolean(isFollowing) } : user
    );
  }

  async function handleUserFollowToggle(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    const targetUserId = button.getAttribute("data-user-id") || "";
    const action = button.getAttribute("data-search-follow-action") || "follow";
    const shouldUnfollow = action === "unfollow";
    if (!targetUserId) return;

    if (!currentUserId) {
      setState("Please log in to follow people.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    button.disabled = true;

    try {
      if (!window.ClashlyFollows) {
        throw new Error("Follow service unavailable.");
      }

      const result = shouldUnfollow
        ? await window.ClashlyFollows.unfollowUser({
            followerId: currentUserId,
            followingId: targetUserId,
          })
        : await window.ClashlyFollows.followUser({
            followerId: currentUserId,
            followingId: targetUserId,
          });

      if (result.error) throw result.error;

      updateUserFollowState(targetUserId, !shouldUnfollow);
      renderUsers(currentUserResults);
      bindUserActions();
      // Silent optimistic toggle - button updates state cleanly

      if (!shouldUnfollow && window.ClashlyNotifications) {
        window.ClashlyNotifications.createNotification({
          userId: targetUserId,
          actorId: currentUserId,
          type: "follow",
          targetId: currentUserId,
        }).catch(() => {});
      }
    } catch (error) {
      if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
        window.ClashlyUtils.showToast("Could not update follow state.", "error");
      } else {
        setState(window.ClashlyUtils.reportError("Search follow toggle failed.", error, "Could not update follow state."), "error");
      }
    } finally {
      button.disabled = false;
    }
  }

  function bindUserActions() {
    const bodyEl = document.getElementById("search-users-body");
    if (!bodyEl || bodyEl.dataset.followBound === "true") return;

    bodyEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("[data-search-follow-action]");
      if (!(button instanceof HTMLButtonElement)) return;
      event.preventDefault();
      handleUserFollowToggle(button).catch(() => {});
    });

    bodyEl.dataset.followBound = "true";
  }

  function renderEmptyState(hasResults) {
    const emptyEl = document.getElementById("search-empty");
    if (!emptyEl) return;

    if (!currentQuery) {
      emptyEl.hidden = true;
      emptyEl.textContent = "";
      return;
    }

    emptyEl.hidden = hasResults;
    emptyEl.textContent = `No results found for "${currentQuery}".`;
  }

  function formatTrendingVolume(takeCount, engagementCount, score) {
    const rawVolume = Math.max(
      takeCount || 1,
      Math.round((takeCount || 1) * 2 + (engagementCount || 0) * 14 + (score || 0) * 12)
    );

    if (rawVolume >= 1_000_000) {
      return `${(rawVolume / 1_000_000).toFixed(1).replace(/\.0$/, "")}M takes`;
    }
    if (rawVolume >= 1_000) {
      return `${(rawVolume / 1_000).toFixed(1).replace(/\.0$/, "")}K takes`;
    }
    return `${rawVolume.toLocaleString()} takes`;
  }

  function renderTrendingTopics(topics) {
    const listEl = document.getElementById("search-trending-topics");
    if (!listEl) return;

    if (!topics || !topics.length) {
      listEl.hidden = true;
      listEl.innerHTML = "";
      setTrendingState("No trending topics found.", "");
      return;
    }

    setTrendingState("", "");
    currentTrendingTopics = topics.slice();
    listEl.hidden = false;
    listEl.innerHTML = topics
      .map((topic, index) => {
        const keyword = topic.keyword || topic.tag || "";
        const safeKeyword = window.ClashlyUtils.escapeHtml(keyword);
        const category = topic.category || "Debate";
        const safeCategory = window.ClashlyUtils.escapeHtml(category);
        const volumeLabel = formatTrendingVolume(topic.takeCount, topic.engagementCount, topic.score);
        const rank = index + 1;

        return `
          <div
            class="trend-item"
            data-search-term="${safeKeyword}"
            role="button"
            tabindex="0"
            aria-label="${rank}, ${safeCategory} Trending: ${safeKeyword}, ${volumeLabel}"
          >
            <div class="trend-item__lead">
              <span class="trend-item__kicker">${rank} · ${safeCategory} · Trending</span>
              <button type="button" class="trend-item__more" aria-label="More options for ${safeKeyword}" tabindex="-1">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="2"></circle>
                  <circle cx="12" cy="12" r="2"></circle>
                  <circle cx="19" cy="12" r="2"></circle>
                </svg>
              </button>
            </div>
            <div class="trend-item__keyword">${safeKeyword}</div>
            <div class="trend-item__stat">${volumeLabel}</div>
          </div>
        `;
      })
      .join("");
  }

  async function loadTrendingTopics(options = {}) {
    if (!window.ClashlySearch || typeof window.ClashlySearch.fetchTrendingTopics !== "function") {
      return;
    }

    setTrendingState("", "");

    // Show a trending skeleton only if not skipping
    if (!options.skipSkeleton && typeof window.clasheShowTrendingSkeleton === "function") {
      window.clasheShowTrendingSkeleton("search-trending-topics", 4);
    }

    try {
      const result = await window.ClashlySearch.fetchTrendingTopics({
        limit: 8,
        windowHours: 168,
        recentTakeLimit: 250,
      });

      if (result.error) {
        throw result.error;
      }

      renderTrendingTopics(result.topics || []);
      if (window.ClasheCache) {
        window.ClasheCache.savePageState("search", {
          trendingTopics: result.topics || [],
          query: currentQuery,
        });
      }
    } catch (error) {
      const message = window.ClashlyUtils.reportError(
        "Trending topics load failed.",
        error,
        "Could not load live signals right now."
      );
      const gridEl = document.getElementById("search-trending-topics");
      if (gridEl) {
        gridEl.hidden = true;
        gridEl.innerHTML = "";
      }
      currentTrendingTopics = [];
      setTrendingState(message, "error");
    }
  }

  async function loadExploreLanes() {
    if (!window.ClashlyCategories) return;
    if (currentQuery) {
      setExploreVisibility(false);
      return;
    }

    const gridEl = document.getElementById("search-explore-grid");
    if (gridEl && typeof window.clasheShowExploreSkeleton === "function") {
      window.clasheShowExploreSkeleton("search-explore-grid", 4);
      gridEl.hidden = false;
    }

    setExploreState("", "");

    try {
      const [categoriesResult] = await Promise.all([
        window.ClashlyCategories.fetchCategories(),
        currentUserId && window.ClashePersonalization
          ? window.ClashePersonalization.hydrateUserState(currentUserId)
          : Promise.resolve(null),
      ]);

      if (categoriesResult.error) {
        throw categoriesResult.error;
      }

      const signalSummary =
        currentUserId && window.ClashePersonalization
          ? window.ClashePersonalization.getSignalSummary(currentUserId)
          : {
              hasSignals: false,
              topInterests: {
                categories: [],
                hashtags: [],
              },
            };

      renderExploreSignals(categoriesResult.categories || [], signalSummary);
      renderExploreCategories(categoriesResult.categories || [], signalSummary);
    } catch (error) {
      const message = window.ClashlyUtils.reportError(
        "Explore lanes load failed.",
        error,
        "Could not load explore lanes right now."
      );
      if (gridEl) {
        gridEl.hidden = true;
        gridEl.innerHTML = "";
      }
      setExploreState(message, "error");
    }
  }

  function handleCommentsOpen(input) {
    if (!window.ClashlyCommentsModal) {
      window.location.href = `take.html?id=${encodeURIComponent(input.takeId)}`;
      return;
    }

    const targetTake = currentTakeResults.find((take) => take.id === input.takeId) || null;
    window.ClashlyCommentsModal.open({
      takeId: input.takeId,
      take: targetTake,
      currentUserId,
    });
  }

  function handleShareOpen(input) {
    const targetTake = currentTakeResults.find((take) => take.id === input.takeId) || null;
    if (window.ClashlyShareModal) {
      window.ClashlyShareModal.open({
        take: targetTake,
      });
      return;
    }

    window.ClashlyUtils.copyText(input.shareUrl)
      .then(() => setState("", ""))
      .catch((error) => setState(window.ClashlyUtils.reportError("Fallback share failed.", error, "Could not copy link."), "error"));
  }

  function updateTakeVoteState(takeId, patch) {
    currentTakeResults = currentTakeResults.map((take) => (take.id === takeId ? { ...take, ...patch } : take));
  }

  function updateTakeBookmarkState(takeId, bookmarked) {
    currentTakeResults = currentTakeResults.map((take) => (take.id === takeId ? { ...take, bookmarked } : take));
  }

  function updateTakeAiJudgeState(takeId, judgeState) {
    currentTakeResults = currentTakeResults.map((take) => (take.id === takeId ? { ...take, ai_judge: judgeState } : take));
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

  async function handleVote(input) {
    if (!currentUserId) {
      setState("Please log in to vote.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    const target = currentTakeResults.find((take) => take.id === input.takeId);
    if (!target || target.vote_loading) return;
    const previousVote = target.vote ? { ...target.vote } : null;
    const optimisticVote = window.ClashlyTakes && typeof window.ClashlyTakes.previewVoteSummary === "function"
      ? window.ClashlyTakes.previewVoteSummary(previousVote, input.voteType)
      : previousVote;

    updateTakeVoteState(input.takeId, { vote_loading: true, vote: optimisticVote || target.vote });
    syncSearchTakeState(input.takeId);

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
      updateTakeVoteState(input.takeId, {
        vote_loading: false,
        vote: reconciledVote,
      });
      syncSearchTakeState(input.takeId);
      setState("", "");
    } catch (error) {
      updateTakeVoteState(input.takeId, {
        vote_loading: false,
        vote: previousVote || target.vote,
      });
      syncSearchTakeState(input.takeId);
      throw error;
    }
  }

  async function handleBookmark(input) {
    if (!currentUserId) {
      setState("Please log in to save takes.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    const target = currentTakeResults.find((take) => take.id === input.takeId) || null;
    const previousBookmarked = Boolean(target && target.bookmarked);
    updateTakeBookmarkState(input.takeId, !previousBookmarked);
    syncSearchTakeState(input.takeId);
    const result = await window.ClashlyTakes.toggleBookmark({
      userId: currentUserId,
      takeId: input.takeId,
      isBookmarked: input.isBookmarked,
    });

    if (result.error) {
      updateTakeBookmarkState(input.takeId, previousBookmarked);
      syncSearchTakeState(input.takeId);
      throw result.error;
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

    updateTakeBookmarkState(input.takeId, result.bookmarked);
    syncSearchTakeState(input.takeId);
    setState("", "");
  }

  async function handleAiJudge(input) {
    if (!input || !input.takeId) return;
    if (!currentUserId) {
      setState("Please log in to use AI Judge.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    if (!window.ClashlyAiJudge) {
      setState("AI Judge is unavailable right now. Please try again.", "error");
      return;
    }

    const target = currentTakeResults.find((take) => take.id === input.takeId) || null;
    if (!target) return;
    if (target.ai_judge && target.ai_judge.status === "loading") return;

    const eligibility = evaluateAiJudgeEligibility(target);
    if (!eligibility.eligible) {
      setState(eligibility.reason, "error");
      return;
    }

    updateTakeAiJudgeState(input.takeId, {
      status: "loading",
      message: "",
    });
    renderTakes(currentTakeResults);

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
        updateTakeAiJudgeState(input.takeId, null);
        renderTakes(currentTakeResults);
        setState(reason, "error");
        return;
      }

      if ((payload.status === "fresh" || payload.status === "cached") && payload.result) {
        updateTakeAiJudgeState(input.takeId, {
          status: "ready",
          source: payload.status,
          result: payload.result,
        });
        renderTakes(currentTakeResults);
        setState(
          payload.status === "cached"
            ? "Showing recent AI Judge analysis. Open the take for the full breakdown."
            : "AI Judge analysis is ready. Open the take for the full breakdown.",
          ""
        );
        return;
      }

      throw new Error("Unexpected AI Judge response.");
    } catch (error) {
      updateTakeAiJudgeState(input.takeId, {
        status: "error",
        message: "AI Judge is unavailable right now. Please try again.",
      });
      renderTakes(currentTakeResults);
      setState(window.ClashlyUtils.reportError("Search AI Judge failed.", error, "AI Judge is unavailable right now. Please try again."), "error");
    }
  }

  function handleTakeUpdated(event) {
    const detail = event.detail || {};
    if (!detail.takeId || !detail.vote) return;
    updateTakeVoteState(detail.takeId, {
      vote: detail.vote,
      vote_loading: false,
    });
    syncSearchTakeState(detail.takeId);
  }

  function handleTakeBookmarkUpdated(event) {
    const detail = event.detail || {};
    if (!detail.takeId || typeof detail.bookmarked !== "boolean") return;
    updateTakeBookmarkState(detail.takeId, detail.bookmarked);
    syncSearchTakeState(detail.takeId);
  }

  async function loadResults() {
    currentQuery = getQuery();
    expandedTakeId = currentQuery ? getExpandedTakeQuery() : "";
    updateHeader();
    setDiscoveryVisibility(!currentQuery);
    setExploreVisibility(!currentQuery);

    if (!currentQuery) {
      currentTakeResults = [];
      currentUserResults = [];
      currentHashtagResults = [];
      expandedTakeId = "";
      renderTakes([]);
      renderUsers([]);
      renderHashtags([]);
      renderEmptyState(true);
      setState("", "");
      return;
    }

    // Hide status text — skeletons will communicate loading state
    setState("", "");

    // Show skeletons in all three result areas immediately
    const takesStreamEl = document.getElementById("search-takes-stream");
    const usersBodyEl = document.getElementById("search-users-body");
    const takesGroupEl = document.getElementById("search-takes-group");
    const usersGroupEl = document.getElementById("search-users-group");

    if (takesGroupEl && takesStreamEl) {
      takesGroupEl.hidden = false;
      if (typeof window.clasheShowFeedSkeleton === "function") {
        window.clasheShowFeedSkeleton("search-takes-stream", 3);
      }
    }
    if (usersGroupEl && usersBodyEl) {
      usersGroupEl.hidden = false;
      if (typeof window.clasheShowSearchSkeleton === "function") {
        window.clasheShowSearchSkeleton("search-users-body", 3);
      }
    }

    try {
      const result = await window.ClashlySearch.searchAll(currentQuery, {
        currentUserId,
        takeLimit: 10,
        userLimit: 8,
        hashtagLimit: 8,
      });

      if (result.error) {
        throw result.error;
      }

      currentTakeResults = result.takes || [];
      currentUserResults = await decorateUsersWithFollowState(result.users || []);
      currentHashtagResults = result.hashtags || [];
      renderTakes(currentTakeResults);
      renderUsers(currentUserResults);
      renderHashtags(currentHashtagResults);

      const hasResults = currentTakeResults.length || currentUserResults.length || currentHashtagResults.length;
      renderEmptyState(Boolean(hasResults));
      setState("", "");
      addRecentSearch(currentQuery);

      if (currentUserId && window.ClashePersonalization) {
        window.ClashePersonalization.recordSearch(currentUserId, currentQuery).catch(() => {});
      }
    } catch (error) {
      // Clear skeleton placeholders on error
      if (takesGroupEl) takesGroupEl.hidden = true;
      if (usersGroupEl) usersGroupEl.hidden = true;
      const emptyEl = document.getElementById("search-empty");
      if (emptyEl) emptyEl.hidden = true;
      setState(window.ClashlyUtils.reportError("Search load failed.", error, "Could not load search results."), "error");
    }
  }

  async function initSearchPage() {
    try {
      if (!window.ClashlySearch || !window.ClashlyTakeRenderer || !window.ClashlySession) return;

      const searchForm = document.getElementById("search-page-form");
      if (searchForm) {
        searchForm.addEventListener("submit", (event) => {
          event.preventDefault();
          const input = searchForm.querySelector("input[name='q']");
          if (!(input instanceof HTMLInputElement)) return;
          const nextQuery = String(input.value || "").trim();
          goToSearchQuery(nextQuery);
        });
      }

      const trendingTopicsEl = document.getElementById("search-trending-topics");
      if (trendingTopicsEl) {
        const handleTrendSelect = (item) => {
          const term = item.getAttribute("data-search-term") || item.getAttribute("data-trending-tag") || "";
          if (!term) return;
          const input = document.getElementById("search-page-input");
          if (input) {
            input.value = term;
          }
          goToSearchQuery(term);
        };

        trendingTopicsEl.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest(".trend-item__more")) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          const item = target.closest("[data-search-term], [data-trending-tag]");
          if (!item) return;
          event.preventDefault();
          handleTrendSelect(item);
        });

        trendingTopicsEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const item = target.closest("[data-search-term], [data-trending-tag]");
            if (!item) return;
            event.preventDefault();
            handleTrendSelect(item);
          }
        });
      }

      if (window.ClashlySearchSuggestions) {
        window.ClashlySearchSuggestions.attach({
          formId: "search-page-form",
          inputId: "search-page-input",
          getCurrentUserId: () => currentUserId,
          getRecentSearches: () => getRecentSearches(),
        });
      }

      bindUserActions();

      const backLink = document.getElementById("search-back-link");
      if (backLink) {
        backLink.addEventListener("click", (event) => {
          event.preventDefault();
          goToSearchQuery("");
        });
      }

      window.addEventListener("popstate", loadResults);
      window.addEventListener("clashly:take-updated", handleTakeUpdated);
      window.addEventListener("clashly:take-bookmark-updated", handleTakeBookmarkUpdated);

      // Save scroll and search cache before navigating away
      window.addEventListener("pagehide", () => {
        if (window.ClasheCache && currentTrendingTopics.length) {
          window.ClasheCache.savePageState("search", {
            trendingTopics: currentTrendingTopics,
            query: currentQuery,
          });
          window.ClasheCache.saveScroll("search");
        }
      });
      window.addEventListener("beforeunload", () => {
        if (window.ClasheCache && currentTrendingTopics.length) {
          window.ClasheCache.savePageState("search", {
            trendingTopics: currentTrendingTopics,
            query: currentQuery,
          });
          window.ClasheCache.saveScroll("search");
        }
      });

      // Instant SWR hydration from cache
      const cachedSearch = window.ClasheCache ? window.ClasheCache.getPageState("search") : null;
      const cachedData = cachedSearch && cachedSearch.data;
      const hasCachedTrends = Boolean(
        cachedData && Array.isArray(cachedData.trendingTopics) && cachedData.trendingTopics.length > 0
      );

      if (hasCachedTrends) {
        renderTrendingTopics(cachedData.trendingTopics);
        if (typeof cachedSearch.scroll === "number" && cachedSearch.scroll > 0) {
          window.ClasheCache.restoreScroll("search");
        }
      }

      const [sessionState] = await Promise.all([
        window.ClashlySession.resolveSession(),
        loadTrendingTopics({ skipSkeleton: hasCachedTrends }),
        loadExploreLanes(),
      ]);
      currentUserId = sessionState.user ? sessionState.user.id : "";
      await loadResults();
    } finally {
      if (window.ClasheLoader) {
        window.ClasheLoader.release("page-data");
      }
    }
  }

  function tryFastSyncHydrateSearch() {
    const gridEl = document.getElementById("search-trending-topics");
    if (!gridEl || !window.ClasheCache) return;
    const cachedSearch = window.ClasheCache.getPageState("search");
    const cachedData = cachedSearch && cachedSearch.data;
    if (cachedData && Array.isArray(cachedData.trendingTopics) && cachedData.trendingTopics.length > 0) {
      renderTrendingTopics(cachedData.trendingTopics);
      if (typeof cachedSearch.scroll === "number" && cachedSearch.scroll > 0) {
        window.ClasheCache.restoreScroll("search");
      }
    }
  }

  tryFastSyncHydrateSearch();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSearchPage);
  } else {
    initSearchPage();
  }
})();
