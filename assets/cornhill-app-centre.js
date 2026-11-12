(function (root) {
  'use strict';

  function getVisibleRows(rows) {
    const origin = root.location && root.location.origin
      ? root.location.origin
      : 'https://cornhill.invalid';
    const seen = new Set();
    const visible = [];

    for (const app of Array.isArray(rows) ? rows : []) {
      if (!app || app.is_active !== true) continue;

      const rawUrl = String(app.app_url || '').trim();
      if (!rawUrl) continue;

      let destination;
      try {
        const parsed = new URL(rawUrl, origin);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
        parsed.hash = '';
        parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/g, '') || '/';
        parsed.searchParams.sort();
        destination = parsed.href;
      } catch (_) {
        continue;
      }

      if (seen.has(destination)) continue;
      seen.add(destination);
      visible.push(app);
    }

    return visible;
  }

  root.CornhillAppCentre = Object.freeze({ getVisibleRows });
})(typeof window === 'undefined' ? globalThis : window);
