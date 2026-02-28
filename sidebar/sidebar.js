// sidebar.js — ClaudeFox sidebar view
// Stateless — all state lives in background.js.
// On open: fetch current state and render. Listen for live updates.

// Configure marked: escape raw HTML in source, enable GFM, add line breaks
marked.use({
  gfm: true,
  breaks: true,
});

function renderMarkdown(text) {
  if (!text) return "";
  return marked.parse(text);
}

var views = {
  idle: document.getElementById("state-idle"),
  loading: document.getElementById("state-loading"),
  complete: document.getElementById("state-complete"),
  error: document.getElementById("state-error"),
  history: document.getElementById("state-history"),
};

var currentView = "idle";
var selectedMode = "summarize";
var lastRawSummary = "";
var lastState = null; // Track state for New button confirmation

var MODE_LABELS = {
  summarize: "Summary",
  takeaways: "Key Takeaways",
  eli5: "ELI5",
  deep: "Deep Dive",
  actions: "Action Items",
};

function showView(name) {
  Object.keys(views).forEach(function (key) {
    views[key].classList.add("hidden");
  });
  if (views[name]) {
    views[name].classList.remove("hidden");
  }
  currentView = name;
}

// ─── Chat Thread Rendering ──────────────────────────────────────────────────

function renderChatThread(messages, streamingSummary, isStreaming) {
  var thread = document.getElementById("chat-thread");
  while (thread.firstChild) {
    thread.removeChild(thread.firstChild);
  }

  if (!messages || messages.length === 0) {
    // No conversation yet — just show the streaming/complete summary
    if (streamingSummary) {
      var div = document.createElement("div");
      div.className = "chat-message assistant";
      div.innerHTML = renderMarkdown(streamingSummary);
      if (isStreaming) {
        var cursor = document.createElement("span");
        cursor.className = "streaming-cursor";
        div.appendChild(cursor);
      }
      thread.appendChild(div);
    } else if (isStreaming) {
      // Thinking indicator — no text yet
      var thinkDiv = document.createElement("div");
      thinkDiv.className = "chat-message assistant thinking";
      thinkDiv.innerHTML = '<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>';
      thread.appendChild(thinkDiv);
    }
    thread.scrollTop = thread.scrollHeight;
    return;
  }

  // Render conversation — skip first user message (it's the raw page content)
  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];

    if (i === 0 && msg.role === "user") {
      // Skip the initial page content message — too long to display
      continue;
    }

    var div = document.createElement("div");
    div.className = "chat-message " + msg.role;

    if (msg.role === "assistant") {
      div.innerHTML = renderMarkdown(msg.content);
    } else {
      // User messages: textContent only
      div.textContent = msg.content;
    }

    thread.appendChild(div);
  }

  // If streaming, show the in-progress response or thinking indicator
  if (isStreaming) {
    if (streamingSummary) {
      var streamDiv = document.createElement("div");
      streamDiv.className = "chat-message assistant";
      streamDiv.innerHTML = renderMarkdown(streamingSummary);
      var cursor = document.createElement("span");
      cursor.className = "streaming-cursor";
      streamDiv.appendChild(cursor);
      thread.appendChild(streamDiv);
    } else {
      // Thinking indicator — waiting for first token
      var thinkDiv = document.createElement("div");
      thinkDiv.className = "chat-message assistant thinking";
      thinkDiv.innerHTML = '<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>';
      thread.appendChild(thinkDiv);
    }
  }

  thread.scrollTop = thread.scrollHeight;
}

// ─── State Rendering ────────────────────────────────────────────────────────

