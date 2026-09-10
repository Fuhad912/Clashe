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
          '<svg class="comment-badge__icon" viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true">' +
            '<path d="M8 1l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 11.8l-4.2 2.2.8-4.7L1.2 6l4.7-.7L8 1z"/>' +
          '</svg>' +
          '<span>AI Pick</span>' +
        '</span>'
      );
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
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 6.5h17"></path>
        <path d="M9.2 6.5V4.7c0-.7.6-1.2 1.2-1.2h3.2c.7 0 1.2.6 1.2 1.2v1.8"></path>
        <path d="M18.2 6.5 17.1 19a1.8 1.8 0 0 1-1.8 1.6H8.7A1.8 1.8 0 0 1 6.9 19L5.8 6.5"></path>
        <path d="M10.2 10.1v6.2"></path>
        <path d="M13.8 10.1v6.2"></path>
      </svg>
    `;
  }

  function renderLikeIcon() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20.6 4.9 13.8a4.7 4.7 0 0 1 0-6.8 5.1 5.1 0 0 1 7.1 0L12 7l.1-.1a5.1 5.1 0 0 1 7.1 0 4.7 4.7 0 0 1 0 6.8L12 20.6Z"></path>
      </svg>
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
        <span class="comment-action__icon" aria-hidden="true">${renderLikeIcon()}</span>
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
