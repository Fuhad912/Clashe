(function () {
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

  function getUsername(profile) {
    if (!profile || !profile.username) return "anonymous";
    return String(profile.username);
  }

  function getAvatarMarkup(profile) {
    const username = profile && profile.username ? profile.username : "cl";
    const initials = window.ClashlyUtils.initialsFromName(username);

    if (profile && profile.avatar_url) {
      return `
        <div class="take-item__avatar">
          <img src="${window.ClashlyUtils.escapeHtml(profile.avatar_url)}" alt="${window.ClashlyUtils.escapeHtml(
            getUsername(profile)
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
      return [String(take.image_url)];
    }
    return [];
  }

  function getProfileHref(take, currentUserId) {
    if (!take || !take.user_id) return "profile.html";

    const username = take.profile && take.profile.username ? String(take.profile.username) : "";
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

  function renderActionIcon(name) {
    const icons = {
      agree: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 10.25h4.15l1.22-4.3c.17-.58.53-1.08 1.01-1.41l.86-.59 1.06 1.16c.55.6.76 1.43.55 2.22l-.81 2.92H20a1.8 1.8 0 0 1 1.78 2.09l-.95 6.08A1.8 1.8 0 0 1 19.05 20H10V10.25Z"></path>
          <path d="M5.25 10.25H8.9V20H5.25z"></path>
        </svg>
      `,
      disagree: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 13.75H9.85l-1.22 4.3c-.17.58-.53 1.08-1.01 1.41l-.86.59-1.06-1.16a2.26 2.26 0 0 1-.55-2.22l.81-2.92H4a1.8 1.8 0 0 1-1.78-2.09l.95-6.08A1.8 1.8 0 0 1 4.95 4H14v9.75Z"></path>
          <path d="M15.1 4h3.65v9.75H15.1z"></path>
        </svg>
      `,
      comments: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.75c4.56 0 8.25 3.13 8.25 7 0 3.87-3.69 7-8.25 7-1.04 0-2.04-.16-2.96-.45l-3.54 1.58 1.08-3.06C5.28 15.58 3.75 13.79 3.75 11.75c0-3.87 3.69-7 8.25-7Z"></path>
        </svg>
      `,
      bookmark: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.1 4.75h9.8A1.35 1.35 0 0 1 18.25 6.1V20l-6.25-3.45L5.75 20V6.1A1.35 1.35 0 0 1 7.1 4.75Z"></path>
        </svg>
      `,
      share: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 15.7V4.6"></path>
          <path d="m8.15 8.35 3.85-3.85 3.85 3.85"></path>
          <path d="M6.35 10.9v7.1c0 .83.67 1.5 1.5 1.5h8.3c.83 0 1.5-.67 1.5-1.5v-7.1"></path>
        </svg>
      `,
      judge: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3.6 2.1 6.3 6.3 2.1-6.3 2.1-2.1 6.3-2.1-6.3-6.3-2.1 6.3-2.1z"></path>
          <path d="m18.1 4.6.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8z"></path>
        </svg>
      `,
      delete: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.8 6.5h16.4"></path>
          <path d="M9.2 6.5V4.7a.95.95 0 0 1 .95-.95h3.7a.95.95 0 0 1 .95.95v1.8"></path>
          <path d="M6.6 6.5v12.1a1.15 1.15 0 0 0 1.15 1.15h8.5a1.15 1.15 0 0 0 1.15-1.15V6.5"></path>
          <path d="M10 10.1v6.2"></path>
          <path d="M14 10.1v6.2"></path>
        </svg>
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
        aria-label="${bookmarkLabel} take"
        title="${bookmarkLabel} take"
      >
        <span class="take-action__icon">${renderActionIcon("bookmark")}</span>
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
              ${loadingAttr}
            >
              <span class="take-action__stack">
                <span class="take-action__icon">${renderActionIcon("agree")}</span>
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
              ${loadingAttr}
            >
              <span class="take-action__stack">
                <span class="take-action__icon">${renderActionIcon("disagree")}</span>
                <span class="take-action__label">Disagree</span>
                <span class="take-action__count">${voteData.disagreeCount}</span>
              </span>
            </button>
            ${commentsAction}
            ${shareAction}
            ${deleteAction}
          </div>
          <div class="take-item__actions-side" aria-label="Secondary take actions">
            ${judgeAction}
            ${saveAction}
          </div>
        </div>
        ${renderVoteSplit(voteData)}
        ${renderVoteMeta(voteData)}
        ${renderInlineAiJudgeResult(take, options)}
      </footer>
    `;
  }

  function renderListItem(take, options) {
    const compactClass = options.compact ? " take-item--compact" : "";
    const expandedClass = options && options.isExpanded ? " is-expanded" : "";
    const toggleableClass = options && options.toggleOpenAction ? " take-item--toggleable" : "";
    const username = getUsername(take.profile);
    const profileHref = getProfileHref(take, options && options.currentUserId ? String(options.currentUserId) : "");
    const takeHrefSuffix = options && options.takeHrefSuffix ? String(options.takeHrefSuffix) : "";
    const takeHref = take && take.id ? `take.html?id=${encodeURIComponent(take.id)}${takeHrefSuffix}` : "take.html";
    const relativeTime = window.ClashlyUtils.formatRelativeTime(take.created_at);
    const avatarMarkup = getAvatarMarkup(take.profile);
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
    const mobileShareAction =
      options && options.hideShareAction
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
                  <div class="take-item__media-slot" data-media-shape="pending">
                    <img
                      src="${window.ClashlyUtils.escapeHtml(imageUrl)}"
                      alt="Take image ${index + 1} from ${window.ClashlyUtils.escapeHtml(username)}"
                      loading="lazy"
                      decoding="async"
                      onload="window.ClashlyTakeRenderer.applyImageAspectRatio(this)"
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

    return `
      <article class="take-item${compactClass}${expandedClass}${toggleableClass}" data-take-id="${window.ClashlyUtils.escapeHtml(take.id)}">
        ${avatarMarkup}
        <div class="take-item__body">
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
            ${mobileShareAction}
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
    const username = getUsername(take.profile);
    const relativeTime = window.ClashlyUtils.formatRelativeTime(take.created_at);
    const voteData = getVoteData(take);
    const cleanContent =
      window.ClashlyUtils && typeof window.ClashlyUtils.stripTrailingHashtags === "function"
        ? window.ClashlyUtils.stripTrailingHashtags(take.content)
        : take.content;
    const excerpt = renderTakeText(cleanContent || take.content);
    const hasImage = Boolean(take.image_url);
    const currentUserId = options && options.currentUserId ? String(options.currentUserId) : "";
    const canDeleteTake = Boolean(options && options.showDeleteAction && currentUserId && take && take.user_id === currentUserId);
    const userVoteLabel =
      voteData.userVote === "agree"
        ? `<span class="profile-grid-vote profile-grid-vote--agree">You agreed</span>`
        : voteData.userVote === "disagree"
          ? `<span class="profile-grid-vote profile-grid-vote--disagree">You disagreed</span>`
          : "";
    const mediaMarkup = hasImage
      ? `
        <div class="profile-grid-take__media-wrap">
          <img class="profile-grid-take__media" src="${window.ClashlyUtils.escapeHtml(
            take.image_url
          )}" alt="Take image from ${window.ClashlyUtils.escapeHtml(username)}" loading="lazy" decoding="async" />
          <div class="profile-grid-take__overlay">
            <p class="profile-grid-take__excerpt">${excerpt}</p>
          </div>
        </div>
      `
      : `
        <div class="profile-grid-take__body">
          <p class="profile-grid-take__excerpt">${excerpt}</p>
        </div>
      `;
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

    return `
      <article class="profile-grid-take${hasImage ? " profile-grid-take--with-image" : " profile-grid-take--text-only"}" data-take-id="${window.ClashlyUtils.escapeHtml(
        take.id
      )}">
        ${deleteButton}
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
    const selector = `[data-take-id="${escapeAttributeSelector(takeId)}"]`;
    if (rootEl instanceof Element && rootEl.matches(selector)) {
      return [rootEl];
    }
    if (typeof rootEl.querySelectorAll !== "function") return [];
    return Array.from(rootEl.querySelectorAll(selector));
  }

  function syncVoteButton(button, isSelected, count, isDisabled) {
    if (!(button instanceof HTMLElement)) return;
    button.classList.toggle("is-selected", isSelected);
    button.disabled = Boolean(isDisabled);
    const countEl = button.querySelector(".take-action__count");
    if (countEl) {
      countEl.textContent = String(Number(count || 0));
    }
  }

  function syncBookmarkButton(button, isBookmarked) {
    if (!(button instanceof HTMLElement)) return;
    const bookmarkLabel = isBookmarked ? "Saved" : "Save";
    button.classList.toggle("is-selected", Boolean(isBookmarked));
    button.setAttribute("data-bookmarked", isBookmarked ? "true" : "false");
    button.setAttribute("aria-label", `${bookmarkLabel} take`);
    button.setAttribute("title", `${bookmarkLabel} take`);
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

  function bindVoteActions(rootEl, handlers) {
    if (!rootEl || !handlers || typeof handlers.onVote !== "function") return;

    const voteButtons = rootEl.querySelectorAll("[data-action='vote']");
    voteButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const takeId = button.getAttribute("data-take-id");
        const voteType = button.getAttribute("data-vote-type");
        if (!takeId || !voteType || button.disabled) return;

        try {
          await handlers.onVote({
            takeId,
            voteType,
          });
        } catch (error) {
          if (handlers.onStatus) {
            handlers.onStatus(window.ClashlyUtils.reportError("Vote action failed.", error, "Could not update vote."), "error");
          }
        }
      });
    });
  }

  function bindCommentActions(rootEl, handlers) {
    if (!rootEl || !handlers || typeof handlers.onComments !== "function") return;

    rootEl._onTakeComments = handlers.onComments;

    if (rootEl.dataset.takeCommentsBound !== "true") {
      rootEl.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
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

  // Standard Social Media Media Sizing (Facebook, Instagram, X):
  // - Full width across the post section (100% width) - no side displacement or awkward gaps!
  // - Single image aspect ratio clamped between 4:5 (universal portrait bound, 0.8) and 16:9 (landscape bound, 1.7778).
  // - Photos within 4:5 to 16:9 (including 1:1 square, 4:3, 3:2, 16:9) fill the full-width box with zero cropping!
  // - Ultra-tall photos (taller than 4:5, like 9:16 vertical photos/screenshots) use object-fit: contain inside the 4:5 box
  //   with a sleek surface background, exactly like Facebook and X, keeping the entire image 100% visible!
  // - Two images (split view): 16:9 unified grid container with 50/50 slots and 100% height.
  const SINGLE_IMAGE_MIN_RATIO = 4 / 5; // 0.8 (Instagram/Facebook/X standard portrait bound)
  const SINGLE_IMAGE_MAX_RATIO = 16 / 9; // 1.7778 (landscape bound)

  function applyImageAspectRatio(imgEl) {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return;
    const container = imgEl.closest(".take-item__media, .take-item__media-slot");
    if (!container) return;

    const isSplit = container.classList.contains("take-item__media-slot");
    const trueRatio = imgEl.naturalWidth / imgEl.naturalHeight;

    if (isSplit) {
      // In split view, the parent grid (.take-item__media--split) controls the overall ratio
      // so both slots share equal height.
      container.style.aspectRatio = "";
    } else {
      // Standard social media ratio clamping: 4:5 (portrait) to 16:9 (landscape)
      const clampedRatio = Math.min(Math.max(trueRatio, SINGLE_IMAGE_MIN_RATIO), SINGLE_IMAGE_MAX_RATIO);
      container.style.aspectRatio = String(Number(clampedRatio.toFixed(4)));
    }

    // Always span full 100% width of the post section - no shrinking or sticking to the right!
    container.style.width = "100%";
    container.style.maxWidth = "100%";

    // Standard FB/X approach: if photo is taller than 4:5 (e.g. 9:16), use contain to keep 100% of the image visible!
    // For standard photos (4:5 to 16:9), cover fills the matching aspect-ratio box without cropping.
    imgEl.style.objectFit = trueRatio < 0.76 ? "contain" : "cover";
    container.dataset.mediaShape = trueRatio > 1.05 ? "landscape" : trueRatio < 0.95 ? "portrait" : "square";
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
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>
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

  window.ClashlyTakeRenderer = {
    renderTakeList,
    appendTakeList,
    renderTakeGrid,
    syncTakeState,
    bindShareActions,
    bindVoteActions,
    bindCommentActions,
    bindBookmarkActions,
    bindAiJudgeActions,
    bindDeleteActions,
    confirmDeleteTake,
    applyImageAspectRatio,
    hydrateCachedImages,
  };
})();