function renderState(state) {
  lastState = state;

  switch (state.status) {
    case "idle":
      showView("idle");
      break;

    case "extracting":
      showView("loading");
      document.getElementById("loading-label").textContent = "Reading page...";
      document.getElementById("btn-cancel").classList.remove("hidden");
      break;

    case "calling_api":
      showView("loading");
      document.getElementById("loading-label").textContent = "Asking Claude...";
      document.getElementById("btn-cancel").classList.remove("hidden");
      break;

    case "streaming":
      showView("complete");
      document.getElementById("page-title").textContent = state.title || "";
      document.getElementById("mode-label").textContent = MODE_LABELS[state.mode] || "";
      lastRawSummary = state.summary || "";

      renderChatThread(state.messages, state.summary, true);

      // Show stop button, hide copy while streaming
      document.getElementById("btn-copy").classList.add("hidden");
      document.getElementById("btn-stop").classList.remove("hidden");
      document.getElementById("btn-send").disabled = true;
      document.getElementById("chat-input").disabled = true;

      var truncNotice = document.getElementById("truncation-notice");
      if (state.truncated) {
        truncNotice.classList.remove("hidden");
      } else {
        truncNotice.classList.add("hidden");
      }
      break;

    case "complete":
      showView("complete");
      document.getElementById("page-title").textContent = state.title || "";
      document.getElementById("mode-label").textContent = MODE_LABELS[state.mode] || "";
      lastRawSummary = state.summary || "";

      renderChatThread(state.messages, null, false);

      // Show copy, hide stop
      document.getElementById("btn-copy").classList.remove("hidden");
      document.getElementById("btn-copy").disabled = false;
      document.getElementById("btn-copy").textContent = "Copy";
      document.getElementById("btn-stop").classList.add("hidden");
      document.getElementById("btn-send").disabled = false;
      document.getElementById("chat-input").disabled = false;

      var truncNotice = document.getElementById("truncation-notice");
      if (state.truncated) {
        truncNotice.classList.remove("hidden");
      } else {
        truncNotice.classList.add("hidden");
      }
      break;

    case "error":
      showView("error");
      document.getElementById("error-message").textContent = state.error || "Unknown error.";

      var settingsBtn = document.getElementById("btn-open-settings");
      if (state.error && state.error.indexOf("API key") !== -1) {
        settingsBtn.classList.remove("hidden");
      } else {
        settingsBtn.classList.add("hidden");
      }
      break;

    default:
      showView("idle");
  }
}

// ─── Initialize: get current state from background ──────────────────────────

browser.runtime.sendMessage({ action: "GET_STATE" }).then(function (response) {
  if (response && response.state) {
    renderState(response.state);
  }
});

// ─── Live state updates while sidebar is open ───────────────────────────────

browser.runtime.onMessage.addListener(function (message) {
  if (message.action === "STATE_UPDATE" && message.state) {
    renderState(message.state);
  }
});

// ─── Mode selector ──────────────────────────────────────────────────────────

var modeButtons = document.querySelectorAll(".mode-btn");
modeButtons.forEach(function (btn) {
  btn.addEventListener("click", function () {
    modeButtons.forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    selectedMode = btn.getAttribute("data-mode");
  });
});

// ─── Button handlers ────────────────────────────────────────────────────────

document.getElementById("btn-summarize").addEventListener("click", function () {
  browser.runtime.sendMessage({ action: "SUMMARIZE_CURRENT_TAB", mode: selectedMode });
  showView("loading");
  document.getElementById("loading-label").textContent = "Reading page...";
});

document.getElementById("btn-copy").addEventListener("click", function () {
  var text = lastRawSummary;
  var btn = document.getElementById("btn-copy");

  navigator.clipboard.writeText(text).then(
    function () {
      btn.textContent = "Copied!";
      setTimeout(function () { btn.textContent = "Copy"; }, 2000);
    },
    function () {
      btn.textContent = "Failed";
      setTimeout(function () { btn.textContent = "Copy"; }, 2000);
    }
  );
});

// ─── New Button with Confirmation ───────────────────────────────────────────

var newConfirmPending = false;
var newConfirmTimer = null;

document.getElementById("btn-new").addEventListener("click", function () {
  var btn = document.getElementById("btn-new");

  // If conversation has follow-ups (more than 2 messages = initial + first response), confirm first
  var hasConversation = lastState && lastState.messages && lastState.messages.length > 2;

  if (hasConversation && !newConfirmPending) {
    // First click — ask for confirmation
    newConfirmPending = true;
    btn.textContent = "Sure?";
    btn.classList.add("confirm");
    newConfirmTimer = setTimeout(function () {
      newConfirmPending = false;
      btn.textContent = "New";
      btn.classList.remove("confirm");
    }, 3000);
    return;
  }

  // Confirmed (or no conversation to protect)
  newConfirmPending = false;
  clearTimeout(newConfirmTimer);
  btn.textContent = "New";
  btn.classList.remove("confirm");
  browser.runtime.sendMessage({ action: "CLEAR_STATE" }).then(function () {
    showView("idle");
  });
});

// ─── Stop / Cancel Buttons ──────────────────────────────────────────────────

document.getElementById("btn-stop").addEventListener("click", function () {
  browser.runtime.sendMessage({ action: "CANCEL_STREAM" });
});

