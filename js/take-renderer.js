(function () {
  const renderedTakesMap = new Map();

  function getVoteData(take) {
    const vote = take && take.vote ? take.vote : {};
    return {
      agreeCount: Number(vote.agree_count || 0),
      disagreeCount: Number(vote.disagree_count || 0),
      totalVotes: Number(vote.total_votes || 0),
      agreePct: Number(vote.agree_pct || 0),
      disagreePct: Number(vote.disagree_pct || 0),
      userVote: String(vote.user_vote || ""),
      isLoading: false,
    };
  }

  function resolveProfile(take, currentUserId) {
    if (take && take.profile && take.profile.username) {
      return take.profile;
    }

    const userId = (take && take.user_id) || (currentUserId ? String(currentUserId) : "");
    if (userId && window.ClashlyProfiles) {
      let cached = null;
      if (typeof window.ClashlyProfiles.getCachedProfileById === "function") {
        cached = window.ClashlyProfiles.getCachedProfileById(userId);
      } else if (typeof window.ClashlyProfiles.getCachedProfilesByIds === "function") {
        const list = window.ClashlyProfiles.getCachedProfilesByIds([userId]);
        cached = list && list[0];
      }
      if (cached && cached.username) {
        if (take) {
          take.profile = {
            id: cached.id,
            username: cached.username,
            avatar_url: cached.avatar_url || "",
          };
        }
        return cached;
      }
    }

    return take && take.profile ? take.profile : null;
  }

  function getUsername(profile, take, currentUserId) {
    if (profile && profile.username) return String(profile.username);
    if (take) {
      const resolved = resolveProfile(take, currentUserId);
      if (resolved && resolved.username) return String(resolved.username);
    }
    return "anonymous";
  }

  function getAvatarMarkup(profile, take, currentUserId) {
    const resolved = (profile && profile.username) ? profile : (take ? resolveProfile(take, currentUserId) : profile);
    const username = resolved && resolved.username ? resolved.username : "cl";
    const initials = window.ClashlyUtils.initialsFromName(username);

    if (resolved && resolved.avatar_url) {
      return `
        <div class="take-item__avatar">
          <img src="${window.ClashlyUtils.escapeHtml(resolved.avatar_url)}" alt="${window.ClashlyUtils.escapeHtml(
            getUsername(resolved)
          )} avatar" loading="lazy" decoding="async" />
        </div>
      `;
    }

    return `<div class="take-item__avatar">${window.ClashlyUtils.escapeHtml(initials)}</div>`;
  }

  function getOwnerBadge(take, currentUserId) {
    if (!currentUserId || !take || take.user_id !== currentUserId) return "";
    return `<span class="take-owner-badge" title="Owner tools coming soon">Owner</span>`;
  }

  function getTakeImageUrls(take) {
    if (Array.isArray(take && take.image_urls) && take.image_urls.length) {
      return take.image_urls.filter(Boolean).slice(0, 2);
    }
    if (take && take.image_url) {
      const raw = String(take.image_url).trim();
      if (raw.startsWith("[")) {
        try {
          const urls = JSON.parse(raw);
          if (Array.isArray(urls)) return urls.filter((url) => typeof url === "string" && url.trim()).slice(0, 2);
        } catch (_) {}
      }
      return raw ? [raw] : [];
    }
    return [];
  }

  function getProfileHref(take, currentUserId) {
    if (!take || !take.user_id) return "profile.html";

    const resolved = resolveProfile(take, currentUserId);
    const username = resolved && resolved.username ? String(resolved.username) : "";
    if (currentUserId && take.user_id === currentUserId) {
      const ownParams = new URLSearchParams();
      ownParams.set("id", take.user_id);
      if (username) ownParams.set("u", username);
      return `profile.html?${ownParams.toString()}`;
    }

    const params = new URLSearchParams();
    params.set("id", take.user_id);
    if (username) params.set("u", username);
    return `user.html?${params.toString()}`;
  }

  function renderTakeText(content) {
    if (!window.ClashlyUtils || typeof window.ClashlyUtils.linkifyHashtags !== "function") {
      return window.ClashlyUtils.escapeHtml(content);
    }

    return window.ClashlyUtils.linkifyHashtags(content);
  }

  function renderVoteMeta(voteData) {
    if (!voteData.totalVotes) {
      return `<p class="take-vote-meta">No votes yet</p>`;
    }

    return `
      <p class="take-vote-meta">
        Agree ${voteData.agreePct}% &middot; Disagree ${voteData.disagreePct}% &middot; ${voteData.totalVotes} votes
      </p>
    `;
  }

  function renderVoteSplit(voteData) {
    const agreeWidth = voteData.totalVotes ? voteData.agreePct : 50;
    const disagreeWidth = voteData.totalVotes ? voteData.disagreePct : 50;
    return `
      <div class="take-vote-split" aria-hidden="true">
        <span class="take-vote-split__agree" style="width: ${agreeWidth}%"></span>
        <span class="take-vote-split__disagree" style="width: ${disagreeWidth}%"></span>
      </div>
    `;
  }

  function renderInlineAiJudgeResult(take, options) {
    if (options && options.hideInlineAiJudgeResult) return "";

    const judgeState = take && take.ai_judge ? take.ai_judge : null;
    if (!judgeState || !judgeState.status) return "";

    if (judgeState.status === "loading") {
      return `<div class="take-ai-judge take-ai-judge--loading">AI Judge analyzing...</div>`;
    }

    if (judgeState.status === "ineligible" || judgeState.status === "error") {
      return `<div class="take-ai-judge take-ai-judge--note">${window.ClashlyUtils.escapeHtml(
        judgeState.message || "AI Judge is unavailable for this take."
      )}</div>`;
    }

    if (judgeState.status !== "ready" || !judgeState.result) return "";
    const result = judgeState.result;
    const topBits = [];
    if (result.agreeTop && result.agreeTop.excerpt) {
      topBits.push(
        `<p class="take-ai-judge__pick"><strong>Top Agree:</strong> ${window.ClashlyUtils.escapeHtml(result.agreeTop.excerpt)}</p>`
      );
    }
    if (result.disagreeTop && result.disagreeTop.excerpt) {
      topBits.push(
        `<p class="take-ai-judge__pick"><strong>Top Disagree:</strong> ${window.ClashlyUtils.escapeHtml(result.disagreeTop.excerpt)}</p>`
      );
    }

    return `
      <section class="take-ai-judge" aria-label="AI Judge result">
        <p class="take-ai-judge__row"><strong>AI Judge:</strong> ${window.ClashlyUtils.escapeHtml(result.verdict)}</p>
        <p class="take-ai-judge__row"><strong>Confidence:</strong> ${window.ClashlyUtils.escapeHtml(result.confidence)}</p>
        <p class="take-ai-judge__reason">${window.ClashlyUtils.escapeHtml(result.reason)}</p>
        ${topBits.join("")}
      </section>
    `;
  }

  function renderTakeJudgeCountdown(take, options) {
    if (options && options.hideTakeJudgeCountdown) return "";
    const aiJudgeService = window.ClashlyAiJudge || window.ClasheAiJudge;
    if (!aiJudgeService || typeof aiJudgeService.getJudgeEligibilityProgress !== "function") {
      return "";
    }

    const progress = aiJudgeService.getJudgeEligibilityProgress(take);
    if (!progress || progress.alreadyJudged) {
      return "";
    }

    if (progress.hasBothSides && progress.isEligible) {
      return "";
    }

    // Minimum engagement: at least 3 votes OR at least 1 comment
    const hasEngagement = progress.voteCount >= 3 || progress.commentCount >= 1;
    if (!hasEngagement) {
      return "";
    }

    if (!progress.hasBothSides) {
      return `
        <div class="take-judge-countdown take-judge-countdown--side-needed" aria-label="AI Judge requirement">
          <div class="take-judge-countdown__lead">
            <div class="take-judge-countdown__left">
              <span class="take-judge-countdown__icon" aria-hidden="true">${renderActionIcon("balance")}</span>
              <span class="take-judge-countdown__label">Needs votes from both sides before AI Judge can weigh in</span>
            </div>
          </div>
        </div>
      `;
    }

    const missingParts = [];
    if (progress.missingVotes > 0) {
      missingParts.push(`${progress.missingVotes} ${progress.missingVotes === 1 ? "vote" : "votes"}`);
    }
    if (progress.missingComments > 0) {
      missingParts.push(`${progress.missingComments} ${progress.missingComments === 1 ? "comment" : "comments"}`);
    }
    const label = `${missingParts.join(" + ")} until AI Judge verdict`;
    const pct = Math.round(progress.overallProgress * 100);

    return `
      <div class="take-judge-countdown" aria-label="AI Judge progress: ${pct}%">
        <div class="take-judge-countdown__lead">
          <div class="take-judge-countdown__left">
            <span class="take-judge-countdown__icon" aria-hidden="true">${renderActionIcon("judge")}</span>
            <span class="take-judge-countdown__label">${window.ClashlyUtils.escapeHtml(label)}</span>
          </div>
          <span class="take-judge-countdown__pct">${pct}%</span>
        </div>
        <div class="take-judge-countdown__track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="take-judge-countdown__fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }

  function renderActionIcon(name, selected = false) {
    const icons = {
      agree: `
        <i class="app-icon ${selected ? "fa-solid" : "fa-regular"} fa-thumbs-up" aria-hidden="true"></i>
      `,
      disagree: `
        <i class="app-icon ${selected ? "fa-solid" : "fa-regular"} fa-thumbs-down" aria-hidden="true"></i>
      `,
      comments: `
        <i class="app-icon fa-regular fa-comment" aria-hidden="true"></i>
      `,
      bookmark: `
        <i class="app-icon ${selected ? "fa-solid" : "fa-regular"} fa-bookmark" aria-hidden="true"></i>
      `,
      share: `
        <i class="app-icon fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i>
      `,
      judge: `
        <i class="app-icon fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
      `,
      balance: `
        <i class="app-icon fa-solid fa-scale-balanced" aria-hidden="true"></i>
      `,
      delete: `
        <i class="app-icon fa-solid fa-trash-can" aria-hidden="true"></i>
      `,
      pin: `
        <i class="app-icon fa-solid fa-thumbtack" aria-hidden="true"></i>
      `,
      more: `
        <i class="app-icon fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
      `,
    };

    return icons[name] || "";
  }

  function renderActionRow(take, options) {
    if (options && options.hideActionRow) {
      return "";
    }

    const voteData = getVoteData(take);
    const agreeSelected = voteData.userVote === "agree" ? " is-selected" : "";
    const disagreeSelected = voteData.userVote === "disagree" ? " is-selected" : "";
    const bookmarkSelected = take && take.bookmarked ? " is-selected" : "";
    const bookmarkLabel = take && take.bookmarked ? "Saved" : "Save";
    const commentCount = Number((take && take.comment_count) || 0);
    const commentCountMarkup =
      commentCount > 0
        ? `<span class="take-action__count take-action__count--comments">${window.ClashlyUtils.escapeHtml(
            commentCount.toLocaleString()
          )}</span>`
        : "";
    const commentsLabel = commentCount > 0 ? `Open comments (${commentCount})` : "Open comments";
    const loadingAttr = voteData.isLoading ? " disabled" : "";
    const shareUrl = window.ClashlyUtils.toTakeUrl(take.id);
    const shareAction =
      options && options.hideShareAction
        ? ""
        : `
      <button
        type="button"
        class="take-action take-action--share"
        data-action="share"
        data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
        data-share-url="${window.ClashlyUtils.escapeHtml(shareUrl)}"
        aria-label="Share take"
        title="Share take"
      >
        <span class="take-action__icon">${renderActionIcon("share")}</span>
      </button>
    `;
    const commentsAction =
      options && options.hideCommentsAction
        ? ""
        : `<a
            href="take.html?id=${encodeURIComponent(take.id)}"
            class="take-action take-action--comments"
            data-action="comments"
            data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
            aria-label="${commentsLabel}"
            title="${commentsLabel}"
          >
            <span class="take-action__lead">
              <span class="take-action__icon">${renderActionIcon("comments")}</span>
              ${commentCountMarkup}
            </span>
          </a>`;
    const showAiJudgeAction = Boolean(options && options.showAiJudgeAction);
    const currentUserId = options && options.currentUserId ? String(options.currentUserId) : "";
    const canDeleteTake = Boolean(options && options.showDeleteAction && currentUserId && take && take.user_id === currentUserId);
    const canPinTake = Boolean(options && options.showPinAction && currentUserId && take && take.user_id === currentUserId);
    const isPinned = Boolean(take && take.is_pinned);
    const judgeAction = showAiJudgeAction
      ? `<button
          type="button"
          class="take-action take-action--judge"
          data-action="ai-judge"
          data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
          ${take && take.ai_judge && take.ai_judge.status === "loading" ? "disabled" : ""}
          aria-label="Analyze with AI Judge"
          title="Analyze with AI Judge"
        >
          <span class="take-action__lead">
            <span class="take-action__icon take-action__icon--judge">${renderActionIcon("judge")}</span>
            <span>Judge</span>
          </span>
        </button>`
      : "";
    const pinAction = canPinTake
      ? `<button
          type="button"
          class="take-action take-action--pin${isPinned ? " is-pinned" : ""}"
          data-action="pin-take"
          data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
          data-pinned="${isPinned ? "true" : "false"}"
          ${take && take.pin_loading ? "disabled" : ""}
          aria-label="${isPinned ? "Unpin take" : "Pin take to profile"}"
          title="${isPinned ? "Unpin take" : "Pin take to profile"}"
        >
          <span class="take-action__icon">${renderActionIcon("pin", isPinned)}</span>
        </button>`
      : "";
    const deleteAction = canDeleteTake
      ? `<button
          type="button"
          class="take-action take-action--delete"
          data-action="delete-take"
          data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
          ${take && take.delete_loading ? "disabled" : ""}
          aria-label="${take && take.delete_loading ? "Deleting take" : "Delete take"}"
          title="${take && take.delete_loading ? "Deleting take" : "Delete take"}"
        >
          <span class="take-action__icon">${renderActionIcon("delete")}</span>
        </button>`
      : "";
    const saveAction = `
      <button
        type="button"
        class="take-action take-action--bookmark take-item__save-action${bookmarkSelected}"
        data-action="bookmark"
        data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
        data-bookmarked="${take && take.bookmarked ? "true" : "false"}"
        aria-pressed="${take && take.bookmarked ? "true" : "false"}"
        aria-label="${bookmarkLabel} take"
        title="${bookmarkLabel} take"
      >
        <span class="take-action__icon">${renderActionIcon("bookmark", Boolean(take && take.bookmarked))}</span>
      </button>
    `;

    return `
      <footer class="take-item__actions-wrapper" aria-label="Take actions">
        <div class="take-item__actions-top">
          <div class="take-item__actions" aria-label="Primary take actions">
            <button
              type="button"
              class="take-action take-action--vote take-action--agree${agreeSelected}"
              data-action="vote"
              data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
              data-vote-type="agree"
              aria-label="Agree with take"
              aria-pressed="${voteData.userVote === "agree" ? "true" : "false"}"
              ${loadingAttr}
            >
              <span class="take-action__stack">
                <span class="take-action__icon">${renderActionIcon("agree", voteData.userVote === "agree")}</span>
                <span class="take-action__label">Agree</span>
                <span class="take-action__count">${voteData.agreeCount}</span>
              </span>
            </button>
            <button
              type="button"
              class="take-action take-action--vote take-action--disagree${disagreeSelected}"
              data-action="vote"
              data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
              data-vote-type="disagree"
              aria-label="Disagree with take"
              aria-pressed="${voteData.userVote === "disagree" ? "true" : "false"}"
              ${loadingAttr}
            >
              <span class="take-action__stack">
                <span class="take-action__icon">${renderActionIcon("disagree", voteData.userVote === "disagree")}</span>
                <span class="take-action__label">Disagree</span>
                <span class="take-action__count">${voteData.disagreeCount}</span>
              </span>
            </button>
            ${commentsAction}
            ${shareAction}
            ${pinAction}
            ${deleteAction}
          </div>
          <div class="take-item__actions-side" aria-label="Secondary take actions">
            ${judgeAction}
            ${saveAction}
          </div>
        </div>
        ${renderVoteSplit(voteData)}
        ${renderVoteMeta(voteData)}
        ${renderTakeJudgeCountdown(take, options)}
        ${renderInlineAiJudgeResult(take, options)}
      </footer>
    `;
  }

  function renderListItem(take, options) {
    const compactClass = options.compact ? " take-item--compact" : "";
    const expandedClass = options && options.isExpanded ? " is-expanded" : "";
    const toggleableClass = options && options.toggleOpenAction ? " take-item--toggleable" : "";
    const currentUserId = options && options.currentUserId ? String(options.currentUserId) : "";
    const resolvedProfile = resolveProfile(take, currentUserId);
    const username = getUsername(resolvedProfile, take, currentUserId);
    const isAnonymous = username === "anonymous";
    const profileHref = getProfileHref(take, currentUserId);
    const takeHrefSuffix = options && options.takeHrefSuffix ? String(options.takeHrefSuffix) : "";
    const takeHref = take && take.id ? `take.html?id=${encodeURIComponent(take.id)}${takeHrefSuffix}` : "take.html";
    const relativeTime = window.ClashlyUtils.formatRelativeTime(take.created_at);
    const avatarMarkup = getAvatarMarkup(resolvedProfile, take, currentUserId);
    const imageUrls = getTakeImageUrls(take);
    const hasImage = imageUrls.length > 0;
    const ownerBadge = getOwnerBadge(take, options.currentUserId);
    const openLink = options.showOpenLink
      ? options && options.toggleOpenAction
        ? `<button
            type="button"
            class="take-item__open"
            data-action="toggle-open"
            data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
            aria-expanded="${options.isExpanded ? "true" : "false"}"
          >${options.isExpanded ? "Close" : "Open"}</button>`
        : `<a href="${takeHref}" class="take-item__open">Open</a>`
      : "";
    if (take && take.id) {
      renderedTakesMap.set(take.id, take);
    }
    const showMoreAction = Boolean(
      options && (options.showMoreAction || options.showPinAction || options.showDeleteAction)
    );
    const headerAction = showMoreAction
      ? `
      <button
        type="button"
        class="take-action take-item__more-btn"
        data-action="take-more"
        data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
        data-take-user-id="${window.ClashlyUtils.escapeHtml(take.user_id || "")}"
        data-take-is-pinned="${take.is_pinned ? "1" : "0"}"
        aria-label="More options"
        title="More options"
      >
        <span class="take-action__icon">${renderActionIcon("more")}</span>
      </button>
    `
      : options && options.hideShareAction
      ? ""
      : `
      <button
        type="button"
        class="take-action take-action--share take-item__share-mobile"
        data-action="share"
        data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
        data-share-url="${window.ClashlyUtils.escapeHtml(window.ClashlyUtils.toTakeUrl(take.id))}"
        aria-label="Share take"
        title="Share take"
      >
        <span class="take-action__icon">${renderActionIcon("share")}</span>
      </button>
    `;
    const mediaMarkup = hasImage
      ? imageUrls.length === 1
        ? `
          <div class="take-item__media" data-media-shape="pending">
            <img
              src="${window.ClashlyUtils.escapeHtml(imageUrls[0])}"
              alt="Take image from ${window.ClashlyUtils.escapeHtml(username)}"
              loading="lazy"
              decoding="async"
              onload="window.ClashlyTakeRenderer.applyImageAspectRatio(this)"
            />
          </div>
        `
        : `
          <div class="take-item__media take-item__media--split">
            ${imageUrls
              .map(
                (imageUrl, index) => `
                  <div class="take-item__media-slot">
                    <img
                      src="${window.ClashlyUtils.escapeHtml(imageUrl)}"
                      alt="Take image ${index + 1} from ${window.ClashlyUtils.escapeHtml(username)}"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                `
              )
              .join("")}
          </div>
        `
      : "";

    const cleanContent =
      window.ClashlyUtils && typeof window.ClashlyUtils.stripTrailingHashtags === "function"
        ? window.ClashlyUtils.stripTrailingHashtags(take.content)
        : take.content;
    const hashtagsMarkup =
      window.ClashlyUtils && typeof window.ClashlyUtils.renderTakeHashtags === "function"
        ? window.ClashlyUtils.renderTakeHashtags(take.content, take.hashtags)
        : "";
    const textMarkup = cleanContent
      ? `<p class="take-item__text">${renderTakeText(cleanContent)}</p>`
      : "";

    const pinnedBadge =
      take && take.is_pinned
        ? `<div class="take-pinned-header">
            <i class="app-icon fa-solid fa-thumbtack" aria-hidden="true"></i>
            <span>Pinned take</span>
          </div>`
        : "";

    const needsProfileAttr =
      isAnonymous && take && take.user_id
        ? ` data-needs-profile-user-id="${window.ClashlyUtils.escapeHtml(take.user_id)}"`
        : "";

    return `
      <article class="take-item${compactClass}${expandedClass}${toggleableClass}" data-take-id="${window.ClashlyUtils.escapeHtml(
        take.id
      )}"${needsProfileAttr}>
        ${avatarMarkup}
        <div class="take-item__body">
          ${pinnedBadge}
          <header class="take-item__meta">
            <div class="take-item__meta-main">
              <a href="${profileHref}" class="take-item__user">${window.ClashlyUtils.escapeHtml(username)}</a>
              <span class="take-item__dot">&bull;</span>
              <time datetime="${window.ClashlyUtils.escapeHtml(take.created_at)}">${window.ClashlyUtils.escapeHtml(
                relativeTime
              )}</time>
              ${ownerBadge}
              ${openLink}
            </div>
            ${headerAction}
          </header>
          ${textMarkup}
          ${hashtagsMarkup}
          ${mediaMarkup}
          ${renderActionRow(take, options)}
        </div>
      </article>
    `;
  }

  function renderGridItem(take, options) {
    if (take && take.id) {
      renderedTakesMap.set(take.id, take);
    }
    const currentUserId = options && options.currentUserId ? String(options.currentUserId) : "";
    const resolvedProfile = resolveProfile(take, currentUserId);
    const username = getUsername(resolvedProfile, take, currentUserId);
    const relativeTime = window.ClashlyUtils.formatRelativeTime(take.created_at);
    const voteData = getVoteData(take);
    const cleanContent =
      window.ClashlyUtils && typeof window.ClashlyUtils.stripTrailingHashtags === "function"
        ? window.ClashlyUtils.stripTrailingHashtags(take.content)
        : take.content;
    const excerpt = renderTakeText(cleanContent || take.content);
    const imageUrls = getTakeImageUrls(take);
    const hasImage = imageUrls.length > 0;
    const canDeleteTake = Boolean(options && options.showDeleteAction && currentUserId && take && take.user_id === currentUserId);
    const canPinTake = Boolean(options && options.showPinAction && currentUserId && take && take.user_id === currentUserId);
    const isPinned = Boolean(take && take.is_pinned);
    const userVoteLabel =
      voteData.userVote === "agree"
        ? `<span class="profile-grid-vote profile-grid-vote--agree">You agreed</span>`
        : voteData.userVote === "disagree"
          ? `<span class="profile-grid-vote profile-grid-vote--disagree">You disagreed</span>`
          : "";
    const isMultiImage = imageUrls.length > 1;
    const hasExcerpt = Boolean(excerpt && excerpt.trim());
    const overlayMarkup = hasExcerpt
      ? `
          <div class="profile-grid-take__overlay">
            <p class="profile-grid-take__excerpt">${excerpt}</p>
          </div>
        `
      : "";
    const mediaMarkup = hasImage
      ? isMultiImage
        ? `
        <div class="profile-grid-take__media-wrap profile-grid-take__media-wrap--split">
          ${imageUrls
            .slice(0, 2)
            .map(
              (imageUrl, index) => `
                <div class="profile-grid-take__media-slot">
                  <img
                    class="profile-grid-take__media"
                    src="${window.ClashlyUtils.escapeHtml(imageUrl)}"
                    alt="Take image ${index + 1} from ${window.ClashlyUtils.escapeHtml(username)}"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              `
            )
            .join("")}
          ${overlayMarkup}
        </div>
      `
        : `
        <div class="profile-grid-take__media-wrap">
          <img class="profile-grid-take__media" src="${window.ClashlyUtils.escapeHtml(
            imageUrls[0]
          )}" alt="Take image from ${window.ClashlyUtils.escapeHtml(username)}" loading="lazy" decoding="async" />
          ${overlayMarkup}
        </div>
      `
      : `
        <div class="profile-grid-take__body">
          <p class="profile-grid-take__excerpt">${excerpt}</p>
        </div>
      `;
    const pinButton = canPinTake
      ? `<button
          type="button"
          class="profile-grid-take__pin${isPinned ? " is-pinned" : ""}"
          data-action="pin-take"
          data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
          data-pinned="${isPinned ? "true" : "false"}"
          ${take && take.pin_loading ? "disabled" : ""}
          aria-label="${isPinned ? "Unpin take" : "Pin take"}"
          title="${isPinned ? "Unpin take" : "Pin take"}"
        >
          ${renderActionIcon("pin", isPinned)}
        </button>`
      : "";
    const gridShareButton = options && options.showGridShareAction
      ? `<button type="button" class="profile-grid-take__share" data-action="share"
          data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
          data-share-url="${window.ClashlyUtils.escapeHtml(window.ClashlyUtils.toTakeUrl(take.id))}"
          aria-label="Share take" title="Share take">${renderActionIcon("share")}</button>`
      : "";
    const pinnedBadge = isPinned
      ? `<span class="profile-grid-take__pinned-badge" title="Pinned take">
          <i class="app-icon fa-solid fa-thumbtack" aria-hidden="true"></i>
          <span>Pinned</span>
        </span>`
      : "";
    const deleteButton = canDeleteTake
      ? `<button
          type="button"
          class="profile-grid-take__delete"
          data-action="delete-take"
          data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
          ${take && take.delete_loading ? "disabled" : ""}
          aria-label="${take && take.delete_loading ? "Deleting take" : "Delete take"}"
          title="${take && take.delete_loading ? "Deleting take" : "Delete take"}"
        >
          ${renderActionIcon("delete")}
        </button>`
      : "";
    const moreButton = options && options.showMoreAction
      ? `<button type="button" class="profile-grid-take__more" data-action="take-more"
          data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}"
          data-take-user-id="${window.ClashlyUtils.escapeHtml(take.user_id || "")}"
          data-take-is-pinned="${isPinned ? "1" : "0"}"
          aria-label="More options" title="More options">${renderActionIcon("more")}</button>`
      : "";

    return `
      <article class="profile-grid-take${hasImage ? " profile-grid-take--with-image" : " profile-grid-take--text-only"}" data-take-id="${window.ClashlyUtils.escapeHtml(
        take.id
      )}" data-action="comments">
        ${pinnedBadge}
        ${gridShareButton}
        ${pinButton}
        ${deleteButton}
        ${moreButton}
        ${mediaMarkup}
        <div class="profile-grid-take__meta">
          <span class="profile-grid-take__user">${window.ClashlyUtils.escapeHtml(username)}</span>
          <span>${window.ClashlyUtils.escapeHtml(relativeTime)}</span>
          <span>Agree ${voteData.agreeCount} | Disagree ${voteData.disagreeCount}</span>
          ${userVoteLabel}
        </div>
      </article>
    `;
  }

  function renderTakeList(container, takes, options) {
    const safeOptions = options || {};
    const emptyMessage = safeOptions.emptyMessage || "No takes yet.";
    if (!takes.length) {
      container.innerHTML = `<p class="feed-empty">${window.ClashlyUtils.escapeHtml(emptyMessage)}</p>`;
      return;
    }

    container.innerHTML = takes
      .map((take) =>
        renderListItem(take, {
          compact: Boolean(safeOptions.compact),
          currentUserId: safeOptions.currentUserId || "",
          hideCommentsAction: Boolean(safeOptions.hideCommentsAction),
          hideShareAction: Boolean(safeOptions.hideShareAction),
          showAiJudgeAction: Boolean(safeOptions.showAiJudgeAction),
          showDeleteAction: Boolean(safeOptions.showDeleteAction),
          showPinAction: Boolean(safeOptions.showPinAction),
          showMoreAction: Boolean(safeOptions.showMoreAction),
          hideActionRow: Boolean(safeOptions.hideActionRow),
          hideInlineAiJudgeResult: Boolean(safeOptions.hideInlineAiJudgeResult),
          showOpenLink: Boolean(safeOptions.showOpenLink),
          toggleOpenAction: Boolean(safeOptions.toggleOpenAction),
          isExpanded: safeOptions.expandedTakeId === take.id,
          takeHrefSuffix: safeOptions.takeHrefSuffix || "",
        })
      )
      .join("");

    hydrateCachedImages(container);
    hydrateMissingTakeProfiles(container, safeOptions);
  }

  function appendTakeList(container, takes, options) {
    if (!container || !takes || !takes.length) return;
    const safeOptions = options || {};

    const emptyEl = container.querySelector(".feed-empty");
    if (emptyEl) emptyEl.remove();

    const html = takes
      .map((take) =>
        renderListItem(take, {
          compact: Boolean(safeOptions.compact),
          currentUserId: safeOptions.currentUserId || "",
          hideCommentsAction: Boolean(safeOptions.hideCommentsAction),
          hideShareAction: Boolean(safeOptions.hideShareAction),
          showAiJudgeAction: Boolean(safeOptions.showAiJudgeAction),
          showDeleteAction: Boolean(safeOptions.showDeleteAction),
          showPinAction: Boolean(safeOptions.showPinAction),
          showMoreAction: Boolean(safeOptions.showMoreAction),
          hideActionRow: Boolean(safeOptions.hideActionRow),
          hideInlineAiJudgeResult: Boolean(safeOptions.hideInlineAiJudgeResult),
          showOpenLink: Boolean(safeOptions.showOpenLink),
          toggleOpenAction: Boolean(safeOptions.toggleOpenAction),
          isExpanded: safeOptions.expandedTakeId === take.id,
          takeHrefSuffix: safeOptions.takeHrefSuffix || "",
        })
      )
      .join("");

    container.insertAdjacentHTML("beforeend", html);
    hydrateCachedImages(container);
    hydrateMissingTakeProfiles(container, safeOptions);
  }

  function renderTakeGrid(container, takes, options) {
    const safeOptions = options || {};
    const emptyMessage = safeOptions.emptyMessage || "No takes yet.";
    if (!takes.length) {
      container.innerHTML = `<p class="feed-empty">${window.ClashlyUtils.escapeHtml(emptyMessage)}</p>`;
      return;
    }

    container.innerHTML = takes.map((take) => renderGridItem(take, safeOptions)).join("");
  }

  function escapeAttributeSelector(value) {
    const safeValue = String(value || "");
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(safeValue);
    }
    return safeValue.replace(/"/g, '\\"');
  }

  function getTakeElements(rootEl, takeId) {
    if (!rootEl || !takeId) return [];
    const escaped = escapeAttributeSelector(takeId);
    const containerSelector = `article.take-item[data-take-id="${escaped}"], article.profile-grid-take[data-take-id="${escaped}"]`;
    if (rootEl instanceof Element && rootEl.matches(containerSelector)) {
      return [rootEl];
    }
    if (typeof rootEl.querySelectorAll !== "function") return [];
    const found = Array.from(rootEl.querySelectorAll(containerSelector));
    if (found.length) return found;

    // Fallback: If rootEl or children use generic data-take-id without article tag
    const genericSelector = `[data-take-id="${escaped}"]`;
    if (rootEl instanceof Element && rootEl.matches(genericSelector)) {
      return [rootEl];
    }
    return Array.from(rootEl.querySelectorAll(genericSelector)).filter(
      (el) => !el.closest(".take-item, .profile-grid-take") || el.matches(".take-item, .profile-grid-take")
    );
  }

  function syncVoteButton(button, isSelected, count, isDisabled) {
    if (!(button instanceof HTMLElement)) return;
    const wasSelected = button.classList.contains("is-selected");
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    const icon = button.querySelector(".take-action__icon .app-icon");
    if (icon) {
      icon.classList.toggle("fa-solid", isSelected);
      icon.classList.toggle("fa-regular", !isSelected);
    }
    if (wasSelected !== isSelected) playActionMotion(button, isSelected ? "is-motion-enter" : "is-motion-exit");
    button.disabled = Boolean(isDisabled);
    const countEl = button.querySelector(".take-action__count");
    if (countEl) {
      countEl.textContent = String(Number(count || 0));
    }
  }

  function syncBookmarkButton(button, isBookmarked) {
    if (!(button instanceof HTMLElement)) return;
    const wasBookmarked = button.classList.contains("is-selected");
    const bookmarkLabel = isBookmarked ? "Saved" : "Save";
    button.classList.toggle("is-selected", Boolean(isBookmarked));
    button.setAttribute("aria-pressed", isBookmarked ? "true" : "false");
    const icon = button.querySelector(".take-action__icon .app-icon");
    if (icon) {
      icon.classList.toggle("fa-solid", isBookmarked);
      icon.classList.toggle("fa-regular", !isBookmarked);
    }
    if (wasBookmarked !== Boolean(isBookmarked)) playActionMotion(button, isBookmarked ? "is-motion-enter" : "is-motion-exit");
    button.setAttribute("data-bookmarked", isBookmarked ? "true" : "false");
    button.setAttribute("aria-label", `${bookmarkLabel} take`);
    button.setAttribute("title", `${bookmarkLabel} take`);
  }

  function playActionMotion(button, className) {
    button.classList.remove("is-motion-enter", "is-motion-exit");
    // Restart a rapid second tap without adding timers to every rendered take.
    void button.offsetWidth;
    button.classList.add(className);
  }

  function syncVoteMeta(item, voteData) {
    const metaEl = item.querySelector(".take-vote-meta");
    if (!metaEl) return;
    if (!voteData.totalVotes) {
      metaEl.textContent = "No votes yet";
      return;
    }
    metaEl.textContent = `Agree ${voteData.agreePct}% · Disagree ${voteData.disagreePct}% · ${voteData.totalVotes} votes`;
  }

  function syncVoteSplit(item, voteData) {
    const agreeEl = item.querySelector(".take-vote-split__agree");
    const disagreeEl = item.querySelector(".take-vote-split__disagree");
    if (agreeEl) {
      agreeEl.style.width = `${voteData.totalVotes ? voteData.agreePct : 50}%`;
    }
    if (disagreeEl) {
      disagreeEl.style.width = `${voteData.totalVotes ? voteData.disagreePct : 50}%`;
    }
  }

  function syncTakeJudgeCountdown(item, take) {
    if (!item) return;
    const actionsWrapper = item.querySelector(".take-item__actions-wrapper");
    if (!actionsWrapper) return;

    const existingCountdown = actionsWrapper.querySelector(".take-judge-countdown");
    const newCountdownMarkup = renderTakeJudgeCountdown(take);

    if (!newCountdownMarkup) {
      if (existingCountdown) existingCountdown.remove();
      return;
    }

    if (existingCountdown) {
      const temp = document.createElement("div");
      temp.innerHTML = newCountdownMarkup.trim();
      const newEl = temp.firstElementChild;
      if (newEl) {
        existingCountdown.replaceWith(newEl);
      }
    } else {
      const voteMeta = actionsWrapper.querySelector(".take-vote-meta");
      const inlineJudge = actionsWrapper.querySelector(".take-ai-judge");
      const temp = document.createElement("div");
      temp.innerHTML = newCountdownMarkup.trim();
      const newEl = temp.firstElementChild;
      if (newEl) {
        if (inlineJudge) {
          actionsWrapper.insertBefore(newEl, inlineJudge);
        } else if (voteMeta && voteMeta.nextSibling) {
          actionsWrapper.insertBefore(newEl, voteMeta.nextSibling);
        } else {
          actionsWrapper.appendChild(newEl);
        }
      }
    }
  }

  function syncTakeState(rootEl, take) {
    if (!rootEl || !take || !take.id) return;
    const voteData = getVoteData(take);
    const takeItems = getTakeElements(rootEl, take.id);
    takeItems.forEach((item) => {
      const agreeButton = item.querySelector("[data-action='vote'][data-vote-type='agree']");
      const disagreeButton = item.querySelector("[data-action='vote'][data-vote-type='disagree']");
      const bookmarkButton = item.querySelector("[data-action='bookmark']");

      syncVoteButton(agreeButton, voteData.userVote === "agree", voteData.agreeCount, voteData.isLoading);
      syncVoteButton(disagreeButton, voteData.userVote === "disagree", voteData.disagreeCount, voteData.isLoading);
      syncBookmarkButton(bookmarkButton, Boolean(take.bookmarked));
      syncVoteSplit(item, voteData);
      syncVoteMeta(item, voteData);
      syncTakeJudgeCountdown(item, take);

      if (item.classList.contains("profile-grid-take")) {
        const metaSpan = item.querySelector(".profile-grid-take__meta span:nth-of-type(3)");
        if (metaSpan) {
          metaSpan.textContent = `Agree ${voteData.agreeCount} | Disagree ${voteData.disagreeCount}`;
        }
        const existingVoteBadge = item.querySelector(".profile-grid-vote");
        if (voteData.userVote === "agree") {
          if (existingVoteBadge) {
            existingVoteBadge.className = "profile-grid-vote profile-grid-vote--agree";
            existingVoteBadge.textContent = "You agreed";
          } else {
            const metaContainer = item.querySelector(".profile-grid-take__meta");
            if (metaContainer) {
              const badge = document.createElement("span");
              badge.className = "profile-grid-vote profile-grid-vote--agree";
              badge.textContent = "You agreed";
              metaContainer.appendChild(badge);
            }
          }
        } else if (voteData.userVote === "disagree") {
          if (existingVoteBadge) {
            existingVoteBadge.className = "profile-grid-vote profile-grid-vote--disagree";
            existingVoteBadge.textContent = "You disagreed";
          } else {
            const metaContainer = item.querySelector(".profile-grid-take__meta");
            if (metaContainer) {
              const badge = document.createElement("span");
              badge.className = "profile-grid-vote profile-grid-vote--disagree";
              badge.textContent = "You disagreed";
              metaContainer.appendChild(badge);
            }
          }
        } else if (existingVoteBadge) {
          existingVoteBadge.remove();
        }
      }

      if (typeof take.comment_count === "number") {
        const commentButton = item.querySelector("[data-action='comments']");
        if (commentButton) {
          const count = Math.max(0, Number(take.comment_count) || 0);
          const lead = commentButton.querySelector(".take-action__lead");
          const label = count > 0 ? `Open comments (${count})` : "Open comments";
          commentButton.setAttribute("aria-label", label);
          commentButton.setAttribute("title", label);
          if (lead) {
            let countEl = lead.querySelector(".take-action__count--comments");
            if (count > 0) {
              if (!countEl) {
                countEl = document.createElement("span");
                countEl.className = "take-action__count take-action__count--comments";
                lead.appendChild(countEl);
              }
              countEl.textContent = count.toLocaleString();
            } else if (countEl) {
              countEl.remove();
            }
          }
        }
      }
    });
  }

  function bindShareActions(rootEl, handlers) {
    if (!rootEl) return;

    const shareButtons = rootEl.querySelectorAll("[data-action='share']");
    shareButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const shareUrl = button.getAttribute("data-share-url");
        const takeId = button.getAttribute("data-take-id");
        if (!shareUrl) return;

        if (handlers && typeof handlers.onShare === "function") {
          handlers.onShare({
            takeId: takeId || "",
            shareUrl,
          });
          return;
        }

        try {
          await window.ClashlyUtils.copyText(shareUrl);
          if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
            window.ClashlyUtils.showToast("Link copied to clipboard", "success");
          }
        } catch (error) {
          if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
            window.ClashlyUtils.showToast("Could not copy link.", "error");
          }
        }
      });
    });
  }

  const pendingVoteTakeIds = new Set();

  function bindVoteActions(rootEl, handlers) {
    if (!rootEl || !handlers || typeof handlers.onVote !== "function") return;

    rootEl._onTakeVoteHandlers = handlers;

    if (rootEl.dataset.takeVoteBound === "true") return;

    rootEl.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("[data-action='vote']");
      if (!button || !rootEl.contains(button)) return;

      const takeId = button.getAttribute("data-take-id");
      const voteType = button.getAttribute("data-vote-type");
      if (!takeId || !voteType || button.disabled) return;

      // Prevent concurrent rapid taps from interleaving on the same take
      if (pendingVoteTakeIds.has(takeId)) return;
      pendingVoteTakeIds.add(takeId);

      const activeHandlers = rootEl._onTakeVoteHandlers || handlers;
      try {
        await activeHandlers.onVote({
          takeId,
          voteType,
        });
      } catch (error) {
        if (activeHandlers && activeHandlers.onStatus) {
          activeHandlers.onStatus(window.ClashlyUtils.reportError("Vote action failed.", error, "Could not update vote."), "error");
        }
      } finally {
        pendingVoteTakeIds.delete(takeId);
      }
    });

    rootEl.dataset.takeVoteBound = "true";
  }

  function bindCommentActions(rootEl, handlers) {
    if (!rootEl || !handlers || typeof handlers.onComments !== "function") return;

    rootEl._onTakeComments = handlers.onComments;

    if (rootEl.dataset.takeCommentsBound !== "true") {
      rootEl.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("button, [data-action='pin-take'], [data-action='delete-take'], [data-action='share'], [data-action='take-more']")) return;
        const link = target.closest("[data-action='comments']");
        if (!link || !rootEl.contains(link)) return;

        event.preventDefault();
        const takeId = link.getAttribute("data-take-id");
        if (!takeId) return;

        if (typeof rootEl._onTakeComments === "function") {
          rootEl._onTakeComments({ takeId });
        }
      });
      rootEl.dataset.takeCommentsBound = "true";
    }
  }

  function bindBookmarkActions(rootEl, handlers) {
    if (!rootEl || !handlers || typeof handlers.onBookmark !== "function") return;

    const bookmarkButtons = rootEl.querySelectorAll("[data-action='bookmark']");
    bookmarkButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const takeId = button.getAttribute("data-take-id");
        const isBookmarked = button.getAttribute("data-bookmarked") === "true";
        if (!takeId || button.disabled) return;

        try {
          await handlers.onBookmark({
            takeId,
            isBookmarked,
          });
        } catch (error) {
          if (handlers.onStatus) {
            handlers.onStatus(
              window.ClashlyUtils.reportError("Bookmark action failed.", error, "Could not update saved state."),
              "error"
            );
          }
        }
      });
    });
  }

  function bindAiJudgeActions(rootEl, handlers) {
    if (!rootEl || !handlers || typeof handlers.onAiJudge !== "function") return;

    const judgeButtons = rootEl.querySelectorAll("[data-action='ai-judge']");
    judgeButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const takeId = button.getAttribute("data-take-id");
        if (!takeId || button.disabled) return;

        try {
          await handlers.onAiJudge({
            takeId,
          });
        } catch (error) {
          if (handlers.onStatus) {
            handlers.onStatus(window.ClashlyUtils.reportError("AI Judge action failed.", error, "AI Judge is unavailable right now."), "error");
          }
        }
      });
    });
  }

  function bindDeleteActions(rootEl, handlers) {
    if (!rootEl || !handlers || typeof handlers.onDelete !== "function") return;

    const deleteButtons = rootEl.querySelectorAll("[data-action='delete-take']");
    deleteButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const takeId = button.getAttribute("data-take-id");
        if (!takeId || button.disabled) return;

        try {
          await handlers.onDelete({
            takeId,
          });
        } catch (error) {
          if (handlers.onStatus) {
            handlers.onStatus(
              window.ClashlyUtils.reportError("Delete take action failed.", error, "Could not delete take."),
              "error"
            );
          }
        }
      });
    });
  }

  function bindPinActions(rootEl, handlers) {
    if (!rootEl || !handlers || typeof handlers.onPin !== "function") return;

    const pinButtons = rootEl.querySelectorAll("[data-action='pin-take']");
    pinButtons.forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        event.preventDefault();
        const takeId = button.getAttribute("data-take-id");
        const isPinned = button.getAttribute("data-pinned") === "true";
        if (!takeId || button.disabled) return;

        try {
          await handlers.onPin({
            takeId,
            isPinned,
          });
        } catch (error) {
          if (handlers.onStatus) {
            handlers.onStatus(
              window.ClashlyUtils.reportError("Pin take action failed.", error, "Could not update pinned take."),
              "error"
            );
          }
        }
      });
    });
  }

  // Standard Social Media Media Sizing (Facebook, Instagram, X):
  // - Full width across the post section (100% width) - no side displacement or awkward gaps!
  // - Single image aspect ratio clamped between 4:5 (universal portrait bound, 0.8) and 16:9 (landscape bound, 1.7778).
  function applyImageAspectRatio(imgEl) {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return;
    const container = imgEl.closest(".take-item__media:not(.take-item__media--split)");
    if (!container) return;
    const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
    container.dataset.mediaShape = ratio < 0.92 ? "portrait" : ratio <= 1.12 ? "square" : ratio >= 1.65 ? "wide" : "landscape";
  }

  function hydrateCachedImages(rootEl) {
    if (!rootEl || typeof rootEl.querySelectorAll !== "function") return;
    const imgs = rootEl.querySelectorAll(".take-item__media img, .take-item__media-slot img");
    imgs.forEach((img) => {
      if (img.complete && img.naturalWidth && img.naturalHeight) {
        applyImageAspectRatio(img);
      }
    });
  }

  async function hydrateMissingTakeProfiles(rootEl, options) {
    if (!rootEl || typeof rootEl.querySelectorAll !== "function") return;
    const pendingArticles = rootEl.querySelectorAll(".take-item[data-needs-profile-user-id]");
    if (!pendingArticles.length) return;

    const userIds = [
      ...new Set(
        Array.from(pendingArticles)
          .map((el) => el.getAttribute("data-needs-profile-user-id"))
          .filter(Boolean)
      ),
    ];
    if (!userIds.length) return;

    let profiles = [];
    if (window.ClashlyProfiles && typeof window.ClashlyProfiles.getProfilesByIds === "function") {
      const res = await window.ClashlyProfiles.getProfilesByIds(userIds);
      profiles = (res && res.profiles) || [];
    } else if (window.ClashlyTakes && typeof window.ClashlyTakes.fetchProfilesByIds === "function") {
      const res = await window.ClashlyTakes.fetchProfilesByIds(userIds);
      profiles = (res && res.profiles) || [];
    }

    if (!profiles.length) return;
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    pendingArticles.forEach((article) => {
      const uid = article.getAttribute("data-needs-profile-user-id");
      const profile = profileMap.get(uid);
      if (!profile || !profile.username) return;

      article.removeAttribute("data-needs-profile-user-id");
      const takeId = article.getAttribute("data-take-id");
      if (takeId && renderedTakesMap.has(takeId)) {
        const take = renderedTakesMap.get(takeId);
        take.profile = {
          id: profile.id,
          username: profile.username,
          avatar_url: profile.avatar_url || "",
        };
      }

      const userLink = article.querySelector(".take-item__user");
      if (userLink) {
        userLink.textContent = profile.username;
        const currentUserId = options && options.currentUserId ? String(options.currentUserId) : "";
        if (currentUserId && uid === currentUserId) {
          userLink.href = `profile.html?id=${encodeURIComponent(uid)}&u=${encodeURIComponent(profile.username)}`;
        } else {
          userLink.href = `user.html?id=${encodeURIComponent(uid)}&u=${encodeURIComponent(profile.username)}`;
        }
      }

      const avatarContainer = article.querySelector(".take-item__avatar");
      if (avatarContainer) {
        if (profile.avatar_url) {
          avatarContainer.innerHTML = `<img src="${window.ClashlyUtils.escapeHtml(
            profile.avatar_url
          )}" alt="${window.ClashlyUtils.escapeHtml(profile.username)} avatar" loading="lazy" decoding="async" />`;
        } else {
          const initials = window.ClashlyUtils.initialsFromName(profile.username);
          avatarContainer.textContent = initials;
        }
      }
    });
  }

  function ensureDeleteTakeModal() {
    let modal = document.getElementById("delete-take-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "delete-take-modal";
    modal.className = "delete-take-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="delete-take-modal__backdrop" data-close-delete-take="true"></div>
      <section class="delete-take-modal__panel" role="dialog" aria-modal="true" aria-labelledby="delete-take-title" aria-describedby="delete-take-desc">
        <div class="delete-take-modal__icon-wrap" aria-hidden="true">
          <i class="app-icon fa-solid fa-trash-can" aria-hidden="true"></i>
        </div>
        <h2 id="delete-take-title" class="delete-take-modal__title">Delete take?</h2>
        <p id="delete-take-desc" class="delete-take-modal__desc">Are you sure you want to delete this take? This action cannot be undone and will permanently remove your take and all its votes and comments.</p>
        <div class="delete-take-modal__actions">
          <button type="button" class="btn btn--ghost delete-take-modal__btn-cancel" data-close-delete-take="true" id="delete-take-cancel-btn">Cancel</button>
          <button type="button" class="btn delete-take-modal__btn-confirm" id="delete-take-confirm-btn">Delete</button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function confirmDeleteTake(options) {
    return new Promise((resolve) => {
      const modal = ensureDeleteTakeModal();
      if (!modal) {
        resolve(false);
        return;
      }

      const confirmBtn = modal.querySelector("#delete-take-confirm-btn");
      const cancelBtn = modal.querySelector("#delete-take-cancel-btn");
      const backdrop = modal.querySelector(".delete-take-modal__backdrop");
      const titleEl = modal.querySelector("#delete-take-title");
      const descEl = modal.querySelector("#delete-take-desc");

      if (titleEl) {
        titleEl.textContent = (options && options.title) || "Delete take?";
      }

      if (descEl) {
        descEl.textContent =
          (options && options.message) ||
          "Are you sure you want to delete this take? This action cannot be undone and will permanently remove your take and all its votes and comments.";
      }

      let resolved = false;

      function cleanup(confirmed) {
        if (resolved) return;
        resolved = true;
        modal.classList.remove("is-open");
        document.body.style.overflow = "";
        document.removeEventListener("keydown", onKeyDown);
        window.setTimeout(() => {
          if (!modal.classList.contains("is-open")) {
            modal.hidden = true;
          }
        }, 220);
        resolve(Boolean(confirmed));
      }

      function onKeyDown(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          cleanup(false);
        }
      }

      if (confirmBtn) confirmBtn.onclick = () => cleanup(true);
      if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
      if (backdrop) backdrop.onclick = () => cleanup(false);
      document.addEventListener("keydown", onKeyDown);

      modal.hidden = false;
      document.body.style.overflow = "hidden";
      window.requestAnimationFrame(() => {
        modal.classList.add("is-open");
        if (cancelBtn) cancelBtn.focus();
      });
    });
  }

  let activeTakeMoreSheetCleanup = null;

  function ensureTakeMoreModal() {
    let modal = document.getElementById("take-more-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "take-more-modal";
    modal.className = "take-more-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="take-more-modal__backdrop" data-close-take-more="true"></div>
      <section class="take-more-modal__sheet" role="dialog" aria-modal="true" aria-labelledby="take-more-title">
        <div class="take-more-modal__handle-bar" aria-hidden="true">
          <span class="take-more-modal__handle"></span>
        </div>
        <div class="take-more-modal__header sr-only">
          <h3 id="take-more-title">Take options</h3>
        </div>
        <div class="take-more-modal__actions" id="take-more-actions"></div>
        <div class="take-more-modal__footer">
          <button type="button" class="take-more-modal__cancel-btn" data-close-take-more="true">Cancel</button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function closeTakeMoreSheet() {
    const modal = document.getElementById("take-more-modal");
    if (!modal || modal.hidden) return;

    if (typeof activeTakeMoreSheetCleanup === "function") {
      activeTakeMoreSheetCleanup();
      activeTakeMoreSheetCleanup = null;
    }

    modal.classList.remove("is-open");
    document.body.style.overflow = "";

    window.setTimeout(() => {
      if (!modal.classList.contains("is-open")) {
        modal.hidden = true;
      }
    }, 240);
  }

  function openTakeMoreSheet(options) {
    const modal = ensureTakeMoreModal();
    if (!modal || !options || !options.take) return;

    const take = options.take;
    const canPin = Boolean(options.canPin);
    const canDelete = Boolean(options.canDelete);
    const isPinned = Boolean(options.isPinned);
    const actionsContainer = modal.querySelector("#take-more-actions");
    if (!actionsContainer) return;

    let itemsHtml = "";

    if (canPin) {
      itemsHtml += `
        <button type="button" class="take-more-modal__item" data-sheet-action="pin">
          <span class="take-more-modal__item-icon take-more-modal__item-icon--pin">
            ${renderActionIcon("pin", isPinned)}
          </span>
          <span class="take-more-modal__item-text">
            <span class="take-more-modal__item-title">${isPinned ? "Unpin from profile" : "Pin to your profile"}</span>
          </span>
        </button>
      `;
    }

    itemsHtml += `
      <button type="button" class="take-more-modal__item" data-sheet-action="share">
        <span class="take-more-modal__item-icon take-more-modal__item-icon--share">
          ${renderActionIcon("share")}
        </span>
        <span class="take-more-modal__item-text">
          <span class="take-more-modal__item-title">Share take</span>
        </span>
      </button>
    `;

    if (canDelete) {
      itemsHtml += `
        <button type="button" class="take-more-modal__item take-more-modal__item--danger" data-sheet-action="delete">
          <span class="take-more-modal__item-icon take-more-modal__item-icon--danger">
            ${renderActionIcon("delete")}
          </span>
          <span class="take-more-modal__item-text">
            <span class="take-more-modal__item-title">Delete take</span>
          </span>
        </button>
      `;
    }

    actionsContainer.innerHTML = itemsHtml;

    if (typeof activeTakeMoreSheetCleanup === "function") {
      activeTakeMoreSheetCleanup();
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeTakeMoreSheet();
      }
    }

    function onClick(e) {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const closeTrigger = target.closest("[data-close-take-more='true']");
      if (closeTrigger) {
        e.preventDefault();
        closeTakeMoreSheet();
        return;
      }

      const actionBtn = target.closest("[data-sheet-action]");
      if (!actionBtn) return;

      const action = actionBtn.getAttribute("data-sheet-action");
      closeTakeMoreSheet();

      if (action === "pin" && typeof options.onPin === "function") {
        options.onPin({ takeId: take.id, isPinned });
      } else if (action === "share") {
        if (typeof options.onShare === "function") {
          options.onShare({
            takeId: take.id,
            shareUrl: window.ClashlyUtils.toTakeUrl(take.id),
            take,
          });
        } else if (window.ClashlyShareModal) {
          window.ClashlyShareModal.open({ take });
        }
      } else if (action === "delete" && typeof options.onDelete === "function") {
        options.onDelete({ takeId: take.id, take });
      }
    }

    modal.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);

    activeTakeMoreSheetCleanup = () => {
      modal.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };

    modal.hidden = false;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      modal.classList.add("is-open");
    });
  }

  function bindTakeMoreActions(rootEl, handlers) {
    if (!rootEl || !handlers) return;

    rootEl.addEventListener("click", function onMoreClick(event) {
      const button = event.target.closest("[data-action='take-more']");
      if (!button) return;

      event.stopPropagation();
      event.preventDefault();

      const takeId = button.getAttribute("data-take-id");
      if (!takeId) return;

      const takeUserId = button.getAttribute("data-take-user-id") || "";
      const isPinned = button.getAttribute("data-take-is-pinned") === "1";

      // Try to get the full take object; fall back to a minimal one
      let take = null;
      if (typeof handlers.getTake === "function") {
        take = handlers.getTake(takeId);
      }
      if (!take) {
        take = renderedTakesMap.get(takeId);
      }
      // If still not found, build a minimal take so the sheet still opens
      if (!take) {
        take = { id: takeId, user_id: takeUserId, is_pinned: isPinned };
      }

      const currentUserId = handlers.currentUserId ? String(handlers.currentUserId) : "";
      const canPin = typeof handlers.canPin === "function"
        ? Boolean(handlers.canPin(take))
        : Boolean(currentUserId && takeUserId === currentUserId);
      const canDelete = typeof handlers.canDelete === "function"
        ? Boolean(handlers.canDelete(take))
        : Boolean(currentUserId && takeUserId === currentUserId);

      openTakeMoreSheet({
        take,
        canPin,
        canDelete,
        isPinned: take.is_pinned || isPinned,
        onPin: handlers.onPin,
        onShare: handlers.onShare,
        onDelete: handlers.onDelete,
      });
    });
  }

  function clearCache() {
    renderedTakesMap.clear();
  }

  window.ClashlyTakeRenderer = {
    renderTakeList,
    appendTakeList,
    renderTakeGrid,
    renderTakeJudgeCountdown,
    syncTakeState,
    bindShareActions,
    bindVoteActions,
    bindCommentActions,
    bindBookmarkActions,
    bindAiJudgeActions,
    bindDeleteActions,
    bindPinActions,
    bindTakeMoreActions,
    openTakeMoreSheet,
    closeTakeMoreSheet,
    confirmDeleteTake,
    applyImageAspectRatio,
    hydrateCachedImages,
    hydrateMissingTakeProfiles,
    clearCache,
  };
})();
