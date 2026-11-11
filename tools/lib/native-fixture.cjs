'use strict';
/** Test-only canonical access to private v4/v6/v7 fields. Never injected by runtime. */
function nativeFixtureView(game) {
  if (!game || (game.contract !== 'live-modern-v6' && game.contract !== 'live-modern-v7' && game.contract !== 'live-modern-v8')) return game;
  if (!nativeFixtureView.views) nativeFixtureView.views = new WeakMap();
  if (nativeFixtureView.views.has(game)) return nativeFixtureView.views.get(game);
  const members = window.TIOSourceAdapter.nativeBindings(game.contract).members;
  const proxies = new WeakMap(), methods = new WeakMap();
  function wrap(value) {
    if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || Array.isArray(value)) return value;
    if (proxies.has(value)) return proxies.get(value);
    const proxy = new Proxy(value, {
      get(object, key) {
        const mapped = Object.prototype.hasOwnProperty.call(members, key) ? members[key] : key;
        const result = Reflect.get(object, mapped, object);
        if (typeof result !== 'function') return wrap(result);
        let cache = methods.get(object);
        if (!cache) methods.set(object, cache = new WeakMap());
        if (!cache.has(result)) cache.set(result, result.bind(object));
        return cache.get(result);
      },
      set(object, key, value) {
        const mapped = Object.prototype.hasOwnProperty.call(members, key) ? members[key] : key;
        return Reflect.set(object, mapped, value, object);
      }
    });
    proxies.set(value, proxy); return proxy;
  }
  const result = wrap(game); nativeFixtureView.views.set(game, result); return result;
}
module.exports = nativeFixtureView;
