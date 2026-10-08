// Territorial.io Commander - Background Service Worker v10
// Keep this file free of window/document and always clear lastError.

importScripts('../shared/config.js');

const DEFAULT_SETTINGS = self.TIOConfig.DEFAULT_SETTINGS;

function safeSetBadge(enabled) {
  try {
    chrome.action.setBadgeText({ text: enabled == null ? '?' : enabled ? 'ON' : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#455975' });
    chrome.action.setTitle({ title: enabled == null ? 'Commander preference unavailable. Open popup to retry.' : enabled ? 'Commander enabled (preference only). Open popup for live status.' : 'Commander disabled. Open popup to enable.' });
  } catch (_) {
    /* ignore */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.storage.local.get(null, (stored) => {
      const readError = chrome.runtime.lastError;
      if (readError) { safeSetBadge(null); return; }
      const merged = self.TIOConfig.migrateSettings(stored || {});
      chrome.storage.local.set(merged, () => {
        const error = chrome.runtime.lastError;
        safeSetBadge(error ? null : !!merged.botEnabled);
      });
    });
  } catch (_) {
    /* ignore */
  }
});

// Also run on service worker wake so badge is correct
try {
  chrome.storage.local.get(['botEnabled'], (data) => {
    const error = chrome.runtime.lastError;
    safeSetBadge(error ? null : self.TIOConfig.normalizeSettings(data).botEnabled);
  });
} catch (_) {
  /* ignore */
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.botEnabled) {
    safeSetBadge(!!changes.botEnabled.newValue);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (!request || !request.action) {
      sendResponse({ status: 'bad_request' });
      return false;
    }

    if (request.action === 'GET_SETTINGS') {
      chrome.storage.local.get(DEFAULT_SETTINGS, (data) => {
        const error = chrome.runtime.lastError;
        sendResponse(error ? { status: 'error', message: error.message } : self.TIOConfig.normalizeSettings(data || DEFAULT_SETTINGS));
      });
      return true; // async
    }

    if (request.action === 'UPDATE_SETTINGS') {
      chrome.storage.local.set(self.TIOConfig.normalizeSettings(request.settings || {}), () => {
        const error = chrome.runtime.lastError;
        sendResponse(error ? { status: 'error', message: error.message } : { status: 'ok' });
      });
      return true;
    }

    sendResponse({ status: 'unknown' });
  } catch (_) {
    try { sendResponse({ status: 'error' }); } catch (__) { /* ignore */ }
  }
  return false;
});
