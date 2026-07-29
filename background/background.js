// Territorial.io Commander - Background Service Worker

const DEFAULT_SETTINGS = {
  botEnabled: false,
  autoExpand: false,
  autoAttack: false,
  clickSpeed: 10, // Clicks per second
  sliderPercentage: 25, // Default troop percentage slider
  humanJitter: true,
  hotkeysEnabled: true,
  strategy: 'expansionist' // 'expansionist', 'aggressive', 'defensive', 'custom'
};

// Initialize settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
    chrome.storage.local.set(stored);
    console.log('[Territorial Commander] Service Worker Initialized with settings:', stored);
  });
});

// Update badge status on icon when bot state changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.botEnabled) {
    const active = changes.botEnabled.newValue;
    chrome.action.setBadgeText({ text: active ? 'ON' : '' });
    chrome.action.setBadgeBackgroundColor({ color: active ? '#10B981' : '#6B7280' });
  }
});

// Message listener from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_SETTINGS') {
    chrome.storage.local.get(DEFAULT_SETTINGS, (data) => {
      sendResponse(data);
    });
    return true;
  }
  
  if (request.action === 'UPDATE_SETTINGS') {
    chrome.storage.local.set(request.settings, () => {
      sendResponse({ status: 'ok' });
    });
    return true;
  }
});