document.getElementById("btn-cancel").addEventListener("click", function () {
  browser.runtime.sendMessage({ action: "CANCEL_STREAM" });
  browser.runtime.sendMessage({ action: "CLEAR_STATE" }).then(function () {
    showView("idle");
  });
});

document.getElementById("btn-retry").addEventListener("click", function () {
  browser.runtime.sendMessage({ action: "SUMMARIZE_CURRENT_TAB", mode: selectedMode });
  showView("loading");
  document.getElementById("loading-label").textContent = "Reading page...";
});

document.getElementById("btn-settings").addEventListener("click", function () {
  browser.runtime.openOptionsPage();
});

document.getElementById("btn-open-settings").addEventListener("click", function () {
  browser.runtime.openOptionsPage();
});

// ─── Follow-up Chat ─────────────────────────────────────────────────────────

function sendFollowUp() {
  var input = document.getElementById("chat-input");
  var question = input.value.trim();
  if (!question) return;

  input.value = "";
  browser.runtime.sendMessage({ action: "FOLLOW_UP", question: question });
}

document.getElementById("btn-send").addEventListener("click", sendFollowUp);

document.getElementById("chat-input").addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendFollowUp();
  }
});

// ─── History ────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp) {
  var now = Date.now();
  var diff = now - timestamp;
  var seconds = Math.floor(diff / 1000);
  var minutes = Math.floor(seconds / 60);
  var hours = Math.floor(minutes / 60);
  var days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return minutes + " min ago";
  if (hours < 24) return hours + "h ago";
  if (days === 1) return "Yesterday";
  if (days < 7) return days + " days ago";

  var date = new Date(timestamp);
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[date.getMonth()] + " " + date.getDate();
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch (e) {
    return "";
  }
}

function renderHistoryList(history) {
  var listEl = document.getElementById("history-list");
  var emptyEl = document.getElementById("history-empty");

  if (!history || history.length === 0) {
    listEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }

  listEl.classList.remove("hidden");
  emptyEl.classList.add("hidden");

  while (listEl.firstChild) {
    listEl.removeChild(listEl.firstChild);
  }

  history.forEach(function (item) {
    var el = document.createElement("div");
    el.className = "history-item";
    el.setAttribute("data-id", item.id);

    var titleEl = document.createElement("div");
    titleEl.className = "history-item-title";
    titleEl.textContent = item.title || "Untitled";

    var metaEl = document.createElement("div");
    metaEl.className = "history-item-meta";

    var domainEl = document.createElement("span");
    domainEl.textContent = extractDomain(item.url);

    var modeEl = document.createElement("span");
    modeEl.className = "history-item-mode";
    modeEl.textContent = MODE_LABELS[item.mode] || "Summary";

    var timeEl = document.createElement("span");
    timeEl.textContent = formatRelativeTime(item.timestamp);

    metaEl.appendChild(domainEl);
    metaEl.appendChild(modeEl);
    metaEl.appendChild(timeEl);

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "history-item-delete";
    deleteBtn.title = "Delete";
    deleteBtn.textContent = "\u00d7";
    deleteBtn.setAttribute("data-id", item.id);

    el.appendChild(titleEl);
    el.appendChild(metaEl);
    el.appendChild(deleteBtn);

    el.addEventListener("click", function (e) {
      if (e.target.classList.contains("history-item-delete")) return;
      browser.runtime.sendMessage({ action: "LOAD_HISTORY_ITEM", id: item.id });
    });

    deleteBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      browser.runtime.sendMessage({ action: "DELETE_HISTORY_ITEM", id: item.id }).then(function (response) {
        if (response && response.ok) {
          renderHistoryList(response.history);
        }
      });
    });

    listEl.appendChild(el);
  });
}

function openHistory() {
  showView("history");
  browser.runtime.sendMessage({ action: "GET_HISTORY" }).then(function (response) {
    if (response && response.history) {
      renderHistoryList(response.history);
    }
  });
}

document.getElementById("btn-history").addEventListener("click", function () {
  if (currentView === "history") {
    browser.runtime.sendMessage({ action: "GET_STATE" }).then(function (response) {
      if (response && response.state) {
        renderState(response.state);
      }
    });
  } else {
    openHistory();
  }
});

document.getElementById("btn-clear-history").addEventListener("click", function () {
  browser.runtime.sendMessage({ action: "CLEAR_HISTORY" }).then(function () {
    renderHistoryList([]);
  });
});
