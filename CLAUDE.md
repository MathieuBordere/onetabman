# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OneTabMan is a Chrome/Chromium browser extension that enforces a single tab per browser window policy. When users attempt to open a second tab, the extension automatically navigates the existing tab to the new URL and closes the duplicate tab.

## Architecture

The extension is built using Manifest V3 and consists of a single service worker (`background.js`) that monitors tab creation and updates.

### Core Components

**Service Worker (`background.js`)**
- Main entry point that runs in the background
- Uses three event listeners: `tabs.onCreated`, `tabs.onUpdated`, and `windows.onCreated`
- Maintains two internal data structures:
  - `processingTabs`: Set to track tabs currently being processed (prevents race conditions)
  - `newTabsWaitingForUrl`: Map that tracks tabs created without URLs, waiting for URL updates

### Tab Management Logic

When a second tab is created in a window, the extension:

1. **Browser internal pages** (`chrome://`, `edge://`, etc.) - Handled immediately: existing tab navigates to this page, new tab closed
2. **All other tabs** (including empty tabs and tabs with URLs) - Added to `newTabsWaitingForUrl` to wait for the tab to fully load before processing

The `tabs.onUpdated` listener handles deferred tab processing:
- When a tracked tab receives a URL, it checks if it's a "real URL" (http/https or browser internal pages)
- If it's a real URL: navigates the existing tab to it and closes the new tab
- If it's an empty URL (`chrome://newtab/`, `about:blank`): focuses the existing tab without navigating, then closes the new tab
- Additionally handles the case where an opener tab navigates (e.g., Google Search) and leaves an empty new tab behind

## Development

This is a browser extension with no build step. To test:

1. Open `chrome://extensions/` (or your Chromium browser's equivalent)
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. The extension will be active immediately

To reload changes:
- Click the refresh icon on the extension card in `chrome://extensions/`

## File Structure

- `manifest.json` - Extension manifest (Manifest V3)
- `background.js` - Service worker with all tab management logic
- `onetabman.png` - Extension icon