// Read-only UI contract. Never feeds policy, spending or the actuator.
(function (root) {
  "use strict";
  const STALE_MS = 3000;
  const copy = {
    disconnected: ["Disconnected", "Open Territorial.io to connect."],
    ready: ["Ready", "Choose Single Player, then select your spawn point."],
    confirming: ["Confirming spawn", "Waiting for your territory to appear."],
    playing: ["Playing", "Autopilot is running. Z pauses immediately."],
    paused: ["Paused", "Enable Autopilot or press Z in the game to resume."],
    blocked: [
      "Waiting",
      "Waiting for the game connection. Retry or reload the game tab.",
    ],
    stale: ["Connection delayed", "Telemetry is old. Retry to reconnect."],
  };
  const reasons = {
    "user-hold": "Paused while you interact with the map.",
    arming: "Confirming the native command connection.",
    "hook-unavailable":
      "Native connection unavailable. Check Advanced diagnostics.",
    "controls-disabled": "Expansion and attacks are both disabled.",
    "runtime-error":
      "The commander reported an error. Check Advanced diagnostics.",
  };
  function derivePresentationState(status, settings = {}, ageMs = 0) {
    let key = "disconnected",
      reason = null;
    if (status && typeof status === "object") {
      const valid =
        Number.isFinite(status.statusSampledAt) &&
        status.statusSampledAt > 0 &&
        Number.isFinite(ageMs) &&
        ageMs >= 0;
      const sampleAge = status.telemetryAgeMs;
      // A cached/delivered snapshot does not stop its underlying observation aging.
      const observationAge =
        Number.isFinite(sampleAge) && sampleAge >= 0 ? sampleAge + ageMs : null;
      const needsSample =
        status.inGame === true ||
        status.armed === true ||
        typeof status.balance === "number" ||
        typeof status.territory === "number";
      const fresh =
        valid &&
        ageMs <= STALE_MS &&
        (!needsSample ||
          (observationAge !== null && observationAge <= STALE_MS));
      if (!valid) key = "blocked";
      else if (settings.botEnabled === false || status.botEnabled === false)
        key = "paused";
      else if (
        ageMs > STALE_MS ||
        (needsSample && observationAge !== null && observationAge > STALE_MS)
      )
        key = "stale";
      else if (status.pendingSpawn === true) key = "confirming";
      else if (status.inGame !== true && status.armed !== true) key = "ready";
      else if (
        fresh &&
        status.botEnabled === true &&
        status.inGame === true &&
        status.armed === true &&
        status.actuatorReady === true &&
        status.automationRunning === true &&
        !status.blockReason
      )
        key = "playing";
      else {
        key = "blocked";
        reason = reasons[status.blockReason] || copy.blocked[1];
      }
      return Object.freeze({
        key,
        label: copy[key][0],
        hint: reason || copy[key][1],
        fresh,
        enabled: settings.botEnabled !== false,
        playing: key === "playing",
      });
    }
    return Object.freeze({
      key,
      label: copy[key][0],
      hint: copy[key][1],
      fresh: false,
      enabled: settings.botEnabled !== false,
      playing: false,
    });
  }
  function metric(value, provenance) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !["observed", "estimated"].includes(provenance)
    )
      return "Unavailable";
    const formatted = Math.round(value).toLocaleString("en-US");
    return provenance === "estimated"
      ? "~" + formatted + " (estimate)"
      : formatted;
  }
  const api = Object.freeze({ derivePresentationState, metric, STALE_MS });
  root.TIOPresentation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
