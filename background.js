// Enforce single tab per window policy

// Track tabs we're currently processing to avoid race conditions
const processingTabs = new Set();
const newTabsWaitingForUrl = new Map(); // Maps tab ID to existing tab ID

// Listen for new tabs being created
chrome.tabs.onCreated.addListener(async (tab) => {
  console.log('Tab created:', { id: tab.id, url: tab.url, pendingUrl: tab.pendingUrl, openerTabId: tab.openerTabId });
  if (!tab.windowId || processingTabs.has(tab.id)) return;

  processingTabs.add(tab.id);

  // Get all tabs in the window
  const tabs = await chrome.tabs.query({ windowId: tab.windowId });

  // If there are multiple tabs, handle based on whether it has a URL
  if (tabs.length > 1) {
    // Find the tab that existed before (could be the opener or just any other tab)
    const existingTab = tab.openerTabId
      ? tabs.find(t => t.id === tab.openerTabId)
      : tabs.find(t => t.id !== tab.id);

    // Check if this is an empty new tab (Ctrl+T or + button)
    // Note: Even manually created tabs can have openerTabId set, so we check the URL instead
    const isEmptyNewTab = (tab.pendingUrl === 'chrome://newtab/' || tab.url === 'chrome://newtab/' || !tab.url) && !tab.pendingUrl?.startsWith('http');

    // Check if the new tab is a browser internal page (except newtab)
    // Covers chrome://, edge://, brave://, etc.
    const isBrowserInternalPage = ((tab.pendingUrl && /^[a-z]+:\/\//.test(tab.pendingUrl) && !tab.pendingUrl.startsWith('http')) ||
                                    (tab.url && /^[a-z]+:\/\//.test(tab.url) && !tab.url.startsWith('http'))) &&
                                   tab.pendingUrl !== 'chrome://newtab/' && tab.url !== 'chrome://newtab/';

    if (isBrowserInternalPage && existingTab) {
      // Browser internal pages: navigate the existing tab to this page and close the new tab
      const urlToOpen = tab.pendingUrl || tab.url;
      await chrome.tabs.update(existingTab.id, { url: urlToOpen, active: true });
      await chrome.tabs.remove(tab.id);
      processingTabs.delete(tab.id);
    } else if (isEmptyNewTab && existingTab) {
      // Wait for URL to be set, then redirect opener and close this tab
      newTabsWaitingForUrl.set(tab.id, existingTab.id);
      processingTabs.delete(tab.id);
    } else if (existingTab) {
      // For all other cases, wait for the tab to fully load its URL
      // This handles cases like Google Search where the URL is set via JavaScript
      newTabsWaitingForUrl.set(tab.id, existingTab.id);
      processingTabs.delete(tab.id);
    } else {
      processingTabs.delete(tab.id);
    }
  } else {
    processingTabs.delete(tab.id);
  }
});

// Listen for tab updates to catch URLs that load after tab creation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  console.log('Tab updated:', { id: tabId, changeInfo, url: tab.url });

  // Check if this is a tab we're waiting for a URL on
  if (newTabsWaitingForUrl.has(tabId) && changeInfo.url) {
    const existingTabId = newTabsWaitingForUrl.get(tabId);
    newTabsWaitingForUrl.delete(tabId);

    // Check if this is a "real" URL that we should navigate to
    // If it's just chrome://newtab/, about:blank, or other empty-ish URLs,
    // just close the new tab without navigating (to preserve history)
    const isRealUrl = changeInfo.url.startsWith('http') ||
                      (changeInfo.url.match(/^[a-z]+:\/\//) &&
                       changeInfo.url !== 'chrome://newtab/' &&
                       changeInfo.url !== 'about:blank');

    try {
      if (isRealUrl) {
        // Navigate the existing tab to the new URL
        await chrome.tabs.update(existingTabId, { url: changeInfo.url, active: true });
      } else {
        // Just focus the existing tab without navigating
        await chrome.tabs.update(existingTabId, { active: true });
      }
      // Close the new tab in both cases
      await chrome.tabs.remove(tabId);
    } catch (error) {
      // Existing tab might be closed, in which case just allow the new tab
    }
  }

  // Handle the case where the opener tab navigates (e.g., Google Search)
  // and leaves an empty new tab behind
  if (changeInfo.url) {
    const tabs = await chrome.tabs.query({ windowId: tab.windowId });
    // Find if there's an empty tab that was opened by this tab
    const emptyTab = tabs.find(t =>
      t.id !== tabId &&
      t.openerTabId === tabId &&
      (!t.url || t.url === 'chrome://newtab/' || t.url === 'about:blank')
    );

    if (emptyTab) {
      console.log('Closing empty tab created by opener:', emptyTab.id);
      newTabsWaitingForUrl.delete(emptyTab.id);
      await chrome.tabs.remove(emptyTab.id);
    }
  }
});

// Handle the case where a window is created with multiple tabs
chrome.windows.onCreated.addListener(async (window) => {
  const tabs = await chrome.tabs.query({ windowId: window.id });

  // Keep only the first tab
  if (tabs.length > 1) {
    const tabsToClose = tabs.slice(1).map(t => t.id);
    await chrome.tabs.remove(tabsToClose);
  }
});