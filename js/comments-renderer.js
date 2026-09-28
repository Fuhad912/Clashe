(function () {
  function getUsername(profile) {
    if (!profile || !profile.username) return "anonymous";
    return String(profile.username);
  }

  function getReplies(comment) {
    return Array.isArray(comment && comment.replies) ? comment.replies : [];
  }

  function isTakeAuthor(comment, options) {
    return Boolean(options && options.takeAuthorId && comment && comment.user_id === options.takeAuthorId);
  }

  function isCurrentUser(comment, options) {
    return Boolean(options && options.currentUserId && comment && comment.user_id === options.currentUserId);
  }

  function getAvatarMarkup(profile) {
    const username = profile && profile.username ? profile.username : "cl";
    const initials = window.ClashlyUtils.initialsFromName(username);

    if (profile && profile.avatar_url) {
      return `
        <div class="comment-item__avatar">
          <img src="${window.ClashlyUtils.escapeHtml(profile.avatar_url)}" alt="${window.ClashlyUtils.escapeHtml(
            getUsername(profile)
          )} avatar" loading="lazy" decoding="async" />
        </div>
      `;
    }

    return `<div class="comment-item__avatar">${window.ClashlyUtils.escapeHtml(initials)}</div>`;
  }

  function renderRoleBadges(comment, options) {
    const badges = [];
    if (comment && comment.ai_judge_cited) {
      badges.push(
        '<span class="comment-item__badge comment-badge--ai-pick" role="status" aria-label="Cited as top argument by AI Judge" title="Cited as top argument by AI Judge">' +
          '<i class="app-icon fa-solid fa-star comment-badge__icon" aria-hidden="true"></i>' +
          '<span>AI Pick</span>' +
        '</span>'
      );
    }

    const tiersApi = window.ClasheClashscoreTiers || window.ClashlyClashscoreTiers;
    if (tiersApi && typeof tiersApi.getClashscoreTier === "function") {
      const rawScore =
        comment && comment.authorClashscore !== undefined
          ? comment.authorClashscore
          : comment && comment.author_clashscore !== undefined
          ? comment.author_clashscore
          : comment && comment.profile && comment.profile.clashscore !== undefined
          ? comment.profile.clashscore
          : 0;
      const tier = tiersApi.getClashscoreTier(rawScore);
      // Skip Rookie tier (tierIndex === 0) — only render for Debater and above
      if (tier && tier.tierIndex > 0) {
        const tierKey = String(tier.name || "").toLowerCase();
        badges.push(
          `<span class="comment-item__badge comment-badge--tier" data-tier="${window.ClashlyUtils.escapeHtml(
            tierKey
          )}" role="status" aria-label="${window.ClashlyUtils.escapeHtml(
            tier.name
          )} tier" title="${window.ClashlyUtils.escapeHtml(tier.name)} tier">${window.ClashlyUtils.escapeHtml(
            tier.name
          )}</span>`
        );
      }
    }

    if (isTakeAuthor(comment, options)) {
      badges.push('<span class="comment-item__badge comment-item__badge--author">Author</span>');
    }
    if (isCurrentUser(comment, options)) {
      badges.push('<span class="comment-item__badge comment-item__badge--you">You</span>');
    }

    if (!badges.length) return "";
    return `<span class="comment-item__badges">${badges.join("")}</span>`;
  }

  function renderMeta(comment, options) {
    const username = getUsername(comment.profile);
    const relativeTime = window.ClashlyUtils.formatRelativeTime(comment.created_at);
    const badgesMarkup = renderRoleBadges(comment, options);

    return `
      <header class="comment-item__meta">
        <span class="comment-item__user">${window.ClashlyUtils.escapeHtml(username)}</span>
        ${badgesMarkup}
        <span class="comment-item__dot">&bull;</span>
        <time datetime="${window.ClashlyUtils.escapeHtml(comment.created_at)}">${window.ClashlyUtils.escapeHtml(relativeTime)}</time>
      </header>
    `;
  }

  function renderDeleteIcon() {
    return `
      <i class="app-icon fa-solid fa-trash-can" aria-hidden="true"></i>
    `;
  }

  function renderLikeIcon(liked) {
    return `
      <i class="app-icon ${liked ? "fa-solid" : "fa-regular"} fa-heart" aria-hidden="true"></i>
    `;
  }

  function normalizeLikeCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) return 0;
    return Math.floor(count);
  }

  function renderActions(comment, options, replyCount, repliesExpanded) {
    const likeCount = normalizeLikeCount(comment && comment.like_count);
    const likedByMe = Boolean(comment && comment.liked_by_me && options && options.currentUserId);
    const likeLabel = likedByMe ? "Unlike comment" : "Like comment";

    const actions = [
      `<button type="button" class="comment-action" data-action="reply" data-comment-id="${window.ClashlyUtils.escapeHtml(
        comment.id
      )}" data-comment-user="${window.ClashlyUtils.escapeHtml(getUsername(comment.profile))}">Reply</button>`,
      `<button
        type="button"
        class="comment-action comment-action--like${likedByMe ? " is-active" : ""}"
        data-action="toggle-like-comment"
        data-comment-id="${window.ClashlyUtils.escapeHtml(comment.id)}"
        data-liked="${likedByMe ? "true" : "false"}"
        aria-pressed="${likedByMe ? "true" : "false"}"
        aria-label="${likeLabel}"
        title="${likeLabel}"
      >
        <span class="comment-action__icon" aria-hidden="true">${renderLikeIcon(likedByMe)}</span>
        <span class="comment-action__count">${window.ClashlyUtils.escapeHtml(likeCount.toLocaleString())}</span>
      </button>`,
    ];

    if (replyCount) {
      actions.push(
        `<button
          type="button"
          class="comment-action comment-action--toggle${repliesExpanded ? " is-active" : ""}"
          data-action="toggle-replies"
          data-comment-id="${window.ClashlyUtils.escapeHtml(comment.id)}"
          aria-expanded="${repliesExpanded ? "true" : "false"}"
        >${repliesExpanded ? "Hide thread" : `View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}</button>`
      );
    }

    if (comment.is_owner && options.currentUserId) {
      actions.push(
        `<button
          type="button"
          class="comment-action comment-action--danger comment-action--icon-plain"
          data-action="delete-comment"
          data-comment-id="${window.ClashlyUtils.escapeHtml(comment.id)}"
          aria-label="Delete comment"
          title="Delete comment"
        >
          <span class="comment-action__icon" aria-hidden="true">${renderDeleteIcon()}</span>
          <span class="comment-action__label">Delete</span>
        </button>`
      );
    }

    return `<div class="comment-item__actions" role="group" aria-label="Comment actions">${actions.join("")}</div>`;
  }

  function getItemClass(comment, options, baseClass) {
    const classes = ["comment-item", baseClass];
    if (isTakeAuthor(comment, options)) classes.push("comment-item--author");
    if (isCurrentUser(comment, options)) classes.push("comment-item--self");
    return classes.join(" ");
  }

  function renderReply(reply, options, depth, parentUsername) {
    const replyItems = getReplies(reply);
    const hasReplies = replyItems.length > 0;
    const repliesExpanded = options.expandedReplyIds && options.expandedReplyIds.has(reply.id);
    const replyingToMarkup = parentUsername
      ? `<p class="comment-item__replyingto"><span>Replying to</span> ${window.ClashlyUtils.escapeHtml(parentUsername)}</p>`
      : "";
    const nestedRepliesMarkup =
      hasReplies && repliesExpanded
        ? `
          <div class="comment-replies comment-replies--nested">
            ${replyItems.map((childReply) => renderReply(childReply, options, depth + 1, getUsername(reply.profile))).join("")}
          </div>
        `
        : "";

    return `
      <article class="${getItemClass(reply, options, "comment-item--reply")}" data-comment-id="${window.ClashlyUtils.escapeHtml(
        reply.id
      )}" data-comment-depth="${Math.min(depth, 3)}">
        ${getAvatarMarkup(reply.profile)}
        <div class="comment-item__body">
          ${renderMeta(reply, options)}
          ${replyingToMarkup}
          <p class="comment-item__text">${window.ClashlyUtils.escapeHtml(reply.content)}</p>
          ${renderActions(reply, options, replyItems.length, repliesExpanded)}
          ${nestedRepliesMarkup}
        </div>
      </article>
    `;
  }

  function renderComment(comment, options) {
    const replyItems = getReplies(comment);
    const replyCount = replyItems.length;
    const repliesExpanded = options.expandedReplyIds && options.expandedReplyIds.has(comment.id);
    const repliesMarkup =
      replyCount && repliesExpanded
        ? `
          <div class="comment-replies">
            ${replyItems.map((reply) => renderReply(reply, options, 1, getUsername(comment.profile))).join("")}
          </div>
        `
        : "";

    return `
      <article class="${getItemClass(comment, options, "comment-item--root")}" data-comment-id="${window.ClashlyUtils.escapeHtml(
        comment.id
      )}">
        ${getAvatarMarkup(comment.profile)}
        <div class="comment-item__body">
          ${renderMeta(comment, options)}
          <p class="comment-item__text">${window.ClashlyUtils.escapeHtml(comment.content)}</p>
          ${renderActions(comment, options, replyCount, repliesExpanded)}
          ${repliesMarkup}
        </div>
      </article>
    `;
  }

  function renderCommentThread(container, comments, options) {
    if (!container) return;

    if (!comments.length) {
      container.innerHTML = `
        <div class="comments-empty">
          <p>No comments yet.</p>
          <span>Open the floor with the first argument.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = comments.map((comment) => renderComment(comment, options || {})).join("");
  }

  window.ClashlyCommentsRenderer = {
    renderCommentThread,
  };
})();
