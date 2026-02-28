// content.js — Page content extraction for ClaudeFox
// Injected into all pages. Responds to EXTRACT_CONTENT messages from background.

(function () {
  // Guard against double-registration if script is injected more than once
  if (window.__claudefoxListenerRegistered) return;
  window.__claudefoxListenerRegistered = true;

  const NOISE_SELECTORS = [
    "nav",
    "header",
    "footer",
    "aside",
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    ".sidebar",
    "#sidebar",
    ".nav",
    "#nav",
    ".ad",
    ".ads",
    ".advertisement",
    "script",
    "style",
    "noscript",
    "iframe",
  ];

  const CONTENT_SELECTORS = ["article", "main", '[role="main"]', ".post-content", ".entry-content", ".article-body"];

  const FALLBACK_MAX_CHARS = 8000;

  function extractWithReadability() {
    try {
      // Readability mutates its input — clone the document
      const clone = document.cloneNode(true);
      const reader = new Readability(clone);
      const article = reader.parse();

      if (article && article.textContent && article.textContent.trim().length > 100) {
        return {
          title: article.title || document.title,
          content: article.textContent.trim(),
          excerpt: article.excerpt || "",
          fallback: false,
        };
      }
    } catch (e) {
      // Readability not available or threw — fall through to fallback
    }
    return null;
  }

  function extractFallback() {
    const clone = document.body.cloneNode(true);

    // Strip noise elements
    NOISE_SELECTORS.forEach(function (sel) {
      clone.querySelectorAll(sel).forEach(function (el) {
        el.remove();
      });
    });

    // Try content-specific selectors first
    for (var i = 0; i < CONTENT_SELECTORS.length; i++) {
      var el = clone.querySelector(CONTENT_SELECTORS[i]);
      if (el && el.textContent && el.textContent.trim().length > 200) {
        return el.textContent.trim().slice(0, FALLBACK_MAX_CHARS);
      }
    }

    // Last resort: full body text, truncated
    var text = clone.textContent || "";
    return text.trim().slice(0, FALLBACK_MAX_CHARS);
  }

  browser.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action !== "EXTRACT_CONTENT") return false;

    try {
      // Try Readability first
      var result = extractWithReadability();

      if (result) {
        sendResponse({
          success: true,
          title: result.title,
          content: result.content,
          excerpt: result.excerpt,
          url: window.location.href,
          fallback: false,
        });
      } else {
        // Readability failed or returned too little — use fallback
        var fallbackContent = extractFallback();
        sendResponse({
          success: true,
          title: document.title,
          content: fallbackContent,
          excerpt: "",
          url: window.location.href,
          fallback: true,
        });
      }
    } catch (err) {
      sendResponse({
        success: false,
        error: err.message,
      });
    }

    return true; // Keep message channel open for async sendResponse
  });
})();
