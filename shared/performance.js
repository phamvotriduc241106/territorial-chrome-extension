/** Bounded, per-world synchronous CPU timings. No buffers grow during play. */
(function (root) {
  'use strict';
  if (root.TIOProfiler) return;
  class CpuProfiler {
    constructor(clock, capacity = 256, maxMetrics = 64) {
      this.clock = clock || (() => performance.now());
      this.capacity = capacity;
      this.maxMetrics = maxMetrics;
      this.enabled = true;
      this.metrics = new Map();
      this.startedAt = this.clock();
    }
    reset() { this.metrics.clear(); this.startedAt = this.clock(); }
    record(name, ms) {
      if (!this.enabled || !Number.isFinite(ms) || ms < 0) return;
      let metric = this.metrics.get(name);
      if (!metric) {
        if (this.metrics.size >= this.maxMetrics) return;
        metric = { calls: 0, totalMs: 0, samples: new Float64Array(this.capacity), size: 0, cursor: 0 };
        this.metrics.set(name, metric);
      }
      metric.calls++; metric.totalMs += ms;
      metric.samples[metric.cursor] = ms;
      metric.cursor = (metric.cursor + 1) % this.capacity;
      metric.size = Math.min(metric.size + 1, this.capacity);
    }
    measureCall(name, fn, receiver, args) {
      if (!this.enabled) return fn.apply(receiver, args);
      const start = this.clock();
      try { return fn.apply(receiver, args); }
      finally { this.record(name, this.clock() - start); }
    }
    snapshot() {
      const elapsedSec = Math.max(0.001, (this.clock() - this.startedAt) / 1000);
      const result = {};
      for (const [name, metric] of this.metrics) {
        const samples = Array.from(metric.samples.subarray(0, metric.size)).sort((a, b) => a - b);
        const percentile = p => samples[Math.max(0, Math.ceil(p * samples.length) - 1)] || 0;
        result[name] = {
          calls: metric.calls, meanMs: metric.totalMs / metric.calls,
          p50Ms: percentile(0.50), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
          callsPerSec: metric.calls / elapsedSec, cpuMsPerSec: metric.totalMs / elapsedSec,
          recentSamples: metric.size
        };
      }
      return { enabled: this.enabled, elapsedSec, capacity: this.capacity,
        timing: 'inclusive synchronous time; nested metrics overlap; rates since reset', metrics: result };
    }
  }
  root.CpuProfiler = CpuProfiler;
  root.TIOProfiler = new CpuProfiler();
  root.TIOGetPerformance = () => root.TIOProfiler.snapshot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
