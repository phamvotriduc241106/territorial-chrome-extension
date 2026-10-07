/**
 * Shared extension contract. Loaded by the service worker, popup, isolated
 * content world, and MAIN world before any engine code.
 */
(function (root) {
  'use strict';

  if (root.TIOConfig) return;

  const VERSION = '10.3.1';
  const ENGINE_VERSION = 'V2.8.1';
  const ENGINE_SOURCE = 'content/engine-core-v2-advanced.js (V2.8.1 authoritative runtime)';
  // Always include local wall-clock time and timezone in extension details.
  const ENGINE_UPDATED_AT = '2026-10-06 23:11:16 EDT';
  const BRIDGE_VERSION = 1;
  const SETTINGS_SCHEMA = 2;

  function buildVersionLabel() {
    return `v${VERSION}`;
  }

  function buildEngineDetails() {
    return `${ENGINE_VERSION} Math · Updated ${ENGINE_UPDATED_AT}`;
  }

  const DEFAULT_SETTINGS = Object.freeze({
    botEnabled: true,
    engineVersion: 2, // 2 = V2.8.1 authoritative runtime, 1 = legacy baseline
    autoExpand: true,
    autoAttack: true,
    clickSpeed: 4,
    sliderPercentage: 0,
    hotkeysEnabled: true,
    strategy: 'aggressive',
    allowVisionFallback: true,
    visionFps: 12,
    allowCameraAccess: false, // Strict Shield: Camera and video access strictly prohibited
    settingsSchema: SETTINGS_SCHEMA
  });

  const STRATEGIES = Object.freeze(['expansionist', 'aggressive', 'defensive']);

  function finiteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeSettings(input) {
    const raw = Object.assign({}, DEFAULT_SETTINGS, input || {});
    return {
      botEnabled: raw.botEnabled !== false,
      engineVersion: Number(raw.engineVersion) === 1 ? 1 : 2,
      autoExpand: raw.autoExpand !== false,
      autoAttack: raw.autoAttack !== false,
      // MAIN-world spend settlement needs ~220 ms; 4/s is the honest ceiling.
      clickSpeed: Math.round(clamp(finiteNumber(raw.clickSpeed, DEFAULT_SETTINGS.clickSpeed), 1, 4)),
      sliderPercentage: Math.round(clamp(finiteNumber(raw.sliderPercentage, 0), 0, 40)),
      hotkeysEnabled: raw.hotkeysEnabled !== false,
      strategy: STRATEGIES.indexOf(raw.strategy) >= 0 ? raw.strategy : DEFAULT_SETTINGS.strategy,
      allowVisionFallback: raw.allowVisionFallback !== false,
      visionFps: Math.round(clamp(finiteNumber(raw.visionFps, DEFAULT_SETTINGS.visionFps), 4, 30)),
      allowCameraAccess: false,
      settingsSchema: SETTINGS_SCHEMA
    };
  }

  function migrateSettings(input) {
    const raw = Object.assign({}, input || {});
    // v7-v9 seeded these values even though the orchestrator intended adaptive mode.
    if (!raw.settingsSchema && Number(raw.clickSpeed) === 14 &&
        Number(raw.sliderPercentage) === 30 && raw.strategy === 'expansionist') {
      raw.clickSpeed = DEFAULT_SETTINGS.clickSpeed;
      raw.sliderPercentage = DEFAULT_SETTINGS.sliderPercentage;
      raw.strategy = DEFAULT_SETTINGS.strategy;
    }
    return normalizeSettings(raw);
  }

  function actionIntervalMs(settings) {
    const s = normalizeSettings(settings);
    return Math.round(1000 / s.clickSpeed);
  }

  const BRIDGE = Object.freeze({
    version: BRIDGE_VERSION,
    requestSource: 'tio-engine-isolated',
    responseSource: 'tio-engine-main',
    maxPending: 8,
    stateTimeoutMs: 700,
    actionTimeoutMs: 1200
  });

  root.TIOConfig = Object.freeze({
    VERSION,
    ENGINE_VERSION,
    ENGINE_SOURCE,
    ENGINE_UPDATED_AT,
    BRIDGE_VERSION,
    SETTINGS_SCHEMA,
    DEFAULT_SETTINGS,
    STRATEGIES,
    BRIDGE,
    buildVersionLabel,
    buildEngineDetails,
    normalizeSettings,
    migrateSettings,
    actionIntervalMs,
    clamp
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
