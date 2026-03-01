// background.js — ClaudeFox service worker / event page
// Owns all state, API calls, context menus, and message routing.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5";
const MAX_CONTENT_CHARS = 50000;
const MAX_HISTORY = 100;

// Approximate token budget — leave room for the response
// Haiku context is 200k, but we cap conservatively to avoid edge failures
const MAX_CONVERSATION_TOKENS = 150000;
const CHARS_PER_TOKEN = 4; // rough estimate

const PROMPT_MODES = {
  summarize:
    "You are a precise summarizer. Produce a concise summary of the provided web content. " +
    "Lead with a 2-3 sentence overview of the main point. " +
    "Then list the key takeaways as bullet points. " +
    "Be concise but thorough. Omit filler and repetition.",
  takeaways:
    "Extract the key takeaways from this content as a concise bulleted list. " +
    "Focus on facts, conclusions, and actionable insights. No preamble.",
  eli5:
    "Explain this content as if the reader is an intelligent 12-year-old. " +
    "Use simple language, analogies, and short sentences. Avoid jargon.",
  deep:
    "Provide a detailed technical analysis of this content. " +
    "Cover methodology, assumptions, evidence quality, counterarguments, and implications. Be thorough.",
  actions:
    "Extract all action items, tasks, deadlines, and next steps from this content. " +
    "Format as a checklist. If none exist, say so.",
};

const DEFAULT_SYSTEM_PROMPT = PROMPT_MODES.summarize;

// ─── State Machine ───────────────────────────────────────────────────────────

const state = {
  status: "idle", // 'idle' | 'extracting' | 'calling_api' | 'streaming' | 'complete' | 'error'
  summary: null,
  error: null,
  url: null,
  title: null,
  timestamp: null,
  truncated: false,
  mode: "summarize",
  messages: [],
  pageContent: null,
};

// Active AbortController for cancellable streaming
var activeAbortController = null;

function setState(updates) {
  Object.assign(state, updates);
  // Push state to any open sidebar — swallow errors if sidebar is closed
  browser.runtime.sendMessage({ action: "STATE_UPDATE", state: { ...state } }).catch(function () {});
  // Persist session to storage.local (skip transient streaming updates for perf)
  if (state.status === "complete" || state.status === "idle" || state.status === "error") {
    persistSession();
  }
}

function resetState() {
  activeAbortController = null;
  setState({
    status: "idle",
    summary: null,
    error: null,
    url: null,
    title: null,
    timestamp: null,
    truncated: false,
    mode: "summarize",
    messages: [],
    pageContent: null,
  });
}

// ─── Session Persistence ────────────────────────────────────────────────────

function persistSession() {
  // Save current conversation state so it survives Firefox restarts
  var session = {
    status: state.status,
    summary: state.summary,
    error: state.error,
    url: state.url,
    title: state.title,
    timestamp: state.timestamp,
    truncated: state.truncated,
    mode: state.mode,
    messages: state.messages,
    pageContent: state.pageContent,
  };
  browser.storage.local.set({ session: session }).catch(function () {});
}

async function restoreSession() {
  try {
    var result = await browser.storage.local.get("session");
    if (result.session && result.session.status === "complete") {
      Object.assign(state, result.session);
    }
    // Don't restore streaming/extracting/calling_api — those are stale
  } catch (e) {
    // First run, no session to restore
  }
}

// Restore session on background script load
restoreSession();

// ─── Settings ────────────────────────────────────────────────────────────────

async function getSettings() {
  const result = await browser.storage.sync.get(["apiKey", "model", "personality", "systemPrompt"]);
  return {
    apiKey: result.apiKey || "",
    model: result.model || DEFAULT_MODEL,
    personality: result.personality || result.systemPrompt || "",
  };
}

// ─── Token Estimation ───────────────────────────────────────────────────────

function estimateTokens(messages) {
  var totalChars = 0;
  for (var i = 0; i < messages.length; i++) {
    totalChars += messages[i].content.length;
  }
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

function trimConversation(messages) {
  // Always keep first message (page content) and last 2 exchanges
  // Trim middle messages if over budget
  var estimate = estimateTokens(messages);
  if (estimate <= MAX_CONVERSATION_TOKENS) return messages;

  // Keep first message + last 4 messages (2 exchanges)
  if (messages.length <= 5) return messages; // Can't trim further

  var trimmed = [messages[0]];
  // Add a note that context was trimmed
  trimmed.push({
    role: "user",
    content: "[Earlier conversation messages were trimmed to fit context limits]",
  });
  // Keep last 4 messages
  var tail = messages.slice(-4);
  for (var i = 0; i < tail.length; i++) {
    trimmed.push(tail[i]);
  }
  return trimmed;
}

// ─── Context Menus ───────────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(function () {
  browser.contextMenus.create({
    id: "claudefox-selection",
    title: "Summarize selection with Claude",
    contexts: ["selection"],
  });

  browser.contextMenus.create({
    id: "claudefox-page",
    title: "Summarize this page with Claude",
    contexts: ["page"],
  });
});

