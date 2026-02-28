# ClaudeFox

A Firefox sidebar extension that lets you analyze any web page with Claude AI. Summarize articles, extract key takeaways, get ELI5 explanations, deep-dive into technical content, or pull out action items — then ask follow-up questions in a conversation thread.

Bring your own Anthropic API key. No telemetry, no tracking, no data collection.

![Firefox](https://img.shields.io/badge/Firefox-MV3-FF7139?logo=firefox-browser&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **5 analysis modes** — Summarize, Key Takeaways, ELI5, Deep Dive, Action Items
- **Streaming responses** — See Claude's response as it's generated
- **Follow-up chat** — Ask questions about the page in a conversation thread
- **History** — Browse and revisit previous analyses
- **Personality system** — Customize Claude's voice and perspective (like CLAUDE.md for your browser)
- **Copy as markdown** — One-click copy of raw markdown output
- **Keyboard shortcut** — `Ctrl+Shift+S` toggles the sidebar
- **Context menu** — Right-click to summarize selected text or the full page
- **Session persistence** — Your conversation survives Firefox restarts

## Install

### From Firefox Add-ons (coming soon)

<!-- Link will go here once published -->

### From source

1. Clone this repo
2. Open `about:debugging#/runtime/this-firefox` in Firefox
3. Click "Load Temporary Add-on"
4. Select `manifest.json` from the cloned directory
5. Open the sidebar with `Ctrl+Shift+S` or click the toolbar icon

## Setup

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/)
2. Click the gear icon in the ClaudeFox sidebar (or go to extension settings)
3. Paste your API key and save
4. Open any web page and click "Analyze this page"

API usage is billed to your Anthropic account. ClaudeFox defaults to **Haiku 4.5** (fast and cheap). You can switch to Sonnet in settings.

## How it works

```
[Web Page] → content.js (Readability extraction) → background.js (state + API) → sidebar.js (render)
```

- **content.js** extracts page text using Mozilla's [Readability.js](https://github.com/mozilla/readability) (the same library behind Firefox Reader View)
- **background.js** owns all state, streams responses from the Anthropic API, manages conversation history
- **sidebar/** is a stateless view that renders whatever background.js tells it to

No build step. No dependencies to install. No bundler. Just browser JS.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the current page when you click "Analyze" |
| `storage` | Store your API key, settings, and history locally |
| `contextMenus` | Right-click "Summarize with Claude" menu items |
| `scripting` | Inject content extraction into pages |
| `api.anthropic.com` | Send page content to Claude for analysis |
| `all_urls` (content script) | Readability.js needs to run on whatever page you want to analyze |

## Privacy

- Your API key is stored in Firefox's encrypted extension storage
- Page content is sent **only** to `api.anthropic.com` — nowhere else
- History is stored locally and never transmitted
- No analytics, telemetry, or tracking of any kind
- See [PRIVACY.md](PRIVACY.md) for the full policy

## Personality

The Personality field in settings wraps every analysis mode — think of it like CLAUDE.md for your browser. Set a tone, perspective, or character, and it colors all responses while the mode prompt (Summarize, ELI5, etc.) still controls the task.

Example:
> You are a sharp, slightly sardonic analyst who values clarity over politeness. Call out weak arguments directly. Use dry wit sparingly.

## Third-party libraries

- [Readability.js](https://github.com/mozilla/readability) (Apache-2.0) — Content extraction
- [marked.js](https://github.com/markedjs/marked) (MIT) — Markdown rendering
- [DOMPurify](https://github.com/cure53/DOMPurify) (Apache-2.0 / MPL-2.0) — HTML sanitization

## License

MIT
