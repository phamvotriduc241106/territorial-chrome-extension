// Territorial.io Auto Commander - Popup Controller (error-safe)

document.addEventListener('DOMContentLoaded', () => {
  const toggleBot = document.getElementById('toggle-bot');
  const toggleExpand = document.getElementById('toggle-expand');
  const toggleAttack = document.getElementById('toggle-attack');
  const toggleJitter = document.getElementById('toggle-jitter');

  const inputCPS = document.getElementById('input-cps');
  const inputRatio = document.getElementById('input-ratio');
  const valCPS = document.getElementById('val-cps');
  const valRatio = document.getElementById('val-ratio');

  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const strategyBtns = document.querySelectorAll('.strategy-btn');

  let currentSettings = {
    botEnabled: true,
    autoExpand: true,
    autoAttack: true,
    clickSpeed: 14,
    sliderPercentage: 30,
    humanJitter: true,
    hotkeysEnabled: true,
    strategy: 'expansionist'
  };

  // Load existing settings (guard missing chrome APIs)
  try {
    chrome.storage.local.get(currentSettings, (stored) => {
      // Consume lastError so Chrome does not show "Errors" on extension page
      void chrome.runtime.lastError;
      currentSettings = { ...currentSettings, ...(stored || {}) };
      updateUIFromSettings();
    });
  } catch (e) {
    updateUIFromSettings();
  }

  function updateUIFromSettings() {
    if (toggleBot) toggleBot.checked = !!currentSettings.botEnabled;
    if (toggleExpand) toggleExpand.checked = !!currentSettings.autoExpand;
    if (toggleAttack) toggleAttack.checked = !!currentSettings.autoAttack;
    if (toggleJitter) toggleJitter.checked = !!currentSettings.humanJitter;

    if (inputCPS) inputCPS.value = currentSettings.clickSpeed;
    if (inputRatio) inputRatio.value = currentSettings.sliderPercentage;

    if (valCPS) valCPS.textContent = `${currentSettings.clickSpeed} CPS`;
    if (valRatio) valRatio.textContent = `${currentSettings.sliderPercentage}%`;

    const active = currentSettings.botEnabled || currentSettings.autoExpand || currentSettings.autoAttack;
    if (statusBadge && statusText) {
      if (active) {
        statusBadge.classList.add('active');
        statusText.textContent = 'ACTIVE';
      } else {
        statusBadge.classList.remove('active');
        statusText.textContent = 'OFF';
      }
    }

    strategyBtns.forEach((btn) => {
      if (btn.dataset.strategy === currentSettings.strategy) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function notifyContentScript() {
    // Safe messaging: never leave uncaught lastError (common chrome://extensions "Errors")
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        void chrome.runtime.lastError;
        if (!tabs || !tabs[0] || !tabs[0].id) return;
        try {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: 'STATE_CHANGED', settings: currentSettings },
            () => {
              // Expected when tab is not territorial.io or content script not injected
              void chrome.runtime.lastError;
            }
          );
        } catch (_) {
          /* ignore */
        }
      });
    } catch (_) {
      /* ignore */
    }
  }

  function saveAndNotify() {
    try {
      chrome.storage.local.set(currentSettings, () => {
        void chrome.runtime.lastError;
        updateUIFromSettings();
        notifyContentScript();
      });
    } catch (_) {
      updateUIFromSettings();
    }
  }

  if (toggleBot) {
    toggleBot.addEventListener('change', (e) => {
      currentSettings.botEnabled = e.target.checked;
      saveAndNotify();
    });
  }
  if (toggleExpand) {
    toggleExpand.addEventListener('change', (e) => {
      currentSettings.autoExpand = e.target.checked;
      saveAndNotify();
    });
  }
  if (toggleAttack) {
    toggleAttack.addEventListener('change', (e) => {
      currentSettings.autoAttack = e.target.checked;
      saveAndNotify();
    });
  }
  if (toggleJitter) {
    toggleJitter.addEventListener('change', (e) => {
      currentSettings.humanJitter = e.target.checked;
      saveAndNotify();
    });
  }
  if (inputCPS) {
    inputCPS.addEventListener('input', (e) => {
      currentSettings.clickSpeed = parseInt(e.target.value, 10) || 10;
      if (valCPS) valCPS.textContent = `${currentSettings.clickSpeed} CPS`;
      saveAndNotify();
    });
  }
  if (inputRatio) {
    inputRatio.addEventListener('input', (e) => {
      currentSettings.sliderPercentage = parseInt(e.target.value, 10) || 25;
      if (valRatio) valRatio.textContent = `${currentSettings.sliderPercentage}%`;
      saveAndNotify();
    });
  }

  strategyBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSettings.strategy = btn.dataset.strategy;
      saveAndNotify();
    });
  });
});
