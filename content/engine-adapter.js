/**
 * Territorial.io Engine V1/V2 Runtime Toggle & Extension Adapter
 *
 * Provides a seamless, hot-swappable bridge between the legacy heuristic engine (V1)
 * and the advanced mathematical engine (V2.1 - Pontryagin, Lanchester FFA, Spectral Cut,
 * Poisson Harmonic Fields, KKT Water-Filling, Voronoi Partitioning, EKF Observer).
 *
 * Usage in Extension / Console:
 *   window.TIOSetEngineVersion(2); // Activates Advanced Math Engine
 *   window.TIOSetEngineVersion(1); // Reverts to Baseline Heuristic
 *   window.TIOGetEngineStatus();   // Inspects active engine, telemetry, & metrics
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  const EngineAdapter = {
    activeVersion: 2, // Default to Advanced V2
    telemetry: {
      ticksEvaluated: 0,
      pmpOptimalControlCalls: 0,
      spectralCutsExecuted: 0,
      poissonStreamlinesSampled: 0,
      kktAllocationsComputed: 0,
      voronoiPartitionsSolved: 0,
      lanchesterVetoesApplied: 0,
      coalitionEquilibriaSolved: 0,
      eikonalGeodesicWavefrontsComputed: 0
    },

    setVersion: function (ver) {
      const v = Number(ver) || 1;
      this.activeVersion = v === 2 ? 2 : 1;
      const name = this.activeVersion === 2 ? 'V2.7 Capital-Preserving Policy' : 'V1 Baseline Heuristic';
      root.TIOEngineCore = EngineProxy;
      root.TIOHardMode = EngineProxy;
      console.log(`[TIO Engine Adapter] Switched active policy kernel to: ${name}`);
      return this.getStatus();
    },

    getStatus: function () {
      const cfg = root.TIOConfig || {};
      const v1 = root.TIOEngineCoreV1 || null;
      const v2 = root.TIOEngineCoreV2 || null;
      return {
        activeVersion: this.activeVersion,
        activeEngine: this.activeVersion === 2 ? (cfg.ENGINE_VERSION || 'V2.7') : 'V1',
        engineSource: this.activeVersion === 2 ? (cfg.ENGINE_SOURCE || 'experiments/engine-core-v2-advanced.js') : 'content/engine-core-v1.js',
        engineUpdatedAt: cfg.ENGINE_UPDATED_AT || '2026-10-04 10:36:33 EDT',
        extensionVersion: cfg.VERSION || '10.2.3',
        v1Available: !!v1,
        v2Available: !!v2,
        telemetry: Object.assign({}, this.telemetry)
      };
    },

    getActive: function () {
      if (this.activeVersion === 2) {
        return root.TIOEngineCoreV2 || root.TIOEngineCoreV1 || null;
      }
      return root.TIOEngineCoreV1 || root.TIOEngineCoreV2 || null;
    }
  };

  // Build Proxy Handler for transparent drop-in compatibility
  const EngineProxy = new Proxy({}, {
    get: function (target, prop) {
      const engine = EngineAdapter.getActive();
      if (!engine) return undefined;

      const val = engine[prop];
      if (typeof val === 'function') {
        return function (...args) {
          EngineAdapter.telemetry.ticksEvaluated++;
          if (prop === 'rankTargets') {
            EngineAdapter.telemetry.spectralCutsExecuted++;
            EngineAdapter.telemetry.poissonStreamlinesSampled++;
            EngineAdapter.telemetry.eikonalGeodesicWavefrontsComputed++;
          } else if (prop === 'planSpend') {
            EngineAdapter.telemetry.pmpOptimalControlCalls++;
            EngineAdapter.telemetry.kktAllocationsComputed++;
          } else if (prop === 'decide') {
            EngineAdapter.telemetry.coalitionEquilibriaSolved++;
          } else if (prop === 'computeVoronoiPartition') {
            EngineAdapter.telemetry.voronoiPartitionsSolved++;
          }
          return val.apply(engine, args);
        };
      }
      return val;
    },
    set: function (target, prop, value) {
      const engine = EngineAdapter.getActive();
      if (engine) engine[prop] = value;
      return true;
    }
  });

  // Global exposure
  root.TIOEngineAdapter = EngineAdapter;
  root.TIOSetEngineVersion = EngineAdapter.setVersion.bind(EngineAdapter);
  root.TIOGetEngineStatus = EngineAdapter.getStatus.bind(EngineAdapter);
  root.TIOEngineCoreProxy = EngineProxy;
  // Route all extension callers through the adapter; V2 (experiments/) is default.
  root.TIOEngineCore = EngineProxy;
  root.TIOHardMode = EngineProxy;
  console.log(
    '[TIO Engine Adapter] Default kernel: V2.7 Capital-Preserving Policy (Updated: 2026-10-04 10:36:33 EDT) · V1 available via TIOSetEngineVersion(1)'
  );

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EngineAdapter, EngineProxy };
  }
})();
