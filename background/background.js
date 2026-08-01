// Territorial.io Commander - Background Service Worker v7.2
// Keep this file free of window/document and always clear lastError.

const DEFAULT_SETTINGS = {
  botEnabled: true,
  autoExpand: true,
  autoAttack: true,
  clickSpeed: 14,
  sliderPercentage: 30,
  humanJitter: true,
  hotkeysEnabled: true,
  strategy: 'expansionist'
};

function safeSetBadge(enabled) {
  try {
    chrome.action.setBadgeText({ text: enabled ? 'ON' : '' });
    chrome.action.setBadgeBackgroundColor({ color: enabled ? '#10B981' : '#6B7280' });
  } catch (_) {
    /* ignore */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
      void chrome.runtime.lastError;
      const merged = { ...DEFAULT_SETTINGS, ...(stored || {}) };
      chrome.storage.local.set(merged, () => {
        void chrome.runtime.lastError;
      });
      safeSetBadge(!!merged.botEnabled);
    });
  } catch (_) {
    /* ignore */
  }
});

// Also run on service worker wake so badge is correct
try {
  chrome.storage.local.get(['botEnabled'], (data) => {
    void chrome.runtime.lastError;
    safeSetBadge(!!(data && data.botEnabled));
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
        void chrome.runtime.lastError;
        sendResponse(data || DEFAULT_SETTINGS);
      });
      return true; // async
    }

    if (request.action === 'UPDATE_SETTINGS') {
      chrome.storage.local.set(request.settings || {}, () => {
        void chrome.runtime.lastError;
        sendResponse({ status: 'ok' });
      });
      return true;
    }

    sendResponse({ status: 'unknown' });
  } catch (_) {
    try { sendResponse({ status: 'error' }); } catch (__) { /* ignore */ }
  }
  return false;
});
