# ClaudeFox Privacy Policy

## What data ClaudeFox collects

ClaudeFox processes the following data **locally on your device**:

- **Page content**: When you click "Analyze this page," the text content of the current tab is extracted locally in your browser.
- **API key**: Your Anthropic API key is stored in Firefox's extension sync storage (`browser.storage.sync`), which is encrypted and tied to your Firefox account.
- **History**: Summaries of previously analyzed pages are stored in Firefox's local extension storage (`browser.storage.local`). This data never leaves your device.
- **Settings**: Your model preference and optional personality prompt are stored in `browser.storage.sync`.

## What data is sent externally

When you analyze a page or ask a follow-up question, ClaudeFox sends the following to the **Anthropic API** (`api.anthropic.com`):

- The extracted text content of the page (up to 50,000 characters)
- The page title and URL
- Your follow-up questions (if any)
- Your API key (for authentication)

**No data is sent anywhere else.** ClaudeFox does not use analytics, telemetry, tracking, or any third-party services other than the Anthropic API.

## What data is NOT collected

- ClaudeFox does not collect browsing history beyond pages you explicitly analyze
- ClaudeFox does not run on pages in the background
- ClaudeFox does not send data to the extension developer
- ClaudeFox does not use cookies or fingerprinting

## Data retention

- **History**: Stored locally, capped at 100 entries. You can clear it at any time from the sidebar.
- **API key**: Stored in Firefox sync storage until you remove it.
- **Session state**: The current conversation is stored locally and restored when Firefox restarts. Starting a new conversation clears it.

## Your control

- You can clear all history from the sidebar
- You can remove your API key from settings at any time
- Uninstalling ClaudeFox removes all stored data

## Third-party services

The only external service ClaudeFox communicates with is the **Anthropic API** (`https://api.anthropic.com`). Your use of this API is governed by [Anthropic's Terms of Service](https://www.anthropic.com/terms) and [Privacy Policy](https://www.anthropic.com/privacy).

## Contact

For questions about this privacy policy, open an issue at the project repository.