browser.contextMenus.onClicked.addListener(async function (info, tab) {
  if (info.menuItemId === "claudefox-selection" && info.selectionText) {
    await handleSummarize({
      content: info.selectionText,
      title: tab.title || "Selection",
      url: tab.url || "",
      source: "selection",
      mode: "summarize",
    });
  } else if (info.menuItemId === "claudefox-page") {
    await requestPageContentAndSummarize(tab, "summarize");
  }
});

// ─── Content Extraction ──────────────────────────────────────────────────────

function getPageTypeError(url) {
  if (!url) return "No page is open.";
  if (url.startsWith("about:")) return "Cannot read Firefox internal pages (about: pages).";
  if (url.startsWith("moz-extension:")) return "Cannot read other extension pages.";
  if (url.startsWith("chrome:")) return "Cannot read browser chrome pages.";
  if (url.startsWith("file:") && url.endsWith(".pdf")) return "Cannot read local PDF files. Try opening the PDF in a web viewer.";
  if (url.endsWith(".pdf") || url.includes("/pdf")) return "PDF support is limited. If this doesn't work, try selecting the text and using 'Summarize selection'.";
  if (url === "about:blank" || url === "about:newtab") return "Open a web page first, then try again.";
  return null;
}

async function requestPageContentAndSummarize(tab, mode) {
  // Check for known-unreadable page types
  var pageError = getPageTypeError(tab.url);
  if (pageError && (tab.url.startsWith("about:") || tab.url.startsWith("moz-extension:") || tab.url.startsWith("chrome:"))) {
    setState({ status: "error", error: pageError });
    return;
  }

  setState({
    status: "extracting",
    url: tab.url,
    title: tab.title,
    summary: null,
    error: null,
    truncated: false,
    messages: [],
    pageContent: null,
  });

  let response;
  try {
    response = await browser.tabs.sendMessage(tab.id, { action: "EXTRACT_CONTENT" });
  } catch (err) {
    // Provide a helpful error based on URL type
    var helpfulError = getPageTypeError(tab.url) || "Cannot read this page. The content script may not be loaded — try refreshing the page.";
    setState({ status: "error", error: helpfulError });
    return;
  }

  if (!response || !response.success) {
    setState({ status: "error", error: response?.error || "Content extraction failed. Try selecting text and using 'Summarize selection' instead." });
    return;
  }

  await handleSummarize({
    content: response.content,
    title: response.title || tab.title,
    url: response.url || tab.url,
    source: response.fallback ? "fallback" : "readability",
    mode: mode,
  });
}

// ─── SSE Stream Parser ───────────────────────────────────────────────────────

async function parseSSEStream(response, onDelta, onComplete, onError) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      var lines = buffer.split("\n");
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || !line.startsWith("data: ")) continue;

        var jsonStr = line.slice(6);
        if (jsonStr === "[DONE]") continue;

        try {
          var event = JSON.parse(jsonStr);

          if (event.type === "content_block_delta" && event.delta && event.delta.text) {
            onDelta(event.delta.text);
          } else if (event.type === "message_stop") {
            onComplete();
            return;
          } else if (event.type === "error") {
            onError(event.error && event.error.message || "Stream error");
            return;
          }
        } catch (e) {
          // Skip unparseable lines
        }
      }
    }
    onComplete();
  } catch (err) {
    if (err.name === "AbortError") {
      // User cancelled — not an error
      onComplete();
      return;
    }
    onError("Stream error: " + err.message);
  }
}

// ─── Build System Message ───────────────────────────────────────────────────

function buildSystemMessage(settings, activeMode) {
  const modePrompt = PROMPT_MODES[activeMode] || DEFAULT_SYSTEM_PROMPT;
  return settings.personality
    ? settings.personality + "\n\n---\n\nFor this request, your task is:\n" + modePrompt
    : modePrompt;
}

// ─── API Call ────────────────────────────────────────────────────────────────

