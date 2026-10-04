// Territorial.io Auto Commander - Popup Controller (error-safe)

document.addEventListener('DOMContentLoaded', () => {
  const config = window.TIOConfig;
  const toggleBot = document.getElementById('toggle-bot');
  const toggleExpand = document.getElementById('toggle-expand');
  const toggleAttack = document.getElementById('toggle-attack');
  const toggleFallback = document.getElementById('toggle-fallback');

  const inputCPS = document.getElementById('input-cps');
  const inputRatio = document.getElementById('input-ratio');
  const valCPS = document.getElementById('val-cps');
  const valRatio = document.getElementById('val-ratio');

  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const versionLabel = document.getElementById('version-label');
  const versionDetails = document.getElementById('version-details');
  const strategyBtns = document.querySelectorAll('.strategy-btn');
  const btnEngineV2 = document.getElementById('btn-engine-v2');
  const btnEngineV1 = document.getElementById('btn-engine-v1');

  // Telemetry DOM elements
  const pillConn = document.getElementById('pill-conn');
  const teleState = document.getElementById('tele-state');
  const teleKernel = document.getElementById('tele-kernel');
  const teleEngine = document.getElementById('tele-engine');
  const teleBalance = document.getElementById('tele-balance');
  const teleCap = document.getElementById('tele-cap');
  const telePolicy = document.getElementById('tele-policy');

  const headerUpdateLabel = document.getElementById('header-update-label');

  let currentSettings = config.normalizeSettings(config.DEFAULT_SETTINGS);
  if (versionLabel) versionLabel.textContent = config.buildVersionLabel ? config.buildVersionLabel() : `v${config.VERSION}`;
  if (versionDetails) versionDetails.textContent = config.buildEngineDetails ? config.buildEngineDetails() : `${config.ENGINE_VERSION} Math · Updated ${config.ENGINE_UPDATED_AT}`;
  if (headerUpdateLabel && config.ENGINE_UPDATED_AT) headerUpdateLabel.textContent = `Updated: ${config.ENGINE_UPDATED_AT}`;

  function updateTelemetry(st) {
    if (!st) {
      if (pillConn) {
        pillConn.textContent = 'Disconnected';
        pillConn.className = 'pill-badge';
      }
      if (teleState) teleState.textContent = 'Tab Inactive';
      if (teleBalance) teleBalance.textContent = '—';
      if (teleCap) teleCap.textContent = '—';
      if (telePolicy) telePolicy.textContent = 'Open territorial.io to connect';
      return;
    }

    if (pillConn) {
      if (st.inGame) {
        pillConn.textContent = 'Live Match';
        pillConn.className = 'pill-badge active';
      } else if (st.armed) {
        pillConn.textContent = 'Spawn Ready';
        pillConn.className = 'pill-badge waiting';
      } else {
        pillConn.textContent = 'Connected';
        pillConn.className = 'pill-badge';
      }
    }

    if (teleState) {
      if (st.inGame) {
        teleState.textContent = st.botEnabled ? 'Active Playing' : 'Paused (Press Z)';
      } else if (st.armed) {
        teleState.textContent = 'Awaiting Spawn';
      } else {
        teleState.textContent = 'Lobby / Standby';
      }
    }

    if (teleEngine) {
      teleEngine.textContent = st.internalReady ? 'INTERNAL (bB)' : (st.path || 'CLICK-VH');
    }

    if (teleKernel) {
      teleKernel.textContent = st.engineVersion === 1 ? 'V1 Heuristic' : `${config.ENGINE_VERSION} Math`;
    }

    if (teleBalance) {
      teleBalance.textContent = st.balance > 0 ? Number(st.balance).toLocaleString() : '—';
    }

    if (teleCap) {
      teleCap.textContent = st.softCap > 0 ? Number(st.softCap).toLocaleString() : '—';
    }

    if (telePolicy) {
      if (!st.inGame && !st.armed) {
        telePolicy.textContent = 'Waiting to join match...';
      } else if (st.armed && !st.inGame) {
        telePolicy.textContent = 'Ready — click map to spawn!';
      } else {
        telePolicy.textContent = st.policy || 'Active play';
      }
    }
  }

  function queryLiveStatus() {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        void chrome.runtime.lastError;
        if (!tabs || !tabs[0] || !tabs[0].id) {
          updateTelemetry(null);
          return;
        }
        try {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_STATUS' }, (resp) => {
            void chrome.runtime.lastError;
            if (resp && resp.success && resp.status) {
              updateTelemetry(resp.status);
            } else {
              updateTelemetry(null);
            }
          });
        } catch (_) {
          updateTelemetry(null);
        }
      });
    } catch (_) {
      updateTelemetry(null);
    }
  }

  // Load existing settings (guard missing chrome APIs)
  try {
    chrome.storage.local.get(currentSettings, (stored) => {
      // Consume lastError so Chrome does not show "Errors" on extension page
      void chrome.runtime.lastError;
      currentSettings = config.normalizeSettings({ ...currentSettings, ...(stored || {}) });
      updateUIFromSettings();
    });
  } catch (e) {
    updateUIFromSettings();
  }

  function updateUIFromSettings() {
    if (toggleBot) toggleBot.checked = !!currentSettings.botEnabled;
    if (toggleExpand) toggleExpand.checked = !!currentSettings.autoExpand;
    if (toggleAttack) toggleAttack.checked = !!currentSettings.autoAttack;
    if (toggleFallback) toggleFallback.checked = !!currentSettings.allowVisionFallback;

    if (inputCPS) inputCPS.value = currentSettings.clickSpeed;
    if (inputRatio) inputRatio.value = currentSettings.sliderPercentage;

    if (valCPS) valCPS.textContent = `${currentSettings.clickSpeed} /s`;
    if (valRatio) valRatio.textContent = currentSettings.sliderPercentage > 0
      ? `${currentSettings.sliderPercentage}%`
      : 'AUTO';

    const isV2 = (Number(currentSettings.engineVersion) || 2) === 2;
    if (btnEngineV2) {
      if (isV2) btnEngineV2.classList.add('active');
      else btnEngineV2.classList.remove('active');
    }
    if (btnEngineV1) {
      if (!isV2) btnEngineV1.classList.add('active');
      else btnEngineV1.classList.remove('active');
    }

    const active = currentSettings.botEnabled;
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
    currentSettings = config.normalizeSettings(currentSettings);
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
  if (toggleFallback) {
    toggleFallback.addEventListener('change', (e) => {
      currentSettings.allowVisionFallback = e.target.checked;
      saveAndNotify();
    });
  }
  if (inputCPS) {
    inputCPS.addEventListener('input', (e) => {
      currentSettings.clickSpeed = parseInt(e.target.value, 10) || config.DEFAULT_SETTINGS.clickSpeed;
      if (valCPS) valCPS.textContent = `${currentSettings.clickSpeed} /s`;
      saveAndNotify();
    });
  }
  if (inputRatio) {
    inputRatio.addEventListener('input', (e) => {
      const parsed = parseInt(e.target.value, 10);
      currentSettings.sliderPercentage = Number.isFinite(parsed) ? parsed : 0;
      if (valRatio) valRatio.textContent = currentSettings.sliderPercentage > 0
        ? `${currentSettings.sliderPercentage}%`
        : 'AUTO';
      saveAndNotify();
    });
  }

  strategyBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSettings.strategy = btn.dataset.strategy;
      saveAndNotify();
    });
  });

  if (btnEngineV2) {
    btnEngineV2.addEventListener('click', () => {
      currentSettings.engineVersion = 2;
      saveAndNotify();
    });
  }

  if (btnEngineV1) {
    btnEngineV1.addEventListener('click', () => {
      currentSettings.engineVersion = 1;
      saveAndNotify();
    });
  }

  // Query live game telemetry immediately and poll every second while popup is open
  queryLiveStatus();
  const pollTimer = setInterval(queryLiveStatus, 1000);
  window.addEventListener('unload', () => clearInterval(pollTimer));
});
