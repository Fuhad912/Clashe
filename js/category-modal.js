(function () {
  const DEFAULT_CATEGORIES = [
    {
      id: "c4edc3d4-f34b-4a89-b4cb-91fff2b7e7b5",
      slug: "tech",
      name: "Tech",
      description: "Platforms, gadgets, software culture, launch cycles, and where the internet is moving next.",
      keywords: ["ai", "startups", "software", "apple", "android"],
      sort_order: 20,
    },
    {
      id: "9028b707-95ac-4b95-b7c2-73aa31d1a986",
      slug: "sports",
      name: "Sports",
      description: "League-wide rivalries, athlete takes, ranking wars, and the biggest arguments in sport.",
      keywords: ["olympics", "ufc", "tennis", "motorsport", "boxing"],
      sort_order: 30,
    },
    {
      id: "a666d28a-33e4-4974-952f-2b41ab7672b5",
      slug: "football",
      name: "Football",
      description: "Transfers, managers, leagues, club loyalty, and the football debates that never cool down.",
      keywords: ["premierleague", "championsleague", "arsenal", "realmadrid", "transfers"],
      sort_order: 40,
    },
    {
      id: "2bee24a1-dbbf-4461-9c62-cd6015df8274",
      slug: "basketball",
      name: "Basketball",
      description: "NBA and WNBA debates, legacy wars, playoff takes, trades, and franchise pressure.",
      keywords: ["nba", "wnba", "lebron", "jordan", "playoffs"],
      sort_order: 50,
    },
    {
      id: "2220b2c7-3e4b-4fcc-b953-28575cdd376e",
      slug: "gaming",
      name: "Gaming",
      description: "Console wars, esports, releases, streamer culture, and where gaming communities clash.",
      keywords: ["playstation", "xbox", "nintendo", "esports", "streamers"],
      sort_order: 130,
    },
    {
      id: "50818e31-1fd6-4518-b0f8-c5496cf32abb",
      slug: "music",
      name: "Music",
      description: "Albums, artist rivalry, fan wars, industry shifts, and the sounds shaping culture now.",
      keywords: ["afrobeats", "hiphop", "albums", "concerts", "grammys"],
      sort_order: 120,
    },
    {
      id: "0c0d0d08-5446-447f-8f00-35f442f25fb7",
      slug: "movies",
      name: "Movies",
      description: "Cinema takes, casting, franchises, endings, streaming, and whether the hype was deserved.",
      keywords: ["cinema", "marvel", "dc", "oscars", "directors"],
      sort_order: 110,
    },
    {
      id: "e903e0c3-25b8-4587-83cc-a7768b3526b1",
      slug: "entertainment",
      name: "Entertainment",
      description: "Celebrity moments, internet culture, awards, gossip cycles, and attention economies.",
      keywords: ["celebrities", "awardshows", "popculture", "drama", "fandom"],
      sort_order: 100,
    },
    {
      id: "58918828-e4ad-4eb4-bdc0-8b7a722bf84a",
      slug: "politics",
      name: "Politics",
      description: "Power, policy, elections, ideology, and the public fights that shape a country.",
      keywords: ["elections", "policy", "government", "democracy", "leadership"],
      sort_order: 70,
    },
    {
      id: "a7451fb9-37c8-4b39-9cb1-81ccb6c053b5",
      slug: "finance",
      name: "Finance",
      description: "Money, salaries, cost of living, debt, investing, and the reality of modern economics.",
      keywords: ["investing", "salary", "inflation", "realestate", "crypto"],
      sort_order: 80,
    },
    {
      id: "afbe8346-9265-47ab-96dc-77286f8202e6",
      slug: "business",
      name: "Business",
      description: "Brands, founders, management, company strategy, growth, and where business misreads the public.",
      keywords: ["brands", "founders", "management", "marketing", "ecommerce"],
      sort_order: 90,
    },
    {
      id: "a894e0b5-c64c-4b15-9066-a0325e38d08f",
      slug: "entrepreneurship",
      name: "Entrepreneurship",
      description: "Side hustles, creator businesses, founder risk, and building from scratch.",
      keywords: ["startups", "founders", "sidehustle", "creators", "growth"],
      sort_order: 250,
    },
    {
      id: "9a1da7cb-6494-4d69-88ad-ee3c38d4c05b",
      slug: "career",
      name: "Career",
      description: "Jobs, promotions, layoffs, remote work, ambition, and the shape of modern working life.",
      keywords: ["jobs", "layoffs", "remote", "workplace", "promotion"],
      sort_order: 240,
    },
    {
      id: "b7f9b773-c456-46ee-a45f-0a877c788a8e",
      slug: "education",
      name: "Education",
      description: "School systems, exams, learning culture, campus life, and where education is breaking down.",
      keywords: ["studentloans", "onlinelearning", "campuslife", "teachers", "exams"],
      sort_order: 10,
    },
    {
      id: "aab1579c-7493-4f23-a3d2-3e6680c838e9",
      slug: "science",
      name: "Science",
      description: "Research, breakthroughs, skepticism, public science, and what people misunderstand most.",
      keywords: ["space", "biology", "physics", "research", "innovation"],
      sort_order: 160,
    },
    {
      id: "df8d106a-3961-4642-94ca-dc33eebc810e",
      slug: "health",
      name: "Health",
      description: "Mental health, healthcare, nutrition, access, and the arguments around what healthy really means.",
      keywords: ["mentalhealth", "nutrition", "therapy", "healthcare", "sleep"],
      sort_order: 140,
    },
    {
      id: "bc427919-b08f-4448-a848-905e866a03e6",
      slug: "fitness",
      name: "Fitness",
      description: "Training, gym culture, body goals, discipline talk, and sports performance arguments.",
      keywords: ["gym", "running", "lifting", "bodybuilding", "training"],
      sort_order: 150,
    },
    {
      id: "7d0663e8-54a6-49e7-86dc-77d945bd781c",
      slug: "lifestyle",
      name: "Lifestyle",
      description: "Habits, routines, dating culture, daily choices, and how people think life should be lived.",
      keywords: ["dating", "morningroutine", "habits", "adulting", "wellness"],
      sort_order: 60,
    },
    {
      id: "02666201-7749-4189-9e3a-c347db2f7a38",
      slug: "relationships",
      name: "Relationships",
      description: "Dating, marriage, friendship, loyalty, and the expectations people clash over most.",
      keywords: ["dating", "marriage", "friendship", "love", "genderroles"],
      sort_order: 230,
    },
    {
      id: "3e48f6b0-a53c-4a85-8692-08f6ccdf3d13",
      slug: "culture",
      name: "Culture",
      description: "Identity, religion, values, language, and the norms people fight hardest to defend.",
      keywords: ["religion", "identity", "tradition", "society", "language"],
      sort_order: 220,
    },
    {
      id: "05be8307-b85a-4112-92c3-7655087bf9e7",
      slug: "fashion",
      name: "Fashion",
      description: "Style identity, streetwear, luxury, trends, and the people deciding what looks good.",
      keywords: ["streetwear", "luxury", "style", "sneakers", "designers"],
      sort_order: 200,
    },
    {
      id: "3c3998b1-694e-4c3f-b3f1-87b4ea64eb09",
      slug: "beauty",
      name: "Beauty",
      description: "Skincare, makeup, hair, grooming, and how online beauty standards keep shifting.",
      keywords: ["skincare", "makeup", "hair", "grooming", "aesthetics"],
      sort_order: 210,
    },
    {
      id: "7bc3ffe0-86a8-47fa-a026-f4cc545947bb",
      slug: "food",
      name: "Food",
      description: "Cuisine wars, restaurants, street food, diets, coffee takes, and what people call overrated.",
      keywords: ["restaurants", "cooking", "streetfood", "vegan", "coffee"],
      sort_order: 190,
    },
    {
      id: "9de3d996-8042-482f-bfa5-6b8e2ed7fbe2",
      slug: "travel",
      name: "Travel",
      description: "Destinations, visas, tourism, migration dreams, and how people move through the world.",
      keywords: ["tourism", "studyabroad", "visa", "remotework", "cities"],
      sort_order: 180,
    },
    {
      id: "bf7e8c85-68e0-4a9d-9e05-bc2789fefce9",
      slug: "climate",
      name: "Climate",
      description: "Energy, sustainability, climate change, responsibility, and what urgency really looks like.",
      keywords: ["sustainability", "energy", "climatechange", "environment", "greenpolicy"],
      sort_order: 170,
    },
  ];

  let cachedCategories = [...DEFAULT_CATEGORIES];
  let isFetching = false;
  let modalEl = null;
  let activeCallback = null;
  let activeTrigger = null;
  let selectedCategorySlug = "";
  let currentSearchQuery = "";

  // Helper: Escape HTML
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Load from backend service in background
  async function refreshCategories() {
    if (isFetching || !window.ClashlyCategories || typeof window.ClashlyCategories.fetchCategories !== "function") {
      return;
    }
    isFetching = true;
    try {
      const result = await window.ClashlyCategories.fetchCategories();
      if (result && Array.isArray(result.categories) && result.categories.length > 0) {
        cachedCategories = result.categories;
        renderCategoryList();
      }
    } catch (_) {
      // Retain default curated categories silently
    } finally {
      isFetching = false;
    }
  }

  function getCategoryBySlug(slug) {
    if (!slug) return null;
    const safe = String(slug).toLowerCase().trim();
    return cachedCategories.find((c) => String(c.slug).toLowerCase() === safe) || null;
  }

  function createModalDOM() {
    if (modalEl) return modalEl;

    const modal = document.createElement("div");
    modal.id = "clashe-category-modal";
    modal.className = "category-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "category-modal-title");
    modal.hidden = true;

    modal.innerHTML = `
      <div class="category-modal__backdrop" data-close-modal="true"></div>
      <div class="category-modal__dialog" role="document">
        <header class="category-modal__head">
          <div class="category-modal__head-meta">
            <span class="category-modal__kicker">Category selection</span>
            <h2 id="category-modal-title" class="category-modal__title">Pick a Category</h2>
            <p class="category-modal__subtitle">Every take belongs to one lane. Choose where this clash lives.</p>
          </div>
          <button type="button" class="modal-close-btn category-modal__close" data-close-modal="true" aria-label="Close category selector">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </header>

        <div class="category-modal__search-wrap">
          <span class="category-modal__search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          </span>
          <input
            type="text"
            id="category-modal-search"
            class="category-modal__search-input"
            placeholder="Search categories (e.g. tech, football, music, ai)..."
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <div class="category-modal__body">
          <div class="category-modal__count-bar" id="category-modal-count-bar">
            <span>All Categories</span>
            <span class="category-modal__badge-count" id="category-filtered-count">25 lanes</span>
          </div>
          <div class="category-modal__grid" id="category-modal-grid" role="listbox" aria-label="Available categories"></div>
          <div class="category-modal__empty" id="category-modal-empty" hidden>
            <div class="category-modal__empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
                <path d="M8 11h6"></path>
              </svg>
            </div>
            <p class="category-modal__empty-title">No categories found</p>
            <p class="category-modal__empty-text" id="category-empty-text">No lanes match your search.</p>
            <button type="button" class="btn btn--secondary category-modal__empty-btn" id="category-reset-search-btn">Show all categories</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event handlers
    modal.addEventListener("click", (event) => {
      if (event.target && event.target.closest("[data-close-modal='true']")) {
        closeModal();
      }
    });

    const searchInput = modal.querySelector("#category-modal-search");
    const resetSearchBtn = modal.querySelector("#category-reset-search-btn");

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        currentSearchQuery = e.target.value.trim().toLowerCase();
        renderCategoryList();
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          if (currentSearchQuery) {
            searchInput.value = "";
            currentSearchQuery = "";
            renderCategoryList();
          } else {
            closeModal();
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          const firstItem = modal.querySelector(".category-item");
          if (firstItem) {
            const slug = firstItem.dataset.categorySlug;
            const category = getCategoryBySlug(slug);
            if (category) selectCategory(category);
          }
        }
      });
    }

    if (resetSearchBtn) {
      resetSearchBtn.addEventListener("click", () => {
        if (searchInput) {
          searchInput.value = "";
          searchInput.focus();
        }
        currentSearchQuery = "";
        renderCategoryList();
      });
    }

    // Escape listener
    document.addEventListener("keydown", (e) => {
      if (!modalEl || modalEl.hidden) return;
      if (e.key === "Escape") {
        closeModal();
      }
    });

    modalEl = modal;
    return modalEl;
  }

  function filterCategories(categories, query) {
    if (!query) return categories;
    const tokens = query.split(/\s+/).filter(Boolean);

    return categories.filter((category) => {
      const name = String(category.name || "").toLowerCase();
      const slug = String(category.slug || "").toLowerCase();
      const desc = String(category.description || "").toLowerCase();
      const keywords = Array.isArray(category.keywords)
        ? category.keywords.map((k) => String(k).toLowerCase()).join(" ")
        : "";

      const haystack = `${name} ${slug} ${desc} ${keywords}`;
      return tokens.every((token) => haystack.includes(token));
    });
  }

  function renderCategoryList() {
    if (!modalEl) return;
    const grid = modalEl.querySelector("#category-modal-grid");
    const empty = modalEl.querySelector("#category-modal-empty");
    const emptyText = modalEl.querySelector("#category-empty-text");
    const countBadge = modalEl.querySelector("#category-filtered-count");
    if (!grid) return;

    const filtered = filterCategories(cachedCategories, currentSearchQuery);

    if (countBadge) {
      if (currentSearchQuery) {
        countBadge.textContent = `${filtered.length} of ${cachedCategories.length} lanes`;
      } else {
        countBadge.textContent = `${cachedCategories.length} lanes`;
      }
    }

    if (!filtered.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      if (emptyText) {
        emptyText.textContent = `No lanes match "${escapeHtml(currentSearchQuery)}".`;
      }
      return;
    }

    if (empty) empty.hidden = true;

    grid.innerHTML = filtered
      .map((cat) => {
        const isSelected = String(cat.slug).toLowerCase() === String(selectedCategorySlug).toLowerCase();
        const selectedClass = isSelected ? " is-selected" : "";
        const ariaSelected = isSelected ? 'aria-selected="true"' : 'aria-selected="false"';

        return `
          <button
            type="button"
            class="category-item${selectedClass}"
            data-category-slug="${escapeHtml(cat.slug)}"
            role="option"
            ${ariaSelected}
          >
            <div class="category-item__header">
              <span class="category-item__name">${escapeHtml(cat.name)}</span>
              <span class="category-item__slug">/${escapeHtml(cat.slug)}</span>
              <span class="category-item__check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
              </span>
            </div>
            <p class="category-item__desc">${escapeHtml(cat.description || "Category lane")}</p>
          </button>
        `;
      })
      .join("");

    // Bind click events on each item
    grid.querySelectorAll(".category-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const slug = btn.dataset.categorySlug;
        const category = getCategoryBySlug(slug);
        if (category) {
          selectCategory(category);
        }
      });
    });
  }

  function selectCategory(category) {
    const isAlreadySelected =
      Boolean(selectedCategorySlug) &&
      category &&
      String(selectedCategorySlug).toLowerCase() === String(category.slug).toLowerCase();

    if (isAlreadySelected) {
      // Toggle off / unclick the currently chosen lane
      selectedCategorySlug = "";
      if (typeof activeCallback === "function") {
        activeCallback(null);
      }
    } else {
      selectedCategorySlug = category.slug;
      if (typeof activeCallback === "function") {
        activeCallback(category);
      }
    }
    closeModal();
  }

  function openModal(options = {}) {
    createModalDOM();
    refreshCategories();

    selectedCategorySlug = options.currentSlug || "";
    activeCallback = options.onSelect || null;
    activeTrigger = options.triggerEl || null;

    currentSearchQuery = "";
    const searchInput = modalEl.querySelector("#category-modal-search");
    if (searchInput) {
      searchInput.value = "";
    }

    renderCategoryList();

    modalEl.hidden = false;
    document.body.classList.add("modal-open");

    // Micro-animation / focus
    window.requestAnimationFrame(() => {
      modalEl.classList.add("is-visible");
      if (searchInput) {
        searchInput.focus();
      }
      // If there is an active item, scroll it into view
      const selectedItem = modalEl.querySelector(".category-item.is-selected");
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }

  function closeModal() {
    if (!modalEl || modalEl.hidden) return;

    modalEl.classList.remove("is-visible");
    document.body.classList.remove("modal-open");

    window.setTimeout(() => {
      if (modalEl && !modalEl.classList.contains("is-visible")) {
        modalEl.hidden = true;
        if (activeTrigger && typeof activeTrigger.focus === "function") {
          activeTrigger.focus();
        }
      }
    }, 200);
  }

  /**
   * Helper to bind a category trigger button + hidden input pair
   */
  function bindCategoryPicker({ triggerEl, inputEl, textEl, onChange }) {
    if (!triggerEl || !inputEl) return;

    function updateTriggerUI(category) {
      if (!textEl) return;
      if (category && category.name) {
        textEl.classList.remove("is-placeholder");
        textEl.classList.add("is-selected");
        textEl.innerHTML = `
          <span class="category-picker-badge">${escapeHtml(category.name)}</span>
          <span class="category-picker-change-hint">Change</span>
        `;
      } else {
        textEl.classList.remove("is-selected");
        textEl.classList.add("is-placeholder");
        textEl.textContent = "Select a category";
      }
    }

    // Set initial UI if input already has a value
    if (inputEl.value) {
      const currentCat = getCategoryBySlug(inputEl.value);
      if (currentCat) {
        updateTriggerUI(currentCat);
      }
    }

    triggerEl.addEventListener("click", () => {
      openModal({
        currentSlug: inputEl.value,
        triggerEl,
        onSelect: (category) => {
          if (category && category.slug) {
            inputEl.value = category.slug;
            updateTriggerUI(category);
          } else {
            inputEl.value = "";
            updateTriggerUI(null);
          }
          // Dispatch input/change events on the hidden input so forms and validation detect it
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          inputEl.dispatchEvent(new Event("change", { bubbles: true }));
          if (typeof onChange === "function") {
            onChange(category || null);
          }
        },
      });
    });

    return {
      reset() {
        inputEl.value = "";
        updateTriggerUI(null);
      },
      setValue(slug) {
        if (!slug) {
          inputEl.value = "";
          updateTriggerUI(null);
          return;
        }
        const cat = getCategoryBySlug(slug);
        inputEl.value = cat ? cat.slug : "";
        updateTriggerUI(cat);
      },
    };
  }

  // Pre-fetch in idle time
  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", refreshCategories);
    } else {
      refreshCategories();
    }
  }

  window.ClasheCategoryModal = {
    open: openModal,
    close: closeModal,
    getCategoryBySlug,
    getAllCategories: () => [...cachedCategories],
    bindCategoryPicker,
  };
})();
