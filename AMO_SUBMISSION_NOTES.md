# AMO Submission Reference

Copy-paste these when filling out the addons.mozilla.org submission form.

---

## Short Description (max 250 chars)

Summarize any web page with Claude AI. Choose analysis modes (Summary, ELI5, Deep Dive, Action Items), ask follow-up questions, and keep a searchable history. Bring your own Anthropic API key.

## Detailed Description

ClaudeFox adds a sidebar panel to Firefox that lets you analyze any web page using Anthropic's Claude AI.

**Features:**
- **5 analysis modes:** Summarize, Key Takeaways, ELI5, Deep Dive, Action Items
- **Streaming responses:** See Claude's response as it's generated, word by word
- **Follow-up chat:** Ask questions about the page content in a conversation thread
- **History:** Browse and revisit previous analyses
- **Keyboard shortcut:** Ctrl+Shift+S toggles the sidebar
- **Copy as markdown:** One-click copy of raw markdown output
- **Personality system:** Customize Claude's voice and perspective in settings
- **Right-click menu:** Summarize selected text or the full page from the context menu

**Requirements:**
- An Anthropic API key (get one at console.anthropic.com)
- API usage is billed to your Anthropic account

**Privacy:**
- Your API key is stored locally in Firefox's encrypted extension storage
- Page content is sent only to api.anthropic.com — nowhere else
- No analytics, telemetry, or tracking of any kind

---

## Permission Justifications

**activeTab**: Required to extract page content from the current tab when the user clicks "Analyze this page."

**storage**: Stores the user's API key, model preference, and personality setting (sync), plus analysis history (local).

**contextMenus**: Adds "Summarize selection with Claude" and "Summarize this page with Claude" to the right-click menu.

**scripting**: Required to inject the content extraction script into pages that need it.

**Host permission (api.anthropic.com)**: The extension sends page content to the Anthropic API for analysis. This is the only external service contacted.

**Content scripts (all_urls)**: The Readability.js content extraction library and content.js need to run on any page the user wants to analyze. They only activate when the user explicitly requests analysis.

---

## Third-Party Libraries

**Readability.js** (lib/Readability.js)
- Source: https://github.com/mozilla/readability
- License: Apache-2.0
- Purpose: Extracts article content from web pages (same library Firefox Reader View uses)
- Unmodified from upstream

**marked.js** (lib/marked.min.js)
- Source: https://github.com/markedjs/marked
- CDN: https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js
- License: MIT
- Purpose: Renders markdown in Claude's responses
- Minified but unmodified from upstream

---

## Category

"Search Tools" or "Privacy & Security" → probably best under **"Other"** or **"Search Tools"**

## Tags

ai, claude, summarize, summary, sidebar, readability, analysis

## License

MIT
