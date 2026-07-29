// Territorial.io Auto Commander - Popup Controller

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
    botEnabled: false,
    autoExpand: false,
    autoAttack: false,
    clickSpeed: 10,
    sliderPercentage: 25,
    humanJitter: true,
    strategy: 'expansionist'
  };

  // Load existing settings
  chrome.storage.local.get(currentSettings, (stored) => {
    currentSettings = { ...currentSettings, ...stored };
    updateUIFromSettings();
  });

  function updateUIFromSettings() {
    toggleBot.checked = currentSettings.botEnabled;
    toggleExpand.checked = currentSettings.autoExpand;
    toggleAttack.checked = currentSettings.autoAttack;
    toggleJitter.checked = currentSettings.humanJitter;

    inputCPS.value = currentSettings.clickSpeed;
    inputRatio.value = currentSettings.sliderPercentage;

    valCPS.textContent = `${currentSettings.clickSpeed} CPS`;
    valRatio.textContent = `${currentSettings.sliderPercentage}%`;

    const active = currentSettings.botEnabled || currentSettings.autoExpand || currentSettings.autoAttack;
    if (active) {
      statusBadge.classList.add('active');
      statusText.textContent = 'ACTIVE';
    } else {
      statusBadge.classList.remove('active');
      statusText.textContent = 'OFF';
    }

    strategyBtns.forEach(btn => {
      if (btn.dataset.strategy === currentSettings.strategy) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function saveAndNotify() {
    chrome.storage.local.set(currentSettings, () => {
      updateUIFromSettings();
      // Notify active tab content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'STATE_CHANGED',
            settings: currentSettings
          }).catch(() => {
            // Content script might not be injected if not on territorial.io
          });
        }
      });
    });
  }

  // Bind Event Listeners
  toggleBot.addEventListener('change', (e) => {
    currentSettings.botEnabled = e.target.checked;
    saveAndNotify();
  });

  toggleExpand.addEventListener('change', (e) => {
    currentSettings.autoExpand = e.target.checked;
    saveAndNotify();
  });

  toggleAttack.addEventListener('change', (e) => {
    currentSettings.autoAttack = e.target.checked;
    saveAndNotify();
  });

  toggleJitter.addEventListener('change', (e) => {
    currentSettings.humanJitter = e.target.checked;
    saveAndNotify();
  });

  inputCPS.addEventListener('input', (e) => {
    currentSettings.clickSpeed = parseInt(e.target.value, 10);
    valCPS.textContent = `${currentSettings.clickSpeed} CPS`;
    saveAndNotify();
  });

  inputRatio.addEventListener('input', (e) => {
    currentSettings.sliderPercentage = parseInt(e.target.value, 10);
    valRatio.textContent = `${currentSettings.sliderPercentage}%`;
    saveAndNotify();
  });

  strategyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentSettings.strategy = btn.dataset.strategy;
      saveAndNotify();
    });
  });
});
