(function () {
  let activeTab = "takes";
  let activeView = "list";
  let currentUser = null;
  let currentProfile = null;
  let currentTakes = [];
  let currentSavedTakes = [];
  let isOwnProfile = true;
  let isFollowing = false;
  let followStats = {
    followersCount: 0,
    followingCount: 0,
  };
  let citationCount = 0;
  let currentFollowListMode = "followers";
  let currentFollowListUsers = [];
  let editProfileAvatarFile = null;
  let editProfileAvatarObjectUrl = "";
  let takesCursor = null;
  let takesHasMore = true;
  let takesLoading = false;
  let savedCursor = null;
  let savedHasMore = true;
  let savedLoading = false;
  let profileScrollQueued = false;
  const PROFILE_PAGE_SIZE = 15;
  const PROFILE_SCROLL_THRESHOLD_PX = 900;
  const CLASHSCORE_POINT_MULTIPLIER = 2;
  const wholeNumberFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  });

  let metaStatusTimer = null;


  function setMetaStatus(message, type) {
    const metaNote = document.getElementById("profile-meta-note");
    if (!metaNote) return;

    // Cancel any pending auto-dismiss
    if (metaStatusTimer) { clearTimeout(metaStatusTimer); metaStatusTimer = null; }

    metaNote.hidden = !message;
    metaNote.textContent = message || "";
    metaNote.classList.remove("is-error", "is-success");
    if (type === "error") metaNote.classList.add("is-error");
    if (type === "success") metaNote.classList.add("is-success");

    // Auto-dismiss success messages after 3 seconds
    if (type === "success" && message) {
      metaStatusTimer = setTimeout(() => {
        metaNote.hidden = true;
        metaNote.textContent = "";
        metaNote.classList.remove("is-error", "is-success");
        metaStatusTimer = null;
      }, 3000);
    }
  }

  function setFeedState(message, type) {
    const stateEl = document.getElementById("profile-feed-state");
    if (!stateEl) return;

    stateEl.hidden = !message;
    stateEl.textContent = message || "";
    stateEl.classList.remove("is-error", "is-success");
    if (type === "error") stateEl.classList.add("is-error");
    if (type === "success") stateEl.classList.add("is-success");
  }

  function setFollowListState(message, type) {
    const stateEl = document.getElementById("follow-list-state");
    if (!stateEl) return;

    stateEl.hidden = !message;
    stateEl.textContent = message || "";
    stateEl.classList.remove("is-error", "is-success");
    if (type === "error") stateEl.classList.add("is-error");
    if (type === "success") stateEl.classList.add("is-success");
  }

  function renderAvatar(avatarEl, profile) {
    if (!avatarEl || !profile) return;

    if (profile.avatar_url) {
      avatarEl.innerHTML = `<img src="${profile.avatar_url}" alt="@${profile.username} profile photo" decoding="async" />`;
      return;
    }

    avatarEl.textContent = window.ClashlyProfiles.initialsFromUsername(profile.username);
  }

  function formatWholeNumber(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return "0";
    return wholeNumberFormatter.format(Math.max(0, Math.floor(numeric)));
  }

  function countTakeImages(take) {
    if (!take) return 0;
    if (Array.isArray(take.image_urls) && take.image_urls.length) {
      return take.image_urls.filter(Boolean).length;
    }
    return take.image_url ? 1 : 0;
  }

  function computeTakeClashscore(take) {
    const vote = take && take.vote ? take.vote : {};
    const agreeVotes = Number(vote.agree_count || 0);
    const disagreeVotes = Number(vote.disagree_count || 0);
    const totalVotes = Number(vote.total_votes || agreeVotes + disagreeVotes || 0);
    const commentCount = Number(take && take.comment_count || 0);
    const imageCount = countTakeImages(take);
    const controversyRatio = totalVotes > 1 ? 1 - Math.abs(agreeVotes - disagreeVotes) / totalVotes : 0;
    const controversyBonus = totalVotes >= 4 ? Math.round(controversyRatio * 6) : 0;

    return 8 + totalVotes + commentCount * 2 + imageCount * 3 + controversyBonus;
  }

  function getDisplayedClashscore(profile, takes) {
    const storedScore = Math.max(0, Number(profile && profile.clashscore || 0));
    const computedScore = (takes || []).reduce((total, take) => total + computeTakeClashscore(take), 0);
    return Math.max(storedScore, computedScore) * CLASHSCORE_POINT_MULTIPLIER;
  }

  function renderProfile(profile, email) {
    const usernameEl = document.getElementById("profile-username");
    const bioEl = document.getElementById("profile-bio");
    const avatarEl = document.getElementById("profile-avatar");
    const takesCountEl = document.getElementById("takes-count");
    const followersCountEl = document.getElementById("followers-count");
    const followingCountEl = document.getElementById("following-count");
    const clashscoreCountEl = document.getElementById("clashscore-count");
    const topArgumentsCountEl = document.getElementById("top-arguments-count");
    const topArgumentsStatEl = document.getElementById("profile-stat-top-arguments");
    const username = profile && profile.username ? `@${profile.username}` : "@username";

    if (usernameEl) usernameEl.textContent = username;
    document.title = `Clashe | ${username}`;

    if (bioEl) {
      bioEl.textContent =
        profile && profile.bio
          ? profile.bio
          : "Add your profile bio from Edit profile to introduce your point of view.";
    }

    if (avatarEl) {
      renderAvatar(avatarEl, profile || { username: (email || "clashe").split("@")[0] });
    }

    if (takesCountEl) takesCountEl.textContent = String(currentTakes.length);
    if (followersCountEl) followersCountEl.textContent = String(followStats.followersCount);
    if (followingCountEl) followingCountEl.textContent = String(followStats.followingCount);
    const clashscore = getDisplayedClashscore(profile, currentTakes);
    if (clashscoreCountEl) clashscoreCountEl.textContent = formatWholeNumber(clashscore);
    if (topArgumentsCountEl) topArgumentsCountEl.textContent = formatWholeNumber(citationCount);
    if (topArgumentsStatEl) {
      topArgumentsStatEl.classList.toggle("has-citations", citationCount > 0);
    }

    renderClashscoreTier(clashscore);
  }

  function renderClashscoreTier(score) {
    const tiersApi = window.ClasheClashscoreTiers || window.ClashlyClashscoreTiers;
    if (!tiersApi || typeof tiersApi.getClashscoreTier !== "function") {
      return;
    }

    const tier = tiersApi.getClashscoreTier(score);
    const tierKey = String(tier && tier.name ? tier.name : "rookie").toLowerCase();

    // 1. Mini badge in stats row
    const statBadge = document.getElementById("clashscore-tier-badge");
    if (statBadge) {
      statBadge.textContent = tier.name;
      statBadge.dataset.tier = tierKey;
    }

    // 2. Full-width progress strip below hero
    const progressCard = document.getElementById("profile-tier-progress");
    const progressBadge = document.getElementById("profile-tier-progress-badge");
    const currentScoreEl = document.getElementById("profile-tier-current-score");
    const statusEl = document.getElementById("profile-tier-progress-status");
    const trackEl = document.getElementById("profile-tier-progress-track");
    const fillEl = document.getElementById("profile-tier-progress-fill");

    if (progressCard) {
      progressCard.dataset.tier = tierKey;
    }

    if (progressBadge) {
      progressBadge.textContent = tier.name;
      progressBadge.dataset.tier = tierKey;
    }

    if (currentScoreEl) {
      currentScoreEl.textContent = formatWholeNumber(score);
    }

    if (statusEl) {
      if (tier.nextTierMinScore === null) {
        statusEl.innerHTML = `
          <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true">
            <path d="M8 1l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 11.8l-4.2 2.2.8-4.7L1.2 6l4.7-.7L8 1z"/>
          </svg>
          <span>Max tier reached</span>
        `;
        statusEl.classList.add("is-max-tier");
        if (trackEl) trackEl.hidden = true;
      } else {
        const allTiers = typeof tiersApi.getAllTiers === "function" ? tiersApi.getAllTiers() : [];
        const nextTier = allTiers[tier.tierIndex + 1];
        const nextTierName = nextTier ? nextTier.name : "";
        const remaining = Math.max(0, tier.nextTierMinScore - score);

        statusEl.textContent = `${formatWholeNumber(score)} / ${formatWholeNumber(tier.nextTierMinScore)} to ${nextTierName}`;
        statusEl.title = `${formatWholeNumber(remaining)} points to ${nextTierName}`;
        statusEl.classList.remove("is-max-tier");

        if (trackEl) {
          trackEl.hidden = false;
          trackEl.setAttribute("aria-valuenow", String(Math.round(tier.progressToNext * 100)));
          trackEl.setAttribute("aria-valuemin", "0");
          trackEl.setAttribute("aria-valuemax", "100");
          trackEl.setAttribute("aria-valuetext", `${Math.round(tier.progressToNext * 100)}% to ${nextTierName}`);
        }

        if (fillEl) {
          fillEl.style.width = `${Math.min(100, Math.max(0, Math.round(tier.progressToNext * 100)))}%`;
          fillEl.dataset.tier = tierKey;
        }
      }
    }
  }

  function renderActionButtons() {
    const editBtn = document.getElementById("edit-profile-trigger");
    const followBtn = document.getElementById("follow-trigger");
    if (!editBtn || !followBtn) return;

    if (isOwnProfile) {
      editBtn.classList.remove("is-hidden");
      followBtn.classList.add("is-hidden");
      return;
    }

    editBtn.classList.add("is-hidden");
    followBtn.classList.remove("is-hidden");
    followBtn.classList.toggle("is-following", isFollowing);
    followBtn.textContent = isFollowing ? "Following" : "Follow";
  }

  function renderOwnerOnlyControls() {
    const settingsBtn = document.querySelector(".profile-head__settings-btn");
    if (settingsBtn instanceof Element) {
      settingsBtn.classList.toggle("is-hidden", !isOwnProfile);
      settingsBtn.setAttribute("aria-hidden", isOwnProfile ? "false" : "true");
    }

    const savedTab = document.querySelector(".profile-tab[data-profile-tab='saved']");
    if (savedTab instanceof HTMLButtonElement) {
      savedTab.classList.toggle("is-hidden", !isOwnProfile);
      savedTab.setAttribute("aria-hidden", isOwnProfile ? "false" : "true");
      savedTab.disabled = !isOwnProfile;
    }

    const navSettingsLink = document.querySelector('.desktop-nav__link[href="settings.html"]');
    if (navSettingsLink instanceof Element) {
      navSettingsLink.classList.toggle("is-hidden", !isOwnProfile);
      navSettingsLink.setAttribute("aria-hidden", isOwnProfile ? "false" : "true");
    }

    if (!isOwnProfile && activeTab === "saved") {
      setActiveTab("takes");
    }
  }

  function setEditProfileStatus(message, type) {
    const statusEl = document.getElementById("edit-profile-status");
    if (!statusEl) return;

    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (type === "error") statusEl.classList.add("is-error");
    if (type === "success") statusEl.classList.add("is-success");
  }

  function closeEditProfileModal() {
    const modal = document.getElementById("edit-profile-modal");
    if (!modal) return;

    modal.classList.remove("is-open");
    window.setTimeout(() => {
      if (!modal.classList.contains("is-open")) {
        modal.hidden = true;
        document.body.style.overflow = "";
        setEditProfileStatus("", "");

        if (editProfileAvatarObjectUrl) {
          URL.revokeObjectURL(editProfileAvatarObjectUrl);
          editProfileAvatarObjectUrl = "";
        }
        editProfileAvatarFile = null;
      }
    }, 220);
  }

  function renderEditAvatarPreview() {
    const previewEl = document.getElementById("edit-profile-avatar-preview");
    if (!previewEl || !currentProfile) return;

    if (editProfileAvatarObjectUrl) {
      previewEl.innerHTML = `<img src="${window.ClashlyUtils.escapeHtml(editProfileAvatarObjectUrl)}" alt="Selected avatar preview" />`;
      return;
    }

    if (currentProfile.avatar_url) {
      previewEl.innerHTML = `<img src="${window.ClashlyUtils.escapeHtml(currentProfile.avatar_url)}" alt="@${window.ClashlyUtils.escapeHtml(
        currentProfile.username || "user"
      )} profile photo" />`;
      return;
    }

    previewEl.textContent = window.ClashlyProfiles.initialsFromUsername(currentProfile.username || "clashe");
  }

  function openEditProfileModal() {
    const modal = document.getElementById("edit-profile-modal");
    if (!modal || !currentProfile || !isOwnProfile) return;

    const usernameInput = document.getElementById("edit-profile-username");
    const bioInput = document.getElementById("edit-profile-bio");
    const dobInput = document.getElementById("edit-profile-dob");
    const avatarInput = document.getElementById("edit-profile-avatar-input");

    if (usernameInput) usernameInput.value = currentProfile.username || "";
    if (bioInput) bioInput.value = currentProfile.bio || "";
    if (dobInput) dobInput.value = currentProfile.date_of_birth || "";
    if (avatarInput) avatarInput.value = "";

    editProfileAvatarFile = null;
    if (editProfileAvatarObjectUrl) {
      URL.revokeObjectURL(editProfileAvatarObjectUrl);
      editProfileAvatarObjectUrl = "";
    }
    renderEditAvatarPreview();
    setEditProfileStatus("", "");

    modal.hidden = false;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      modal.classList.add("is-open");
    });
    window.setTimeout(() => {
      if (usernameInput) usernameInput.focus();
    }, 50);
  }

  async function submitEditProfile(event) {
    event.preventDefault();
    if (!currentUser || !currentProfile || !window.ClashlyProfiles) return;

    const submitBtn = document.getElementById("edit-profile-submit");
    const usernameInput = document.getElementById("edit-profile-username");
    const bioInput = document.getElementById("edit-profile-bio");
    const dobInput = document.getElementById("edit-profile-dob");

    const rawUsername = usernameInput ? usernameInput.value : "";
    const username = window.ClashlyProfiles.normalizeUsername(rawUsername);
    const bio = bioInput ? bioInput.value.trim() : "";
    const dateOfBirth = dobInput ? dobInput.value.trim() : "";
    const gender = currentProfile && currentProfile.gender ? currentProfile.gender : "prefer_not_to_say";
    if (!submitBtn) return;

    if (!window.ClashlyProfiles.isUsernameValid(username)) {
      setEditProfileStatus("Username must be 3-20 chars using lowercase letters, numbers, or _.", "error");
      return;
    }

    if (dateOfBirth && new Date(dateOfBirth) > new Date()) {
      setEditProfileStatus("Date of birth cannot be in the future.", "error");
      return;
    }

    if (bio.length > 280) {
      setEditProfileStatus("Bio must be 280 characters or less.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    setEditProfileStatus("", "");

    try {
      const usernameState = await window.ClashlyProfiles.isUsernameAvailable(username, currentUser.id);
      if (usernameState.error) throw usernameState.error;
      if (!usernameState.available) {
        setEditProfileStatus("That username is already taken.", "error");
        return;
      }

      let avatarUrl = currentProfile.avatar_url || "";
      if (editProfileAvatarFile) {
        const uploadResult = await window.ClashlyProfiles.uploadAvatar(editProfileAvatarFile, currentUser.id);
        if (uploadResult.error) throw uploadResult.error;
        avatarUrl = uploadResult.avatarUrl || avatarUrl;
      }

      const upsertResult = await window.ClashlyProfiles.upsertProfile({
        userId: currentUser.id,
        username,
        bio,
        dateOfBirth,
        gender,
        avatarUrl,
      });

      if (upsertResult.error) throw upsertResult.error;
      currentProfile = upsertResult.profile || currentProfile;

      renderProfile(currentProfile, currentUser.email || "");
      renderActionButtons();
      if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
        window.ClashlyUtils.showToast("Profile updated", "success");
      }
      closeEditProfileModal();
    } catch (error) {
      setEditProfileStatus(window.ClashlyUtils.reportError("Profile update failed.", error, "Could not update profile."), "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save changes";
    }
  }

  function getVoteTotals(takes) {
    return takes.reduce(
      (totals, take) => {
        const vote = take && take.vote ? take.vote : {};
        return {
          agree: totals.agree + Number(vote.agree_count || 0),
          disagree: totals.disagree + Number(vote.disagree_count || 0),
        };
      },
      { agree: 0, disagree: 0 }
    );
  }

  function getPinnedTake(takes) {
    if (!takes.length) return null;
    return [...takes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  }

  function getMostControversialTake(takes) {
    const eligible = takes.filter((take) => {
      const vote = take && take.vote ? take.vote : {};
      return Number(vote.total_votes || 0) >= 4;
    });

    if (!eligible.length) return null;

    return [...eligible].sort((a, b) => {
      const voteA = a.vote || {};
      const voteB = b.vote || {};
      const totalA = Number(voteA.total_votes || 0);
      const totalB = Number(voteB.total_votes || 0);
      const closenessA = totalA ? 1 - Math.abs(Number(voteA.agree_count || 0) - Number(voteA.disagree_count || 0)) / totalA : 0;
      const closenessB = totalB ? 1 - Math.abs(Number(voteB.agree_count || 0) - Number(voteB.disagree_count || 0)) / totalB : 0;

      if (closenessB !== closenessA) return closenessB - closenessA;
      if (totalB !== totalA) return totalB - totalA;
      return new Date(b.created_at) - new Date(a.created_at);
    })[0];
  }

  function renderHighlightCard(container, take, emptyMessage, label) {
    if (!container) return;

    if (!take) {
      container.innerHTML = `<p class="profile-highlight__empty">${emptyMessage}</p>`;
      return;
    }

    const vote = take.vote || {};
    const metaTime = window.ClashlyUtils.formatRelativeTime(take.created_at);
    const stats = [
      `Agree ${Number(vote.agree_count || 0)}`,
      `Disagree ${Number(vote.disagree_count || 0)}`,
      `Votes ${Number(vote.total_votes || 0)}`,
    ];
    const cleanContent =
      window.ClashlyUtils && typeof window.ClashlyUtils.stripTrailingHashtags === "function"
        ? window.ClashlyUtils.stripTrailingHashtags(take.content)
        : take.content;
    const contentMarkup =
      window.ClashlyUtils && typeof window.ClashlyUtils.linkifyHashtags === "function"
        ? window.ClashlyUtils.linkifyHashtags(cleanContent || take.content)
        : window.ClashlyUtils.escapeHtml(cleanContent || take.content);
    const hashtagsMarkup =
      window.ClashlyUtils && typeof window.ClashlyUtils.renderTakeHashtags === "function"
        ? window.ClashlyUtils.renderTakeHashtags(take.content, take.hashtags)
        : "";

    container.innerHTML = `
      <article class="profile-highlight__card">
        <div class="profile-highlight__meta">
          <strong>${window.ClashlyUtils.escapeHtml(label)}</strong>
          <span>${window.ClashlyUtils.escapeHtml(metaTime)}</span>
        </div>
        <p class="profile-highlight__text">${contentMarkup}</p>
        ${hashtagsMarkup}
        <div class="profile-highlight__stats">
          ${stats.map((stat) => `<span>${window.ClashlyUtils.escapeHtml(stat)}</span>`).join("")}
        </div>
      </article>
    `;
  }

  function renderProfileInsights() {
    const takesEl = document.getElementById("summary-takes");
    const agreeEl = document.getElementById("summary-agree");
    const disagreeEl = document.getElementById("summary-disagree");
    const pinnedEl = document.getElementById("profile-pinned-take");
    const controversialEl = document.getElementById("profile-controversial-take");
    const voteTotals = getVoteTotals(currentTakes);

    if (takesEl) takesEl.textContent = String(currentTakes.length);
    if (agreeEl) agreeEl.textContent = String(voteTotals.agree);
    if (disagreeEl) disagreeEl.textContent = String(voteTotals.disagree);

    renderHighlightCard(
      pinnedEl,
      getPinnedTake(currentTakes),
      "No takes yet. Post something sharp and it will anchor this profile.",
      "Latest"
    );
    renderHighlightCard(
      controversialEl,
      getMostControversialTake(currentTakes),
      "No take has enough voting tension yet. A closer agree/disagree split will surface here.",
      "Closest split"
    );
  }

  function setActiveTab(nextTab) {
    activeTab = nextTab;
    document.querySelectorAll(".profile-tab").forEach((button) => {
      button.classList.toggle("profile-tab--active", button.dataset.profileTab === activeTab);
    });
  }

  function setActiveView(nextView) {
    activeView = nextView;
    document.querySelectorAll(".view-toggle__btn").forEach((button) => {
      button.classList.toggle("view-toggle__btn--active", button.dataset.view === activeView);
    });
  }

  function getProfileFeedEmptyMessage(isSavedTab) {
    return isSavedTab ? "No saved takes yet." : "No takes posted yet.";
  }

  function renderProfileFeed() {
    const feedEl = document.getElementById("profile-feed");
    if (!feedEl) return;

    const activeFeedTakes = activeTab === "saved" ? currentSavedTakes : currentTakes;
    const isSavedTab = activeTab === "saved";
    feedEl.classList.remove("profile-feed--grid");

    if (isSavedTab && !isOwnProfile) {
      feedEl.innerHTML = `<p class="feed-empty">Saved takes are private.</p>`;
      setFeedState("Saved takes are only visible to the account owner.", "");
      return;
    }

    if (activeView === "grid") {
      if (activeFeedTakes.length) {
        feedEl.classList.add("profile-feed--grid");
      }
      window.ClashlyTakeRenderer.renderTakeGrid(feedEl, activeFeedTakes, {
        currentUserId: currentUser ? currentUser.id : "",
        showDeleteAction: true,
        emptyMessage: getProfileFeedEmptyMessage(isSavedTab),
      });
    } else {
      window.ClashlyTakeRenderer.renderTakeList(feedEl, activeFeedTakes, {
        compact: true,
        currentUserId: currentUser ? currentUser.id : "",
        showDeleteAction: true,
        emptyMessage: getProfileFeedEmptyMessage(isSavedTab),
      });
    }

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
    window.ClashlyTakeRenderer.bindDeleteActions(feedEl, {
      onStatus: setFeedState,
      onDelete: handleTakeDelete,
    });
    setFeedState(activeFeedTakes.length ? "" : isSavedTab ? "No saved takes yet." : "", "");
  }

  function syncProfileTakeState(takeId) {
    const feedEl = document.getElementById("profile-feed");
    if (!feedEl || !window.ClashlyTakeRenderer || typeof window.ClashlyTakeRenderer.syncTakeState !== "function") return;
    const targetTake =
      currentTakes.find((take) => take.id === takeId) ||
      currentSavedTakes.find((take) => take.id === takeId) ||
      null;
    if (!targetTake) return;
    window.ClashlyTakeRenderer.syncTakeState(feedEl, targetTake);
  }

  async function loadMoreActiveTab() {
    if (!currentUser || !currentProfile) return;

    if (activeTab === "saved") {
      if (!isOwnProfile || savedLoading || !savedHasMore) return;
      savedLoading = true;
      try {
        const savedState = await window.ClashlyTakes.fetchBookmarkedTakes(currentUser.id, {
          limit: PROFILE_PAGE_SIZE,
          currentUserId: currentUser.id,
          cursor: savedCursor,
        });
        if (savedState.error) throw savedState.error;

        const incoming = savedState.takes || [];
        currentSavedTakes = currentSavedTakes.concat(incoming);
        savedCursor = savedState.nextCursor || null;
        savedHasMore = Boolean(savedState.hasMore);
        renderProfileFeed();
      } catch (error) {
        setFeedState(window.ClashlyUtils.reportError("Saved takes pagination failed.", error, "Could not load more saved takes."), "error");
      } finally {
        savedLoading = false;
      }
      return;
    }

    if (takesLoading || !takesHasMore) return;
    takesLoading = true;
    try {
      const takesState = await window.ClashlyTakes.fetchTakesByUser(currentProfile.id, {
        limit: PROFILE_PAGE_SIZE,
        currentUserId: currentUser.id,
        cursor: takesCursor,
      });
      if (takesState.error) throw takesState.error;

      const incoming = takesState.takes || [];
      currentTakes = currentTakes.concat(incoming);
      takesCursor = takesState.nextCursor || null;
      takesHasMore = Boolean(takesState.hasMore);
      renderProfileInsights();
      renderProfileFeed();
    } catch (error) {
      setFeedState(window.ClashlyUtils.reportError("Profile takes pagination failed.", error, "Could not load more takes."), "error");
    } finally {
      takesLoading = false;
    }
  }

  function shouldLoadMoreProfileTab() {
    if (!currentProfile || !currentUser) return false;
    if (activeTab === "saved") {
      if (!isOwnProfile || savedLoading || !savedHasMore) return false;
    } else if (takesLoading || !takesHasMore) {
      return false;
    }

    const viewportBottom = window.scrollY + window.innerHeight;
    const pageBottom = document.documentElement.scrollHeight;
    return viewportBottom >= pageBottom - PROFILE_SCROLL_THRESHOLD_PX;
  }

  function bindProfileInfiniteScroll() {
    window.addEventListener(
      "scroll",
      () => {
        if (profileScrollQueued) return;
        profileScrollQueued = true;
        window.requestAnimationFrame(async () => {
          profileScrollQueued = false;
          if (!shouldLoadMoreProfileTab()) return;
          await loadMoreActiveTab();
        });
      },
      { passive: true }
    );
  }

  function renderFollowList() {
    const bodyEl = document.getElementById("follow-list-body");
    if (!bodyEl) return;

    if (!currentFollowListUsers.length) {
      bodyEl.innerHTML = `<p class="follow-list-empty">No ${currentFollowListMode} yet.</p>`;
      return;
    }

    bodyEl.innerHTML = currentFollowListUsers
      .map((user) => {
        const avatar = user.avatar_url
          ? `<div class="follow-list-item__avatar"><img src="${window.ClashlyUtils.escapeHtml(user.avatar_url)}" alt="@${window.ClashlyUtils.escapeHtml(
              user.username
            )} avatar" loading="lazy" decoding="async" /></div>`
          : `<div class="follow-list-item__avatar">${window.ClashlyProfiles.initialsFromUsername(user.username)}</div>`;
        const action = user.is_self
          ? ""
          : `<button
              type="button"
              class="btn btn--ghost follow-list-item__action${user.is_following ? " is-following" : ""}"
              data-follow-list-action="${user.is_following ? "unfollow" : "follow"}"
              data-user-id="${window.ClashlyUtils.escapeHtml(user.id)}"
            >${user.is_following ? "Following" : "Follow"}</button>`;

        return `
          <article class="follow-list-item">
            ${avatar}
            <div class="follow-list-item__main">
              <a class="follow-list-item__user" href="profile.html?id=${encodeURIComponent(user.id)}">${window.ClashlyUtils.escapeHtml(
                user.username
              )}</a>
              <p class="follow-list-item__bio">${window.ClashlyUtils.escapeHtml(user.bio || "No bio yet.")}</p>
            </div>
            ${action}
          </article>
        `;
      })
      .join("");
  }

  function openFollowListModal(mode) {
    const modal = document.getElementById("follow-list-modal");
    const title = document.getElementById("follow-list-title");
    const eyebrow = document.getElementById("follow-list-eyebrow");
    if (!modal || !title || !eyebrow) return;

    currentFollowListMode = mode === "following" ? "following" : "followers";
    title.textContent = currentFollowListMode === "following" ? "Following" : "Followers";
    eyebrow.textContent = isOwnProfile ? "Your network" : `${currentProfile ? currentProfile.username : "Profile"} network`;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeFollowListModal() {
    const modal = document.getElementById("follow-list-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  async function loadFollowList(mode) {
    if (!currentProfile || !window.ClashlyFollows) return;

    currentFollowListMode = mode === "following" ? "following" : "followers";
    setFollowListState("", "");

    // Show skeleton immediately so modal body isn't blank
    if (typeof window.clasheShowFollowListSkeleton === "function") {
      window.clasheShowFollowListSkeleton("follow-list-body", 6);
    }

    const result = await window.ClashlyFollows.fetchFollowList(currentFollowListMode, currentProfile.id, currentUser ? currentUser.id : "");
    if (result.error) {
      const bodyEl = document.getElementById("follow-list-body");
      if (bodyEl) bodyEl.innerHTML = "";
      setFollowListState(window.ClashlyUtils.reportError("Follow list load failed.", result.error, "Could not load list."), "error");
      return;
    }

    currentFollowListUsers = result.users || [];
    renderFollowList();
    setFollowListState("", "");
  }

  function handleCommentsOpen(input) {
    if (!window.ClashlyCommentsModal) {
      window.location.href = `take.html?id=${encodeURIComponent(input.takeId)}`;
      return;
    }

    const targetTake =
      currentTakes.find((take) => take.id === input.takeId) ||
      currentSavedTakes.find((take) => take.id === input.takeId) ||
      null;
    window.ClashlyCommentsModal.open({
      takeId: input.takeId,
      take: targetTake,
      currentUserId: currentUser ? currentUser.id : "",
    });
  }

  function handleShareOpen(input) {
    const targetTake =
      currentTakes.find((take) => take.id === input.takeId) ||
      currentSavedTakes.find((take) => take.id === input.takeId) ||
      null;

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

  function buildProfileShareUrl(profile) {
    if (!profile || !profile.id) {
      return new URL("profile.html", window.location.href).href;
    }

    const profileUrl = new URL("profile.html", window.location.href);
    profileUrl.searchParams.set("id", profile.id);
    if (profile.username) {
      profileUrl.searchParams.set("u", profile.username);
    }
    return profileUrl.href;
  }

  function setProfileShareStatus(message, type) {
    const statusEl = document.getElementById("profile-share-status");
    if (!statusEl) return;

    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (type === "error") statusEl.classList.add("is-error");
    if (type === "success") statusEl.classList.add("is-success");
  }

  function buildProfileSharePayload() {
    if (!currentProfile || !currentProfile.id) {
      return null;
    }

    const shareUrl = buildProfileShareUrl(currentProfile);
    const username = currentProfile.username ? `@${currentProfile.username}` : "this profile";
    return {
      title: `${username} on Clashe`,
      text: `Check out ${username} on Clashe`,
      url: shareUrl,
    };
  }

  function renderProfileSharePreview(payload) {
    const previewEl = document.getElementById("profile-share-preview");
    if (!previewEl || !payload) return;

    const qrImageUrl = getProfileShareQrImageUrl(payload.url);
    const avatar = currentProfile && currentProfile.avatar_url
      ? `<span class="profile-share-preview__avatar"><img src="${window.ClashlyUtils.escapeHtml(currentProfile.avatar_url)}" alt="" /></span>`
      : `<span class="profile-share-preview__avatar">${window.ClashlyProfiles.initialsFromUsername(
          (currentProfile && currentProfile.username) || "clashe"
        )}</span>`;

    previewEl.innerHTML = `
      <div class="profile-share-preview__qr-frame">
        <img
          class="profile-share-preview__qr"
          src="${qrImageUrl}"
          alt="QR code for ${window.ClashlyUtils.escapeHtml(currentProfile && currentProfile.username ? `@${currentProfile.username}` : "profile")}"
          loading="lazy"
        />
      </div>
      <p class="profile-share-preview__qr-note">Scan to open this profile</p>
      <div class="profile-share-preview__meta">
        ${avatar}
        <div class="profile-share-preview__identity">
          <strong>${window.ClashlyUtils.escapeHtml(currentProfile && currentProfile.username ? `@${currentProfile.username}` : "@profile")}</strong>
        </div>
      </div>
    `;
  }

  function getProfileShareQrImageUrl(profileUrl) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=640x640&margin=0&data=${encodeURIComponent(profileUrl || window.location.href)}`;
  }

  function updateProfileShareLinks(payload) {
    if (!payload) return;

    const shareUrl = encodeURIComponent(payload.url);
    const shareText = encodeURIComponent(payload.text);
    const xLink = document.querySelector("[data-profile-share-link='x']");
    const whatsappLink = document.querySelector("[data-profile-share-link='whatsapp']");
    const facebookLink = document.querySelector("[data-profile-share-link='facebook']");
    const telegramLink = document.querySelector("[data-profile-share-link='telegram']");
    if (xLink) xLink.setAttribute("href", `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`);
    if (whatsappLink) whatsappLink.setAttribute("href", `https://wa.me/?text=${shareText}%20${shareUrl}`);
    if (facebookLink) facebookLink.setAttribute("href", `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`);
    if (telegramLink) telegramLink.setAttribute("href", `https://t.me/share/url?url=${shareUrl}&text=${shareText}`);
  }

  function openProfileShareModal() {
    const modal = document.getElementById("profile-share-modal");
    const payload = buildProfileSharePayload();
    if (!payload) {
      setMetaStatus("Profile is not ready to share yet.", "error");
      return;
    }

    if (!modal) {
      handleProfileDirectShare(payload).catch((error) => {
        setMetaStatus(window.ClashlyUtils.reportError("Profile share failed.", error, "Could not share this profile link."), "error");
      });
      return;
    }

    renderProfileSharePreview(payload);
    updateProfileShareLinks(payload);
    setProfileShareStatus("", "");
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      modal.classList.add("is-open");
    });
  }

  function closeProfileShareModal() {
    const modal = document.getElementById("profile-share-modal");
    if (!modal) return;

    modal.classList.remove("is-open");
    window.setTimeout(() => {
      if (!modal.classList.contains("is-open")) {
        modal.hidden = true;
        document.body.style.overflow = "";
        setProfileShareStatus("", "");
      }
    }, 220);
  }

  async function handleProfileDirectShare(payloadInput) {
    const payload = payloadInput || buildProfileSharePayload();
    if (!payload) {
      setMetaStatus("Profile is not ready to share yet.", "error");
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share(payload);
        if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
          window.ClashlyUtils.showToast("Profile shared", "success");
        }
        return;
      }

      await window.ClashlyUtils.copyText(payload.url);
      if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
        window.ClashlyUtils.showToast("Profile link copied", "success");
      }
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      setMetaStatus(window.ClashlyUtils.reportError("Profile share failed.", error, "Could not share this profile link."), "error");
    }
  }

  async function handleProfileShareAction(actionType) {
    const payload = buildProfileSharePayload();
    if (!payload) {
      setMetaStatus("Profile is not ready to share yet.", "error");
      return;
    }

    if (actionType === "copy-link") {
      try {
        await window.ClashlyUtils.copyText(payload.url);
        setProfileShareStatus("Profile link copied.", "success");
      } catch (error) {
        setProfileShareStatus(window.ClashlyUtils.reportError("Profile share copy failed.", error, "Could not copy profile link."), "error");
      }
      return;
    }

    if (actionType === "download-qr") {
      const qrImageUrl = getProfileShareQrImageUrl(payload.url);
      const usernamePart = currentProfile && currentProfile.username ? currentProfile.username : "profile";
      const filename = `clashe-${usernamePart}-qr.png`;

      try {
        const response = await fetch(qrImageUrl, { mode: "cors" });
        if (!response.ok) {
          throw new Error(`QR image request failed with ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
        setProfileShareStatus("QR code downloaded.", "success");
      } catch (error) {
        try {
          const anchor = document.createElement("a");
          anchor.href = qrImageUrl;
          anchor.download = filename;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setProfileShareStatus("Opened QR image. Save it to download.", "success");
        } catch {
          setProfileShareStatus(window.ClashlyUtils.reportError("QR download failed.", error, "Could not download QR code."), "error");
        }
      }
      return;
    }

    if (actionType === "instagram") {
      try {
        if (navigator.share) {
          try {
            await navigator.share(payload);
            closeProfileShareModal();
            if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
              window.ClashlyUtils.showToast("Profile shared", "success");
            }
            return;
          } catch (error) {
            if (error && error.name === "AbortError") {
              return;
            }
          }
        }

        await window.ClashlyUtils.copyText(payload.url);
        setProfileShareStatus("Link copied. Paste it in Instagram.", "success");
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
      } catch (error) {
        setProfileShareStatus(
          window.ClashlyUtils.reportError("Profile Instagram share failed.", error, "Could not prepare Instagram share."),
          "error"
        );
      }
      return;
    }

    if (actionType === "more") {
      try {
        if (navigator.share) {
          await navigator.share(payload);
          closeProfileShareModal();
          if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
            window.ClashlyUtils.showToast("Profile shared", "success");
          }
          return;
        }

        await window.ClashlyUtils.copyText(payload.url);
        setProfileShareStatus("Profile link copied.", "success");
      } catch (error) {
        if (error && error.name === "AbortError") {
          return;
        }
        setProfileShareStatus(window.ClashlyUtils.reportError("Profile share failed.", error, "Could not share this profile link."), "error");
      }
    }
  }

  function handleProfileShare() {
    openProfileShareModal();
  }

  function handleTakeUpdated(event) {
    const detail = event.detail || {};
    if (!detail.takeId || !detail.vote) return;
    updateTakeVoteState(detail.takeId, {
      vote: detail.vote,
      vote_loading: false,
    });
    renderProfile(currentProfile, currentUser ? currentUser.email || "" : "");
    renderProfileInsights();
    renderProfileFeed();
  }

  function handleTakeBookmarkUpdated(event) {
    const detail = event.detail || {};
    if (!detail.takeId || typeof detail.bookmarked !== "boolean") return;
    updateTakeBookmarkState(detail.takeId, detail.bookmarked);
    renderProfileFeed();
  }

  function updateTakeVoteState(takeId, patch) {
    currentTakes = currentTakes.map((take) => (take.id === takeId ? { ...take, ...patch } : take));
    currentSavedTakes = currentSavedTakes.map((take) => (take.id === takeId ? { ...take, ...patch } : take));
  }

  function updateTakeBookmarkState(takeId, bookmarked) {
    currentTakes = currentTakes.map((take) => (take.id === takeId ? { ...take, bookmarked } : take));

    const existingSavedTake = currentSavedTakes.find((take) => take.id === takeId) || currentTakes.find((take) => take.id === takeId);
    if (bookmarked) {
      if (existingSavedTake && !currentSavedTakes.some((take) => take.id === takeId)) {
        currentSavedTakes = [{ ...existingSavedTake, bookmarked: true }, ...currentSavedTakes];
      } else {
        currentSavedTakes = currentSavedTakes.map((take) => (take.id === takeId ? { ...take, bookmarked: true } : take));
      }
      return;
    }

    currentSavedTakes = currentSavedTakes.filter((take) => take.id !== takeId);
  }

  function updateTakeDeleteLoadingState(takeId, isDeleting) {
    const nextDeleteLoading = Boolean(isDeleting);
    currentTakes = currentTakes.map((take) => (take.id === takeId ? { ...take, delete_loading: nextDeleteLoading } : take));
    currentSavedTakes = currentSavedTakes.map((take) =>
      take.id === takeId ? { ...take, delete_loading: nextDeleteLoading } : take
    );
  }

  function removeTakeFromState(takeId) {
    currentTakes = currentTakes.filter((take) => take.id !== takeId);
    currentSavedTakes = currentSavedTakes.filter((take) => take.id !== takeId);
  }

  async function handleVote(input) {
    if (!currentUser || !currentUser.id) {
      setFeedState("Please log in to vote.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    const target = currentTakes.find((take) => take.id === input.takeId);
    if (!target || target.vote_loading) return;
    const previousVote = target.vote ? { ...target.vote } : null;
    const optimisticVote = window.ClashlyTakes && typeof window.ClashlyTakes.previewVoteSummary === "function"
      ? window.ClashlyTakes.previewVoteSummary(previousVote, input.voteType)
      : previousVote;

    updateTakeVoteState(input.takeId, { vote_loading: true, vote: optimisticVote || target.vote });
    syncProfileTakeState(input.takeId);

    try {
      const voteResult = await window.ClashlyTakes.submitVote({
        userId: currentUser.id,
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
        vote: reconciledVote || target.vote,
      });
      renderProfile(currentProfile, currentUser.email || "");
      renderProfileInsights();
      syncProfileTakeState(input.takeId);
      setFeedState("", "");
    } catch (error) {
      updateTakeVoteState(input.takeId, {
        vote_loading: false,
        vote: previousVote || target.vote,
      });
      syncProfileTakeState(input.takeId);
      throw error;
    }
  }

  async function handleBookmark(input) {
    if (!currentUser || !currentUser.id) {
      setFeedState("Please log in to save takes.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    const target =
      currentTakes.find((take) => take.id === input.takeId) ||
      currentSavedTakes.find((take) => take.id === input.takeId);
    if (!target) return;
    const previousBookmarked = Boolean(target.bookmarked);

    updateTakeBookmarkState(input.takeId, !previousBookmarked);
    syncProfileTakeState(input.takeId);

    try {
      const result = await window.ClashlyTakes.toggleBookmark({
        userId: currentUser.id,
        takeId: input.takeId,
        isBookmarked: input.isBookmarked,
      });

      if (result.error) throw result.error;

      if (result.bookmarked && target && window.ClashlyNotifications) {
        window.ClashlyNotifications.createNotification({
          userId: target.user_id,
          actorId: currentUser.id,
          type: "bookmark",
          targetId: target.id,
          targetTakeId: target.id,
        }).catch(() => {});
      }

      updateTakeBookmarkState(input.takeId, result.bookmarked);
      syncProfileTakeState(input.takeId);
      setFeedState("", "");
    } catch (error) {
      updateTakeBookmarkState(input.takeId, previousBookmarked);
      syncProfileTakeState(input.takeId);
      throw error;
    }
  }

  async function handleTakeDelete(input) {
    if (!currentUser || !currentUser.id) {
      setFeedState("Please log in to delete takes.", "error");
      window.setTimeout(() => {
        window.location.replace("auth.html");
      }, 250);
      return;
    }

    const target =
      currentTakes.find((take) => take.id === input.takeId) ||
      currentSavedTakes.find((take) => take.id === input.takeId) ||
      null;
    if (!target || target.delete_loading) return;
    if (target.user_id !== currentUser.id) {
      setFeedState("You can only delete your own takes.", "error");
      return;
    }

    const confirmed =
      window.ClashlyTakeRenderer && typeof window.ClashlyTakeRenderer.confirmDeleteTake === "function"
        ? await window.ClashlyTakeRenderer.confirmDeleteTake()
        : true;
    if (!confirmed) return;

    updateTakeDeleteLoadingState(input.takeId, true);
    renderProfileFeed();

    try {
      const result = await window.ClashlyTakes.deleteTake({
        userId: currentUser.id,
        takeId: input.takeId,
      });

      if (result.error) throw result.error;

      removeTakeFromState(input.takeId);
      renderProfile(currentProfile, currentUser.email || "");
      renderProfileInsights();
      renderProfileFeed();
      if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
        window.ClashlyUtils.showToast("Take deleted", "success");
      }
    } catch (error) {
      updateTakeDeleteLoadingState(input.takeId, false);
      renderProfileFeed();
      throw error;
    }
  }

  async function loadFollowState() {
    if (!currentProfile || !currentProfile.id || !window.ClashlyFollows) return;

    const statsResult = await window.ClashlyFollows.getFollowStats(currentProfile.id);
    if (!statsResult.error) {
      followStats = {
        followersCount: statsResult.followersCount,
        followingCount: statsResult.followingCount,
      };
    }

    if (!isOwnProfile && currentUser && currentUser.id) {
      const followState = await window.ClashlyFollows.isFollowing(currentUser.id, currentProfile.id);
      if (!followState.error) {
        isFollowing = Boolean(followState.isFollowing);
      }
    } else {
      isFollowing = false;
    }
  }

  async function handleFollowToggle() {
    if (!window.ClashlyFollows || !currentUser || !currentProfile || isOwnProfile) return;

    const button = document.getElementById("follow-trigger");
    if (!button) return;
    button.disabled = true;

    try {
      const result = isFollowing
        ? await window.ClashlyFollows.unfollowUser({
            followerId: currentUser.id,
            followingId: currentProfile.id,
          })
        : await window.ClashlyFollows.followUser({
            followerId: currentUser.id,
            followingId: currentProfile.id,
          });

      if (result.error) throw result.error;

      if (!isFollowing && window.ClashlyNotifications) {
        window.ClashlyNotifications.createNotification({
          userId: currentProfile.id,
          actorId: currentUser.id,
          type: "follow",
          targetId: currentUser.id,
        }).catch(() => {});
      }

      isFollowing = !isFollowing;
      followStats = {
        ...followStats,
        followersCount: Math.max(0, followStats.followersCount + (isFollowing ? 1 : -1)),
      };
      renderProfile(currentProfile, currentUser.email || "");
      renderActionButtons();
      // Silent optimistic update - no intrusive banners
    } catch (error) {
      if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
        window.ClashlyUtils.showToast("Could not update follow state.", "error");
      } else {
        setMetaStatus(window.ClashlyUtils.reportError("Follow toggle failed.", error, "Could not update follow state."), "error");
      }
    } finally {
      button.disabled = false;
    }
  }

  function resolveViewedProfileTarget(currentUserId) {
    const params = new URLSearchParams(window.location.search);
    const requestedId = (params.get("id") || "").trim();
    const requestedUsername = (params.get("u") || "").trim();

    if (requestedId) return { id: requestedId, username: "" };
    if (requestedUsername) return { id: "", username: requestedUsername };
    return { id: currentUserId || "", username: "" };
  }

  async function loadProfileData() {
    if (!window.ClashlyAuth || !window.ClashlyProfiles || !window.ClashlyTakes) return;

    try {
      const userState = await window.ClashlyAuth.getCurrentUser();
      if (userState.error || !userState.user) {
        setMetaStatus("Could not load your account session.", "error");
        return;
      }

      currentUser = userState.user;
      const target = resolveViewedProfileTarget(userState.user.id);
      let profileState = target.id
        ? await window.ClashlyProfiles.getProfileById(target.id)
        : await window.ClashlyProfiles.getProfileByUsername(target.username);

      if ((!profileState || !profileState.profile) && !profileState.error && target.username) {
        profileState = await window.ClashlyProfiles.getProfileByUsername(target.username);
      }

      if (profileState.error) {
        setMetaStatus("Could not load profile details.", "error");
        return;
      }

      if (!profileState.profile) {
        setMetaStatus("Profile not found.", "error");
        return;
      }

      currentProfile = profileState.profile;
      isOwnProfile = currentProfile.id === userState.user.id;
      renderOwnerOnlyControls();
      takesCursor = null;
      takesHasMore = true;
      takesLoading = false;
      savedCursor = null;
      savedHasMore = true;
      savedLoading = false;

      // Fire all independent data fetches concurrently — this is the single
      // biggest perceived-speed win on the profile page. None of these queries
      // depend on each other's results; they only need currentProfile + userState.
      const parallelFetches = [
        window.ClashlyTakes.fetchTakesByUser(currentProfile.id, {
          limit: PROFILE_PAGE_SIZE,
          currentUserId: userState.user.id,
        }),
        isOwnProfile
          ? window.ClashlyTakes.fetchBookmarkedTakes(userState.user.id, {
              limit: PROFILE_PAGE_SIZE,
              currentUserId: userState.user.id,
            })
          : Promise.resolve({ takes: [], nextCursor: null, hasMore: false }),
        loadFollowState(),
        window.ClashlyComments && typeof window.ClashlyComments.getCitationCountForUser === "function"
          ? window.ClashlyComments.getCitationCountForUser(currentProfile.id)
          : Promise.resolve(0),
      ];

      const [takesState, savedState, followState, fetchedCitationCount] = await Promise.all(parallelFetches);
      citationCount = typeof fetchedCitationCount === "number" ? Math.max(0, fetchedCitationCount) : 0;

      if (takesState.error) throw takesState.error;
      currentTakes = takesState.takes || [];
      takesCursor = takesState.nextCursor || null;
      takesHasMore = Boolean(takesState.hasMore);
      takesLoading = false;

      if (savedState && !savedState.error) {
        currentSavedTakes = savedState.takes || [];
        savedCursor = savedState.nextCursor || null;
        savedHasMore = Boolean(savedState.hasMore);
        savedLoading = false;
      } else if (!isOwnProfile) {
        currentSavedTakes = [];
        savedCursor = null;
        savedHasMore = false;
        savedLoading = false;
      }

      // Remove skeleton before rendering real content
      if (typeof window.clasheRemoveProfileSkeleton === "function") {
        window.clasheRemoveProfileSkeleton();
      }

      renderProfile(currentProfile, userState.user.email || "");
      renderActionButtons();
      renderProfileInsights();
      renderProfileFeed();
      setMetaStatus("", "");
    } catch (error) {
      if (typeof window.clasheRemoveProfileSkeleton === "function") {
        window.clasheRemoveProfileSkeleton();
      }
      setMetaStatus(window.ClashlyUtils.reportError("Profile page load failed.", error, "Profile load failed."), "error");
      setFeedState("Could not load profile takes.", "error");
    }
  }

  async function handleTakeCreated() {
    await loadProfileData();
  }

  function bindControls() {
    document.querySelectorAll(".profile-tab").forEach((button) => {
      button.addEventListener("click", () => {
        const nextTab = button.dataset.profileTab || "takes";
        if (nextTab === "saved" && !isOwnProfile) {
          setActiveTab("takes");
          renderProfileFeed();
          return;
        }
        setActiveTab(nextTab);
        renderProfileFeed();
      });
    });

    document.querySelectorAll(".view-toggle__btn").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveView(button.dataset.view || "list");
        renderProfileFeed();
      });
    });

    const followTrigger = document.getElementById("follow-trigger");
    if (followTrigger) {
      followTrigger.addEventListener("click", handleFollowToggle);
    }

    const editTrigger = document.getElementById("edit-profile-trigger");
    if (editTrigger) {
      editTrigger.addEventListener("click", openEditProfileModal);
    }

    const shareProfileTrigger = document.getElementById("share-profile-trigger");
    if (shareProfileTrigger) {
      shareProfileTrigger.addEventListener("click", handleProfileShare);
    }

    const editForm = document.getElementById("edit-profile-form");
    if (editForm) {
      editForm.addEventListener("submit", submitEditProfile);
    }

    const editAvatarInput = document.getElementById("edit-profile-avatar-input");
    if (editAvatarInput) {
      editAvatarInput.addEventListener("change", () => {
        const file = editAvatarInput.files && editAvatarInput.files[0];
        if (!file) {
          if (editProfileAvatarObjectUrl) {
            URL.revokeObjectURL(editProfileAvatarObjectUrl);
            editProfileAvatarObjectUrl = "";
          }
          editProfileAvatarFile = null;
          renderEditAvatarPreview();
          return;
        }

        const imageValidation = window.ClashlyTakes.validateImageFile(file);
        if (!imageValidation.valid) {
          editAvatarInput.value = "";
          setEditProfileStatus(imageValidation.error, "error");
          return;
        }

        if (editProfileAvatarObjectUrl) {
          URL.revokeObjectURL(editProfileAvatarObjectUrl);
        }
        editProfileAvatarFile = file;
        editProfileAvatarObjectUrl = URL.createObjectURL(file);
        renderEditAvatarPreview();
        setEditProfileStatus("", "");
      });
    }

    document.querySelectorAll("[data-open-follow-list]").forEach((button) => {
      button.addEventListener("click", async () => {
        const mode = button.getAttribute("data-open-follow-list") || "followers";
        openFollowListModal(mode);
        await loadFollowList(mode);
      });
    });

    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const closeTrigger = target.closest("[data-close-follow-list='true']");
      if (closeTrigger) {
        event.preventDefault();
        closeFollowListModal();
        return;
      }

      const closeProfileShareTrigger = target.closest("[data-close-profile-share='true']");
      if (closeProfileShareTrigger) {
        event.preventDefault();
        closeProfileShareModal();
        return;
      }

      const closeEditTrigger = target.closest("[data-close-edit-profile='true']");
      if (closeEditTrigger) {
        event.preventDefault();
        closeEditProfileModal();
        return;
      }

      const profileShareAction = target.closest("[data-profile-share-action]");
      if (profileShareAction) {
        event.preventDefault();
        const actionType = profileShareAction.getAttribute("data-profile-share-action") || "";
        await handleProfileShareAction(actionType);
        return;
      }

      const profileShareLink = target.closest("[data-profile-share-link]");
      if (profileShareLink) {
        closeProfileShareModal();
        return;
      }

      const actionBtn = target.closest("[data-follow-list-action]");
      if (!actionBtn || !(actionBtn instanceof HTMLButtonElement) || !currentUser) return;

      const targetUserId = actionBtn.getAttribute("data-user-id") || "";
      if (!targetUserId) return;

      actionBtn.disabled = true;
      try {
        const shouldUnfollow = actionBtn.getAttribute("data-follow-list-action") === "unfollow";
        const result = shouldUnfollow
          ? await window.ClashlyFollows.unfollowUser({
              followerId: currentUser.id,
              followingId: targetUserId,
            })
          : await window.ClashlyFollows.followUser({
              followerId: currentUser.id,
              followingId: targetUserId,
            });

        if (result.error) throw result.error;

        if (!shouldUnfollow && window.ClashlyNotifications) {
          window.ClashlyNotifications.createNotification({
            userId: targetUserId,
            actorId: currentUser.id,
            type: "follow",
            targetId: currentUser.id,
          }).catch(() => {});
        }

        currentFollowListUsers = currentFollowListUsers.map((user) =>
          user.id === targetUserId ? { ...user, is_following: !shouldUnfollow } : user
        );

        if (currentProfile && targetUserId === currentProfile.id) {
          isFollowing = !shouldUnfollow;
          followStats = {
            ...followStats,
            followersCount: Math.max(0, followStats.followersCount + (isFollowing ? 1 : -1)),
          };
          renderProfile(currentProfile, currentUser.email || "");
          renderActionButtons();
        }

        renderFollowList();
      } catch (error) {
        setMetaStatus(window.ClashlyUtils.reportError("Follow list action failed.", error, "Could not update follow state."), "error");
      } finally {
        actionBtn.disabled = false;
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const profileShareModal = document.getElementById("profile-share-modal");
        if (profileShareModal && !profileShareModal.hidden) {
          closeProfileShareModal();
          return;
        }

        const modal = document.getElementById("edit-profile-modal");
        if (modal && !modal.hidden) {
          closeEditProfileModal();
        }
      }
    });
  }

  function handleTakeCreated(event) {
    const newTake = event && event.detail && event.detail.take;
    if (!newTake || !currentProfile || !currentUser) return;
    if (newTake.user_id !== currentProfile.id) return;
    if (!currentTakes.some((t) => t.id === newTake.id)) {
      currentTakes.unshift(newTake);
    }
    const countEl = document.getElementById("takes-count");
    if (countEl) {
      const currentVal = parseInt(countEl.textContent || "0", 10) || 0;
      countEl.textContent = String(currentVal + 1);
    }
    renderProfileInsights();
    renderProfileFeed();
  }

  function handleTakeUpdated(event) {
    const updatedTake = event && event.detail && event.detail.take;
    if (!updatedTake || !updatedTake.id) return;
    currentTakes = currentTakes.map((t) => (t.id === updatedTake.id ? { ...t, ...updatedTake } : t));
    currentSavedTakes = currentSavedTakes.map((t) => (t.id === updatedTake.id ? { ...t, ...updatedTake } : t));
    renderProfileFeed();
  }

  function handleTakeBookmarkUpdated(event) {
    const detail = event && event.detail;
    if (!detail || !detail.takeId) return;
    currentTakes = currentTakes.map((t) => (t.id === detail.takeId ? { ...t, bookmarked: Boolean(detail.bookmarked) } : t));
    if (!detail.bookmarked) {
      currentSavedTakes = currentSavedTakes.filter((t) => t.id !== detail.takeId);
    }
    renderProfileFeed();
    saveCurrentProfileState();
  }

  function saveCurrentProfileState() {
    if (!window.ClasheCache || !currentProfile) return;
    const targetKey = "profile_" + (currentProfile.username || currentProfile.id || "me");
    window.ClasheCache.savePageState(targetKey, {
      profile: currentProfile,
      takes: currentTakes,
      savedTakes: currentSavedTakes,
      isOwnProfile,
      followStats,
      citationCount,
      isFollowing,
    });
  }

  async function initProfileUI() {
    const target = resolveViewedProfileTarget("");
    const cacheKey = "profile_" + (target.username || target.id || "me");
    const cachedRecord = window.ClasheCache ? window.ClasheCache.getPageState(cacheKey) : null;
    const cachedData = cachedRecord && cachedRecord.data;

    if (cachedData && cachedData.profile) {
      // Instant SWR hydration from cache
      currentProfile = cachedData.profile;
      currentTakes = cachedData.takes || [];
      currentSavedTakes = cachedData.savedTakes || [];
      isOwnProfile = Boolean(cachedData.isOwnProfile);
      followStats = cachedData.followStats || followStats;
      citationCount = typeof cachedData.citationCount === "number" ? cachedData.citationCount : 0;
      isFollowing = Boolean(cachedData.isFollowing);

      if (typeof window.clasheRemoveProfileSkeleton === "function") {
        window.clasheRemoveProfileSkeleton();
      }

      renderProfile(currentProfile, "");
      renderActionButtons();
      renderProfileInsights();
      renderProfileFeed();
      if (typeof cachedRecord.scroll === "number" && cachedRecord.scroll > 0) {
        window.ClasheCache.restoreScroll(cacheKey);
      }
    } else {
      // Show skeleton only on first/cold load
      if (typeof window.clasheShowProfileSkeleton === "function") {
        window.clasheShowProfileSkeleton();
      }
      if (typeof window.clasheShowFeedSkeleton === "function") {
        window.clasheShowFeedSkeleton("profile-feed", 4);
      }
    }

    try {
      setActiveTab("takes");
      setActiveView("list");
      bindControls();
      bindProfileInfiniteScroll();

      // Save scroll and profile state before navigating away
      window.addEventListener("pagehide", () => {
        if (window.ClasheCache) {
          saveCurrentProfileState();
          window.ClasheCache.saveScroll(cacheKey);
        }
      });
      window.addEventListener("beforeunload", () => {
        if (window.ClasheCache) {
          saveCurrentProfileState();
          window.ClasheCache.saveScroll(cacheKey);
        }
      });

      const createEvent = (window.ClashlyApp && window.ClashlyApp.createEventName) || "clashly:take-created";
      window.addEventListener(createEvent, handleTakeCreated);
      window.addEventListener("clashly:take-updated", handleTakeUpdated);
      window.addEventListener("clashly:take-bookmark-updated", handleTakeBookmarkUpdated);
      await loadProfileData();
      saveCurrentProfileState();
    } finally {
      if (window.ClasheLoader) {
        window.ClasheLoader.release("page-data");
      }
    }
  }

  function tryFastSyncHydrateProfile() {
    const target = resolveViewedProfileTarget("");
    const cacheKey = "profile_" + (target.username || target.id || "me");
    const cachedRecord = window.ClasheCache ? window.ClasheCache.getPageState(cacheKey) : null;
    const cachedData = cachedRecord && cachedRecord.data;

    if (cachedData && cachedData.profile) {
      currentProfile = cachedData.profile;
      currentTakes = cachedData.takes || [];
      currentSavedTakes = cachedData.savedTakes || [];
      isOwnProfile = Boolean(cachedData.isOwnProfile);
      followStats = cachedData.followStats || followStats;
      citationCount = typeof cachedData.citationCount === "number" ? cachedData.citationCount : 0;
      isFollowing = Boolean(cachedData.isFollowing);

      if (typeof window.clasheRemoveProfileSkeleton === "function") {
        window.clasheRemoveProfileSkeleton();
      }

      renderProfile(currentProfile, "");
      renderActionButtons();
      renderProfileInsights();
      renderProfileFeed();
      if (typeof cachedRecord.scroll === "number" && cachedRecord.scroll > 0) {
        window.ClasheCache.restoreScroll(cacheKey);
      }
    }
  }

  tryFastSyncHydrateProfile();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProfileUI);
  } else {
    initProfileUI();
  }
})();
