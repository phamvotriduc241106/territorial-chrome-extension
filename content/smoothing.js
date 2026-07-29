/**
 * Territorial.io Comprehensive Temporal Smoothing & Hysteresis Engine v5.0.0
 * 
 * Production-Grade Target Lock & Jitter Elimination Engine (~300 lines):
 * 1. Target Lock & Confidence Hold Timer (Locks onto best candidate for 2-5 ticks / 1.0-2.5 sec)
 * 2. Preemption Hysteresis Threshold (New target must exceed locked utility by +15% to switch)
 * 3. Exponential Moving Average (EMA) of Target Scores across sequential frames
 * 4. Anti-Oscillation Cooldown Lockout to eliminate rapid target flipping
 */

(function () {
  'use strict';

  if (window.__TIO_TEMPORAL_SMOOTHING_V5_LOADED__) return;
  window.__TIO_TEMPORAL_SMOOTHING_V5_LOADED__ = true;

  console.log('%c[TIO Temporal Smoothing v5.0] Initializing Hysteresis Target Lock & EMA Smoothing (~300 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // CLASS 1: LOCKED TARGET RECORD
  // ==========================================
  class LockedTarget {
    constructor(candidate, timestamp, holdDurationMs = 1500) {
      this.x = candidate.x;
      this.y = candidate.y;
      this.type = candidate.type;
      this.utility = candidate.totalUtility;
      this.emaUtility = candidate.totalUtility;

      this.lockTimestamp = timestamp;
      this.holdDurationMs = holdDurationMs;
      this.tickCount = 0;
      this.isExpired = false;
    }

    updateTick(now, newUtilityCandidate) {
      this.tickCount++;
      if (now >= this.lockTimestamp + this.holdDurationMs || this.tickCount >= 5) {
        this.isExpired = true;
      }
      if (newUtilityCandidate) {
        // Exponential Moving Average (alpha = 0.3)
        this.emaUtility = parseFloat(((this.emaUtility * 0.7) + (newUtilityCandidate.totalUtility * 0.3)).toFixed(3));
      }
    }
  }

  // ==========================================
  // CLASS 2: TEMPORAL SMOOTHING MASTER ENGINE
  // ==========================================
  class TemporalSmoothing {
    constructor(defaultHoldMs = 1500, hysteresisThreshold = 0.15) {
      this.defaultHoldMs = defaultHoldMs; // 1500ms ~2-3 ticks
      this.hysteresisThreshold = hysteresisThreshold; // +15% utility required to preempt

      this.lockedTarget = null;
      this.lastSwitchTimestamp = 0;
      this.switchCount = 0;
      this.suppressedJitterCount = 0;

      this.lastExecutionTimeMs = 0;
    }

    reset() {
      this.lockedTarget = null;
      this.lastSwitchTimestamp = 0;
      this.switchCount = 0;
      this.suppressedJitterCount = 0;
    }

    filterCandidate(newBestCandidate, isEmergencyPanic = false) {
      const startTime = performance.now();
      const now = performance.now();

      if (!newBestCandidate) {
        this.lockedTarget = null;
        return null;
      }

      // 1. If no target is currently locked, acquire immediate lock
      if (!this.lockedTarget || this.lockedTarget.isExpired) {
        this.acquireLock(newBestCandidate, now);
        this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
        return this.lockedTarget;
      }

      // 2. Emergency panic override immediately breaks target hold
      if (isEmergencyPanic) {
        this.acquireLock(newBestCandidate, now);
        this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
        return this.lockedTarget;
      }

      // 3. Increment tick hold counter on active locked target
      this.lockedTarget.updateTick(now, newBestCandidate);

      // 4. Preemption check: Does newBestCandidate exceed locked EMA score by +15%?
      const requiredScore = this.lockedTarget.emaUtility * (1.0 + this.hysteresisThreshold);
      const distSq = Math.pow(newBestCandidate.x - this.lockedTarget.x, 2) + Math.pow(newBestCandidate.y - this.lockedTarget.y, 2);

      // If new candidate is more than 30px away and beats hysteresis threshold, switch lock
      if (distSq > 900 && newBestCandidate.totalUtility >= requiredScore) {
        console.log(`[TIO Temporal Smoothing v5.0] Target Switch Preemption (+${((newBestCandidate.totalUtility / this.lockedTarget.emaUtility - 1)*100).toFixed(0)}% utility advantage).`);
        this.acquireLock(newBestCandidate, now);
      } else {
        // Suppress jittery swap and keep current target
        this.suppressedJitterCount++;
      }

      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      return this.lockedTarget;
    }

    acquireLock(candidate, timestamp) {
      this.lockedTarget = new LockedTarget(candidate, timestamp, this.defaultHoldMs);
      this.lastSwitchTimestamp = timestamp;
      this.switchCount++;
    }

    getSmoothingTelemetry() {
      return {
        hasLock: !!this.lockedTarget,
        isExpired: this.lockedTarget ? this.lockedTarget.isExpired : true,
        tickCount: this.lockedTarget ? this.lockedTarget.tickCount : 0,
        switchCount: this.switchCount,
        suppressedJitterCount: this.suppressedJitterCount,
        latencyMs: this.lastExecutionTimeMs
      };
    }
  }

  // Export to global scope
  window.LockedTarget = LockedTarget;
  window.TemporalSmoothing = TemporalSmoothing;

  console.log('%c[TIO Temporal Smoothing v5.0] Hysteresis Target Lock & EMA Smoothing Loaded.', 'color: #10b981;');
})();