async function handleSummarize({ content, title, url, source, mode }) {
  const settings = await getSettings();

  if (!settings.apiKey) {
    setState({ status: "error", error: "No API key configured. Open extension settings." });
    return;
  }

  var activeMode = mode || "summarize";

  // Truncate content if needed
  const truncated = content.length > MAX_CONTENT_CHARS;
  const trimmedContent = truncated ? content.slice(0, MAX_CONTENT_CHARS) : content;

  setState({ status: "calling_api", truncated: truncated, mode: activeMode });

  const systemMessage = buildSystemMessage(settings, activeMode);
  const userMessage = "Title: " + title + "\nURL: " + url + "\n\n---\n\n" + trimmedContent;

  // Create AbortController for cancellation
  activeAbortController = new AbortController();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      signal: activeAbortController.signal,
      body: JSON.stringify({
        model: settings.model || DEFAULT_MODEL,
        max_tokens: 4096,
        stream: true,
        system: systemMessage,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      let errorMsg = "API error " + response.status;
      try {
        const errorBody = await response.json();
        if (errorBody.error && errorBody.error.message) {
          errorMsg = errorBody.error.message;
        }
      } catch (e) {}
      activeAbortController = null;
      setState({ status: "error", error: errorMsg });
      return;
    }

    var streamedText = "";
    setState({ status: "streaming", summary: "" });

    await parseSSEStream(
      response,
      function onDelta(text) {
        streamedText += text;
        setState({ summary: streamedText });
      },
      function onComplete() {
        activeAbortController = null;
        var now = Date.now();
        var msgs = [
          { role: "user", content: userMessage },
          { role: "assistant", content: streamedText },
        ];
        setState({
          status: "complete",
          summary: streamedText,
          title: title,
          url: url,
          timestamp: now,
          messages: msgs,
          pageContent: trimmedContent,
        });
        saveToHistory({
          title: title,
          url: url,
          summary: streamedText,
          timestamp: now,
          truncated: truncated,
          mode: activeMode,
        });
      },
      function onError(errMsg) {
        activeAbortController = null;
        if (streamedText) {
          // Partial response — show what we got
          var now = Date.now();
          setState({
            status: "complete",
            summary: streamedText,
            title: title,
            url: url,
            timestamp: now,
          });
        } else {
          setState({ status: "error", error: errMsg });
        }
      }
    );
  } catch (err) {
    activeAbortController = null;
    if (err.name === "AbortError") {
      // User cancelled before streaming started — show what we have or go idle
      if (state.summary) {
        setState({ status: "complete" });
      } else {
        setState({ status: "idle" });
      }
      return;
    }
    setState({ status: "error", error: "Network error: " + err.message });
  }
}

// ─── Follow-up Chat ──────────────────────────────────────────────────────────

async function handleFollowUp(question) {
  const settings = await getSettings();

  if (!settings.apiKey) {
    setState({ status: "error", error: "No API key configured." });
    return;
  }

  if (!state.messages || state.messages.length === 0) {
    setState({ status: "error", error: "No conversation to follow up on." });
    return;
  }

  // Append user question
  var msgs = state.messages.slice();
  msgs.push({ role: "user", content: question });

  // Check token budget and trim if needed
  var tokenEstimate = estimateTokens(msgs);
  if (tokenEstimate > MAX_CONVERSATION_TOKENS) {
    msgs = trimConversation(msgs);
    tokenEstimate = estimateTokens(msgs);
    // If still over budget after trimming, warn user
    if (tokenEstimate > MAX_CONVERSATION_TOKENS) {
      setState({
        status: "error",
        error: "Conversation is too long. Start a new conversation to continue.",
      });
      return;
    }
  }

  var activeMode = state.mode || "summarize";
  const systemMessage = buildSystemMessage(settings, activeMode);

  // Show user message immediately, then "thinking" state
  setState({ status: "streaming", summary: "", messages: msgs });

  // Create AbortController for cancellation
  activeAbortController = new AbortController();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      signal: activeAbortController.signal,
      body: JSON.stringify({
        model: settings.model || DEFAULT_MODEL,
        max_tokens: 4096,
        stream: true,
        system: systemMessage,
        messages: msgs,
      }),
    });

    if (!response.ok) {
      let errorMsg = "API error " + response.status;
      try {
        const errorBody = await response.json();
        if (errorBody.error && errorBody.error.message) {
          errorMsg = errorBody.error.message;
        }
      } catch (e) {}
      activeAbortController = null;
      // Revert to complete with previous messages (remove the user question that failed)
      msgs.pop();
      setState({ status: "complete", messages: msgs, summary: msgs[msgs.length - 1].content });
      return;
    }

    var streamedText = "";

    await parseSSEStream(
      response,
      function onDelta(text) {
        streamedText += text;
        setState({ summary: streamedText });
      },
      function onComplete() {
        activeAbortController = null;
        msgs.push({ role: "assistant", content: streamedText });
        setState({
          status: "complete",
          summary: streamedText,
          messages: msgs,
        });
      },
      function onError(errMsg) {
        activeAbortController = null;
        if (streamedText) {
          msgs.push({ role: "assistant", content: streamedText });
          setState({ status: "complete", summary: streamedText, messages: msgs });
        } else {
          msgs.pop();
          setState({ status: "complete", messages: msgs, summary: msgs[msgs.length - 1].content });
        }
      }
    );
  } catch (err) {
    activeAbortController = null;
    if (err.name === "AbortError") {
      // User cancelled — keep what we have
      if (state.summary) {
        msgs.push({ role: "assistant", content: state.summary });
        setState({ status: "complete", messages: msgs, summary: state.summary });
      } else {
        msgs.pop();
        setState({ status: "complete", messages: msgs, summary: msgs[msgs.length - 1].content });
      }
      return;
    }
    setState({ status: "error", error: "Network error: " + err.message });
  }
}

