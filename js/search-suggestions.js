(function () {
  function truncateText(input, maxLength) {
    const value = String(input || "").trim();
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  function stripHash(value) {
    return String(value || "").trim().replace(/^#/, "");
  }

  function highlightMatch(text, query) {
    const safeText = String(text || "");
    const safeQuery = String(query || "").trim();
    if (!safeQuery) return window.ClashlyUtils.escapeHtml(safeText);

    const index = safeText.toLowerCase().indexOf(safeQuery.toLowerCase());
    if (index === -1) return window.ClashlyUtils.escapeHtml(safeText);

    const before = safeText.slice(0, index);
    const match = safeText.slice(index, index + safeQuery.length);
    const after = safeText.slice(index + safeQuery.length);
    return `${window.ClashlyUtils.escapeHtml(before)}<mark class="search-suggestions__match">${window.ClashlyUtils.escapeHtml(
      match
    )}</mark>${window.ClashlyUtils.escapeHtml(after)}`;
  }

  function getItems(instance) {
    return Array.from(instance.dropdown.querySelectorAll(".search-suggestions__item"));
  }

  function updateActiveItem(instance) {
    const items = getItems(instance);
    items.forEach((item, index) => {
      item.classList.toggle("is-active", index === instance.activeIndex);
    });

    if (instance.activeIndex < 0 || instance.activeIndex >= items.length) return;
    items[instance.activeIndex].scrollIntoView({
      block: "nearest",
    });
  }

  function resetActiveItem(instance) {
    instance.activeIndex = -1;
    updateActiveItem(instance);
  }

  function moveActiveItem(instance, direction) {
    const items = getItems(instance);
    if (!items.length) return;

    if (instance.activeIndex < 0) {
      instance.activeIndex = direction > 0 ? 0 : items.length - 1;
    } else {
      instance.activeIndex = (instance.activeIndex + direction + items.length) % items.length;
    }

    updateActiveItem(instance);
  }

  function openActiveItem(instance) {
    const items = getItems(instance);
    if (instance.activeIndex < 0 || instance.activeIndex >= items.length) return false;
    const target = items[instance.activeIndex];
    if (!(target instanceof HTMLAnchorElement)) return false;
    target.click();
    return true;
  }

  function renderUserAvatar(user) {
    if (user.avatar_url) {
      return `<div class="search-suggestions__avatar"><img src="${window.ClashlyUtils.escapeHtml(user.avatar_url)}" alt="@${window.ClashlyUtils.escapeHtml(
        user.username
      )} avatar" /></div>`;
    }

    return `<div class="search-suggestions__avatar">${window.ClashlyProfiles.initialsFromUsername(user.username)}</div>`;
  }

  function renderQueryAction(query) {
    const safeQuery = String(query || "").trim();
    if (!safeQuery) return "";

    return `
      <a class="search-suggestions__item search-suggestions__item--query" href="search.html?q=${encodeURIComponent(safeQuery)}">
        <span class="search-suggestions__query-icon" aria-hidden="true">
          <i class="app-icon fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        </span>
        <div class="search-suggestions__content">
          <strong class="search-suggestions__title">Search for &ldquo;${window.ClashlyUtils.escapeHtml(safeQuery)}&rdquo;</strong>
          <span class="search-suggestions__meta">See all people, takes, and tags</span>
        </div>
      </a>
    `;
  }

  function renderUsers(users, query) {
    if (!users.length) return "";

    return `
      <section class="search-suggestions__group">
        <header class="search-suggestions__label">Users</header>
        ${users
          .map(
            (user) => {
              const params = new URLSearchParams();
              if (user && user.id) params.set("id", user.id);
              if (user && user.username) params.set("u", user.username);
              const href = params.toString() ? `user.html?${params.toString()}` : "user.html";
              return `
              <a class="search-suggestions__item" href="${href}">
                ${renderUserAvatar(user)}
                <div class="search-suggestions__content">
            <strong class="search-suggestions__title">@${highlightMatch(user.username, query)}</strong>
                  <span class="search-suggestions__meta">${window.ClashlyUtils.escapeHtml(
                    truncateText(user.bio || "No bio yet.", 64)
                  )}</span>
                </div>
              </a>
            `;
            }
          )
          .join("")}
      </section>
    `;
  }

  function renderHashtags(hashtags, query) {
    if (!hashtags.length) return "";

    const safeQuery = stripHash(query);

    return `
      <section class="search-suggestions__group">
        <header class="search-suggestions__label">Hashtags</header>
        ${hashtags
          .map(
            (hashtag) => `
              <a class="search-suggestions__item search-suggestions__item--hashtag" href="hashtag.html?tag=${encodeURIComponent(hashtag.tag)}">
                <div class="search-suggestions__content">
                  <strong class="search-suggestions__title">#${highlightMatch(hashtag.tag, safeQuery)}</strong>
                  <span class="search-suggestions__meta">Open hashtag feed</span>
                </div>
              </a>
            `
          )
          .join("")}
      </section>
    `;
  }

  function renderTakes(takes, query) {
    if (!takes.length) return "";

    const safeQuery = String(query || "").trim();

    return `
      <section class="search-suggestions__group">
        <header class="search-suggestions__label">Takes</header>
        ${takes
          .map((take) => {
            const username = take.profile && take.profile.username ? String(take.profile.username) : "anonymous";
            const href = safeQuery
              ? `search.html?q=${encodeURIComponent(safeQuery)}&expandTake=${encodeURIComponent(take.id)}`
              : `search.html?expandTake=${encodeURIComponent(take.id)}`;
            return `
              <a class="search-suggestions__item search-suggestions__item--take" href="${href}">
                <div class="search-suggestions__content">
                  <strong class="search-suggestions__title">${window.ClashlyUtils.escapeHtml(username)}</strong>
                  <span class="search-suggestions__meta">${highlightMatch(truncateText(take.content, 92), safeQuery)}</span>
                </div>
              </a>
            `;
          })
          .join("")}
      </section>
    `;
  }

  function renderRecents(recents) {
    if (!recents.length) return "";

    return `
      <section class="search-suggestions__group">
        <header class="search-suggestions__label">Recent searches</header>
        ${recents
          .map(
            (term) => `
              <a class="search-suggestions__item search-suggestions__item--recent" href="search.html?q=${encodeURIComponent(term)}">
                <span class="search-suggestions__recent-icon" aria-hidden="true">
                  <i class="app-icon fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                </span>
                <div class="search-suggestions__content">
                  <strong class="search-suggestions__title">${window.ClashlyUtils.escapeHtml(term)}</strong>
                </div>
              </a>
            `
          )
          .join("")}
      </section>
    `;
  }

  function createDropdown(form) {
    const dropdown = document.createElement("div");
    dropdown.className = "search-suggestions";
    dropdown.hidden = true;
    form.appendChild(dropdown);
    return dropdown;
  }

  function hide(instance) {
    instance.dropdown.hidden = true;
    instance.dropdown.innerHTML = "";
    instance.latestQuery = "";
    instance.activeIndex = -1;
  }

  function show(instance) {
    instance.dropdown.hidden = false;
  }

  function renderRecentOnly(instance) {
    const recents =
      typeof instance.getRecentSearches === "function" ? instance.getRecentSearches() || [] : [];

    if (!recents.length) {
      hide(instance);
      return;
    }

    instance.latestQuery = "";
    instance.dropdown.innerHTML = renderRecents(recents.slice(0, 6));
    resetActiveItem(instance);
    show(instance);
  }

  function renderResults(instance, results) {
    const users = results.users || [];
    const hashtags = results.hashtags || [];
    const takes = results.takes || [];
    const hasResults = users.length || hashtags.length || takes.length;
    const queryAction = renderQueryAction(instance.latestQuery);

    if (!hasResults) {
      instance.dropdown.innerHTML = `
        ${queryAction}
        <div class="search-suggestions__empty">No matching suggestions yet — try the full search.</div>
      `;
      resetActiveItem(instance);
      show(instance);
      return;
    }

    instance.dropdown.innerHTML = `
      ${queryAction}
      ${renderUsers(users, instance.latestQuery)}
      ${renderHashtags(hashtags, instance.latestQuery)}
      ${renderTakes(takes, instance.latestQuery)}
    `;
    resetActiveItem(instance);
    show(instance);
  }

  function renderLoading(instance) {
    instance.dropdown.innerHTML = `
      <div class="search-suggestions__loading">
        <span class="search-suggestions__spinner" aria-hidden="true"></span>
        <span>Searching&hellip;</span>
      </div>
    `;
    resetActiveItem(instance);
    show(instance);
  }

  async function loadSuggestions(instance) {
    const query = String(instance.input.value || "").trim();
    instance.requestId += 1;
    const currentRequestId = instance.requestId;

    if (!query) {
      renderRecentOnly(instance);
      return;
    }

    instance.latestQuery = query;

    if (instance.dropdown.hidden || !instance.dropdown.children.length) {
      renderLoading(instance);
    }

    try {
      const results = await window.ClashlySearch.fetchSuggestions(query, {
        currentUserId: typeof instance.getCurrentUserId === "function" ? instance.getCurrentUserId() : "",
      });

      if (currentRequestId !== instance.requestId) return;
      if (!results || results.error) {
        renderResults(instance, { users: [], hashtags: [], takes: [] });
        return;
      }

      renderResults(instance, results);
    } catch (error) {
      if (currentRequestId !== instance.requestId) return;
      renderResults(instance, { users: [], hashtags: [], takes: [] });
    }
  }

  function scheduleLoad(instance) {
    window.clearTimeout(instance.timer);
    instance.timer = window.setTimeout(() => {
      loadSuggestions(instance);
    }, 140);
  }

  function attach(config) {
    const form = document.getElementById(config.formId);
    const input = document.getElementById(config.inputId);
    if (!form || !input || !window.ClashlySearch || !window.ClashlyUtils || !window.ClashlyProfiles) return null;

    const instance = {
      form,
      input,
      dropdown: createDropdown(form),
      timer: 0,
      requestId: 0,
      latestQuery: "",
      activeIndex: -1,
      getCurrentUserId: config.getCurrentUserId,
      getRecentSearches: config.getRecentSearches,
    };

    input.addEventListener("input", () => {
      scheduleLoad(instance);
    });

    input.addEventListener("focus", () => {
      scheduleLoad(instance);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (instance.dropdown.hidden) {
          scheduleLoad(instance);
          return;
        }
        moveActiveItem(instance, 1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (instance.dropdown.hidden) {
          scheduleLoad(instance);
          return;
        }
        moveActiveItem(instance, -1);
        return;
      }

      if (event.key === "Enter" && !instance.dropdown.hidden) {
        if (openActiveItem(instance)) {
          event.preventDefault();
          return;
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();
        hide(instance);
      }
    });

    instance.dropdown.addEventListener("pointermove", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const item = target.closest(".search-suggestions__item");
      if (!item) return;

      const items = getItems(instance);
      const index = items.indexOf(item);
      if (index < 0 || index === instance.activeIndex) return;
      instance.activeIndex = index;
      updateActiveItem(instance);
    });

    instance.dropdown.addEventListener("click", () => {
      hide(instance);
    });

    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (form.contains(target)) return;
      hide(instance);
    });

    form.addEventListener("submit", () => {
      hide(instance);
    });

    return instance;
  }

  window.ClashlySearchSuggestions = {
    attach,
  };
})();
