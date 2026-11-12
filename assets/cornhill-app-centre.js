(function (root) {
  'use strict';

  const CATEGORY_ORDER = [
    'School',
    'Learning',
    'Finance',
    'Communication',
    'Parent Access',
    'External Service'
  ];
  const CATEGORY_LABELS = {
    'School': 'School administration',
    'Learning': 'Learning & academics',
    'Finance': 'Finance & accounting',
    'Communication': 'Communication',
    'Parent Access': 'Parents & guardians',
    'External Service': 'System management'
  };

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

  function groupRowsByCategory(rows) {
    const groups = new Map();
    for (const app of Array.isArray(rows) ? rows : []) {
      const category = String(app && app.category || 'School').trim() || 'School';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(app);
    }

    return Array.from(groups, ([category, categoryRows]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      rows: categoryRows
    })).sort((a, b) => {
      const aIndex = CATEGORY_ORDER.indexOf(a.category);
      const bIndex = CATEGORY_ORDER.indexOf(b.category);
      const aRank = aIndex < 0 ? CATEGORY_ORDER.length : aIndex;
      const bRank = bIndex < 0 ? CATEGORY_ORDER.length : bIndex;
      return aRank - bRank || a.label.localeCompare(b.label);
    });
  }

  root.CornhillAppCentre = Object.freeze({ getVisibleRows, groupRowsByCategory });
})(typeof window === 'undefined' ? globalThis : window);