// ─── Cancel Streaming ───────────────────────────────────────────────────────

function cancelStream() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

// ─── History Persistence ─────────────────────────────────────────────────────

async function saveToHistory(entry) {
  const result = await browser.storage.local.get("history");
  var history = result.history || [];

  history.unshift({
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
    title: entry.title || "",
    url: entry.url || "",
    summary: entry.summary || "",
    timestamp: entry.timestamp || Date.now(),
    truncated: entry.truncated || false,
    mode: entry.mode || "summarize",
  });

  // Cap at MAX_HISTORY
  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }

  await browser.storage.local.set({ history: history });
}

// ─── Toolbar Icon Click → Toggle Sidebar ─────────────────────────────────────

browser.action.onClicked.addListener(function () {
  browser.sidebarAction.toggle();
});

// ─── Message Listener (sidebar communication) ────────────────────────────────

browser.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "GET_STATE") {
    sendResponse({ state: { ...state } });
    return false; // Synchronous
  }

  if (message.action === "SUMMARIZE_CURRENT_TAB") {
    var mode = message.mode || "summarize";
    browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      if (tabs[0]) {
        requestPageContentAndSummarize(tabs[0], mode);
      }
    });
    sendResponse({ received: true });
    return false;
  }

  if (message.action === "FOLLOW_UP") {
    handleFollowUp(message.question);
    sendResponse({ received: true });
    return false;
  }

  if (message.action === "CANCEL_STREAM") {
    cancelStream();
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === "SUMMARIZE_SELECTION") {
    browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      if (tabs[0] && message.selectionText) {
        handleSummarize({
          content: message.selectionText,
          title: tabs[0].title || "Selection",
          url: tabs[0].url || "",
          source: "selection",
        });
      }
    });
    sendResponse({ received: true });
    return false;
  }

  if (message.action === "CLEAR_STATE") {
    resetState();
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === "GET_HISTORY") {
    browser.storage.local.get("history").then(function (result) {
      sendResponse({ history: result.history || [] });
    });
    return true; // Async
  }

  if (message.action === "DELETE_HISTORY_ITEM") {
    browser.storage.local.get("history").then(function (result) {
      var history = result.history || [];
      history = history.filter(function (item) {
        return item.id !== message.id;
      });
      browser.storage.local.set({ history: history }).then(function () {
        sendResponse({ ok: true, history: history });
      });
    });
    return true; // Async
  }

  if (message.action === "CLEAR_HISTORY") {
    browser.storage.local.set({ history: [] }).then(function () {
      sendResponse({ ok: true });
    });
    return true; // Async
  }

  if (message.action === "LOAD_HISTORY_ITEM") {
    browser.storage.local.get("history").then(function (result) {
      var history = result.history || [];
      var item = null;
      for (var i = 0; i < history.length; i++) {
        if (history[i].id === message.id) {
          item = history[i];
          break;
        }
      }
      if (item) {
        setState({
          status: "complete",
          summary: item.summary,
          title: item.title,
          url: item.url,
          timestamp: item.timestamp,
          truncated: item.truncated || false,
        });
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "Item not found" });
      }
    });
    return true; // Async
  }

  return false;
});
