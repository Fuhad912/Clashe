(function () {
  const DEFAULT_PREVIEW_TEXT = "Image preview area";

  function setStatus(message, type) {
    const statusEl = document.getElementById("composer-status");
    if (!statusEl) return;

    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (type === "error") statusEl.classList.add("is-error");
    if (type === "success") statusEl.classList.add("is-success");
  }

  function updateCount(textarea, countEl, maxChars) {
    const length = textarea.value.length;
    countEl.textContent = `${length} / ${maxChars}`;
  }

  async function populateCategories(selectEl) {
    if (!selectEl || !window.ClashlyCategories) return;

    selectEl.innerHTML = `<option value="">Loading categories...</option>`;

    try {
      const result = await window.ClashlyCategories.fetchCategories();
      if (result.error) throw result.error;

      const categories = result.categories || [];
      if (!categories.length) {
        selectEl.innerHTML = `<option value="">No categories available</option>`;
        return;
      }

      selectEl.innerHTML = [
        `<option value="">Select category</option>`,
        ...categories.map(
          (category) =>
            `<option value="${window.ClashlyUtils.escapeHtml(category.slug)}">${window.ClashlyUtils.escapeHtml(
              category.name
            )}</option>`
        ),
      ].join("");
    } catch (error) {
      selectEl.innerHTML = `<option value="">Could not load categories</option>`;
    }
  }

  function getMimeTypeForImageFile(file) {
    if (file && typeof file.type === "string" && file.type.startsWith("image/")) {
      return file.type;
    }
    const name = ((file && file.name) || "").toLowerCase();
    if (name.endsWith(".png")) return "image/png";
    if (name.endsWith(".webp")) return "image/webp";
    if (name.endsWith(".gif")) return "image/gif";
    return "image/jpeg";
  }

  function createSafeImagePreviewUrl(file) {
    if (!file) return "";
    const mimeType = getMimeTypeForImageFile(file);
    try {
      if (!file.type || !file.type.startsWith("image/")) {
        const safeBlob = file.slice(0, file.size, mimeType);
        return URL.createObjectURL(safeBlob);
      }
      return URL.createObjectURL(file);
    } catch (_) {
      try {
        return URL.createObjectURL(file);
      } catch (_err) {
        return "";
      }
    }
  }

  function showPreviewFallbackBadge(imgEl, file) {
    const parent = imgEl.parentElement;
    if (!parent) return;
    const fileName = (file && file.name) || "Image";
    const badge = document.createElement("div");
    badge.className = "image-preview-fallback";
    badge.innerHTML = `
      <i class="app-icon fa-solid fa-image" aria-hidden="true"></i>
      <span class="image-preview-fallback__name">${window.ClashlyUtils ? window.ClashlyUtils.escapeHtml(fileName) : fileName}</span>
      <span class="image-preview-fallback__badge">Attached</span>
    `;
    imgEl.replaceWith(badge);
  }

  function attachPreviewImageFallback(imgEl, file) {
    if (!imgEl || !file) return;

    imgEl.addEventListener(
      "error",
      function onImgError() {
        if (imgEl.dataset.fallbackTried === "true") return;
        imgEl.dataset.fallbackTried = "true";

        try {
          const reader = new FileReader();
          reader.onload = function (e) {
            if (e.target && e.target.result) {
              imgEl.src = e.target.result;
            } else {
              showPreviewFallbackBadge(imgEl, file);
            }
          };
          reader.onerror = function () {
            showPreviewFallbackBadge(imgEl, file);
          };
          reader.readAsDataURL(file);
        } catch (_) {
          showPreviewFallbackBadge(imgEl, file);
        }
      },
      { once: true }
    );
  }

  function resetPreview(preview) {
    const objectUrls = JSON.parse(preview.dataset.objectUrls || "[]");
    objectUrls.forEach((objectUrl) => {
      try { URL.revokeObjectURL(objectUrl); } catch (_) {}
    });
    delete preview.dataset.objectUrls;
    preview.classList.remove("has-image");
    preview.classList.remove("image-preview-placeholder--split");
    preview.textContent = DEFAULT_PREVIEW_TEXT;
  }

  function renderPreview(preview, files) {
    const safeFiles = Array.from(files || []).filter(Boolean);
    if (!safeFiles.length) {
      resetPreview(preview);
      return;
    }

    const objectUrls = safeFiles.map((file) => createSafeImagePreviewUrl(file));
    preview.dataset.objectUrls = JSON.stringify(objectUrls);
    preview.classList.add("has-image");

    if (safeFiles.length === 1) {
      preview.classList.remove("image-preview-placeholder--split");
      preview.innerHTML = `
        <div class="image-preview-placeholder__slot image-preview-placeholder__slot--single">
          <img src="${objectUrls[0]}" alt="Selected upload preview" />
          <button type="button" class="image-preview-remove" data-remove-index="0" aria-label="Remove image">
            <i class="app-icon fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      `;
      const img = preview.querySelector("img");
      if (img) attachPreviewImageFallback(img, safeFiles[0]);
      return;
    }

    preview.classList.add("image-preview-placeholder--split");
    preview.innerHTML = safeFiles
      .map(
        (file, index) => `
          <div class="image-preview-placeholder__slot">
            <img src="${objectUrls[index]}" alt="Selected upload preview ${index + 1}" />
            <button type="button" class="image-preview-remove" data-remove-index="${index}" aria-label="Remove image ${index + 1}">
              <i class="app-icon fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        `
      )
      .join("");

    const imgs = preview.querySelectorAll("img");
    imgs.forEach((img, idx) => {
      attachPreviewImageFallback(img, safeFiles[idx]);
    });
  }

  function mergeSelectedFiles(existingFiles, incomingFiles, maxFiles) {
    const merged = [];
    const seenKeys = new Set();

    [...Array.from(existingFiles || []), ...Array.from(incomingFiles || [])].forEach((file) => {
      if (!file) return;
      const key = [file.name, file.size, file.lastModified].join(":");
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      merged.push(file);
    });

    return merged.slice(0, Math.max(0, Number(maxFiles || 0)) || 0);
  }

  function setupImagePreview(input, preview, state) {
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []).filter(Boolean);
      if (!files.length) {
        return;
      }

      const maxFiles = Number(window.ClashlyTakes.MAX_IMAGES_PER_TAKE || 2);
      const mergedFiles = mergeSelectedFiles(state.selectedFiles, files, maxFiles + files.length);
      const imageValidation = window.ClashlyTakes.validateImageFiles(mergedFiles);
      if (!imageValidation.valid) {
        input.value = "";
        setStatus(imageValidation.error, "error");
        return;
      }

      state.selectedFiles = mergedFiles;
      resetPreview(preview);
      renderPreview(preview, state.selectedFiles);
      input.value = "";
      setStatus("", "");
    });

    preview.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-index]");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      const idx = Number(btn.getAttribute("data-remove-index"));
      if (!Number.isNaN(idx) && idx >= 0 && idx < state.selectedFiles.length) {
        state.selectedFiles.splice(idx, 1);
        resetPreview(preview);
        renderPreview(preview, state.selectedFiles);
        setStatus("", "");
      }
    });
  }

  async function initCreatePage() {
    if (!window.ClashlyTakes || !window.ClashlySession || !window.ClashlyCategories) return;

    const textarea = document.getElementById("take-text");
    const countEl = document.getElementById("char-count");
    const categoryInput = document.getElementById("take-category");
    const categoryTrigger = document.getElementById("take-category-trigger");
    const categoryTriggerText = document.getElementById("take-category-trigger-text");
    const imageInput = document.getElementById("take-image");
    const preview = document.getElementById("image-preview");
    const form = document.getElementById("take-form");
    const submitBtn = document.getElementById("post-take-btn");

    if (!textarea || !countEl || !categoryInput || !imageInput || !preview || !form || !submitBtn) return;

    const composerState = {
      selectedFiles: [],
    };

    let categoryPicker = null;
    if (window.ClasheCategoryModal && typeof window.ClasheCategoryModal.bindCategoryPicker === "function") {
      categoryPicker = window.ClasheCategoryModal.bindCategoryPicker({
        triggerEl: categoryTrigger,
        inputEl: categoryInput,
        textEl: categoryTriggerText,
        onChange: () => setStatus("", ""),
      });
    } else if (categoryInput.tagName === "SELECT") {
      await populateCategories(categoryInput);
    }

    const maxChars = window.ClashlyTakes.MAX_CONTENT_LENGTH;
    updateCount(textarea, countEl, maxChars);
    textarea.addEventListener("input", () => {
      setStatus("", "");
      updateCount(textarea, countEl, maxChars);
    });
    categoryInput.addEventListener("change", () => setStatus("", ""));
    setupImagePreview(imageInput, preview, composerState);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus("", "");

      const content = textarea.value;
      const contentError = window.ClashlyTakes.validateTakeContent(content);
      if (contentError) {
        setStatus(contentError, "error");
        return;
      }

      const categoryError = window.ClashlyTakes.validateCategory(categoryInput.value);
      if (categoryError) {
        setStatus(categoryError, "error");
        if (categoryTrigger) categoryTrigger.focus();
        return;
      }

      const imageFiles = composerState.selectedFiles.slice();
      const imageValidation = window.ClashlyTakes.validateImageFiles(imageFiles);
      if (!imageValidation.valid) {
        setStatus(imageValidation.error, "error");
        return;
      }

      const sessionState = await window.ClashlySession.resolveSession();
      if (!sessionState.user) {
        window.location.replace("auth.html");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Posting...";

      if (window.ClasheLoader && typeof window.ClasheLoader.show === "function") {
        window.ClasheLoader.show("create-take");
      }

      try {
        const createResult = await window.ClashlyTakes.createTake({
          userId: sessionState.user.id,
          content,
          categorySlug: categoryInput.value,
          imageFiles,
        });

        if (createResult.error) {
          throw createResult.error;
        }

        form.reset();
        if (categoryPicker) {
          categoryPicker.reset();
        }
        composerState.selectedFiles = [];
        resetPreview(preview);
        updateCount(textarea, countEl, maxChars);

        // Prepend new take to cached home feed so it renders immediately with user profile on redirect
        if (createResult.take && window.ClasheCache) {
          try {
            const cachedRecord = window.ClasheCache.getPageState("home");
            const cachedData = (cachedRecord && cachedRecord.data) || {
              section: "for-you",
              takes: [],
              hasMore: true,
              cursor: null,
            };
            if (Array.isArray(cachedData.takes)) {
              const existingIndex = cachedData.takes.findIndex((t) => t.id === createResult.take.id);
              if (existingIndex === -1) {
                cachedData.takes.unshift(createResult.take);
              } else {
                cachedData.takes[existingIndex] = createResult.take;
              }
              window.ClasheCache.savePageState("home", cachedData, 0);
            }
          } catch (_) {}
        }

        const hasReferrer =
          document.referrer &&
          !document.referrer.includes("auth.html") &&
          !document.referrer.includes("create.html");

        window.setTimeout(() => {
          if (hasReferrer && window.history.length > 1) {
            window.location.replace(document.referrer);
          } else {
            window.location.replace("index.html");
          }
        }, 350);
      } catch (error) {
        if (window.ClasheLoader && typeof window.ClasheLoader.hide === "function") {
          window.ClasheLoader.hide("create-take");
        }
        const message = window.ClashlyUtils.reportError("Create page post failed.", error, "Could not post take.");
        setStatus(message, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Post Take";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", initCreatePage);
})();
