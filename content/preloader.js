/**
 * Parser-safe source bootstrap.
 *
 * A MutationObserver cannot rewrite an inline parser script before it executes.
 * At document_start, synchronously fetch and validate the same-origin HTML, add
 * the capability export inside the recognized IIFE, then replace the still-empty
 * document. Any fetch/classification/syntax failure leaves the original response
 * untouched so the vision path can take over.
 */
(function () {
  'use strict';
  if (window.__TIO_PRELOAD_ATTEMPTED__) return;
  window.__TIO_PRELOAD_ATTEMPTED__ = true;

  var adapter = window.TIOSourceAdapter;
  var config = window.TIOConfig || {};
  var result = { status: 'skipped', kind: 'unknown', bytes: 0 };
  window.__TIO_PRELOAD_RESULT__ = result;

  if (!adapter || typeof adapter.classify !== 'function' ||
      typeof adapter.buildExportSnippet !== 'function' || document.readyState !== 'loading' ||
      (location.protocol !== 'https:' && location.protocol !== 'http:')) return;

  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', location.href, false);
    xhr.send(null);
    if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)) {
      result.status = 'fetch-status-' + xhr.status;
      return;
    }

    var html = xhr.responseText || '';
    var kind = adapter.classify(html);
    result.kind = kind;
    result.bytes = html.length;
    if (kind !== 'readable-legacy' && kind !== 'live-modern' &&
        kind !== 'live-modern-v2' && kind !== 'live-modern-v3') {
      result.status = 'contract-unmapped';
      return;
    }

    var snippet = adapter.buildExportSnippet(config.VERSION || '10.3.0', kind);
    var patched = adapter.patch(html, snippet);
    if (!patched || patched === html) {
      result.status = 'patch-rejected';
      return;
    }

    // Compile only; never execute a second copy. This rejects a bad splice
    // before document.open makes the operation irreversible.
    var scriptEnd = patched.lastIndexOf('</script>');
    var scriptOpen = scriptEnd >= 0 ? patched.lastIndexOf('<script', scriptEnd) : -1;
    var scriptStart = scriptOpen >= 0 ? patched.indexOf('>', scriptOpen) + 1 : -1;
    if (scriptStart <= scriptOpen || scriptEnd <= scriptStart) {
      result.status = 'script-extract-failed';
      return;
    }
    new Function(patched.slice(scriptStart, scriptEnd));

    result.status = 'pre-exec-patched';
    window.__TIO_PRELOAD_RESULT__ = result;
    document.open();
    document.write(patched);
    document.close();
    window.__TIO_PRELOAD_RESULT__ = result;
    window.__TIO_SCRIPT_PATCHED__ = true;
    window.__TIO_PREPATCHED__ = true;
    if (document.documentElement) {
      document.documentElement.setAttribute('data-tio-patch', 'pre-exec');
      document.documentElement.setAttribute('data-tio-contract', kind);
    }
  } catch (error) {
    result.status = 'error';
    result.error = String(error && error.message || error);
    window.__TIO_PRELOAD_RESULT__ = result;
  }
})();
