/* CORNHILL shared navigation controls.
   Navigation remains in the sticky school header, beside refresh and sign-out. */
(() => {
  'use strict';
  const MAIN_SYSTEM = 'https://cornhill-school-swart.vercel.app/';
  const SCHOOL_WEBSITE = 'https://school-website-cornhill-school.vercel.app/apps/school-website/';
  const pathname = window.location.pathname.toLowerCase();
  const host = window.location.hostname.toLowerCase();
  const isParentPortal = pathname.endsWith('parents.html') || pathname.includes('parent-guardian') || host.startsWith('parents-');
  const isAdmissions = pathname.endsWith('admissions.html') || pathname.includes('/apps/admissions') || host.startsWith('admissions-');
  const app = document.getElementById('app');
  const mainWorkspace = !!(app && document.querySelector('.cornhill-sidebar') && document.getElementById('dashboard'));
  const backStack = [];
  const forwardStack = [];
  let replaying = false;
  let forwardAvailable = false;
  let originalTab = null;

  if (mainWorkspace && app.dataset.activeWorkspace) {
    const state = history.state && typeof history.state === 'object' ? history.state : {};
    history.replaceState({ ...state, cornhillWorkspace: app.dataset.activeWorkspace }, '', location.href);
  }

  function internalReferrer() {
    try {
      const ref = new URL(document.referrer);
      return ref.hostname === host ||
        /cornhill-school|school-website|parents-cornhill|notifications-cornhill|records-cornhill|evidence-cornhill|banking-cornhill/i.test(ref.hostname);
    } catch (_) { return false; }
  }

  function control(label, accessibleName, action, extraClass) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cornhill-nav-control' + (extraClass ? ' ' + extraClass : '');
    button.textContent = label;
    button.title = accessibleName;
    button.setAttribute('aria-label', accessibleName);
    button.addEventListener('click', action);
    return button;
  }

  function updateControls() {
    const backButton = document.getElementById('cornhillNavBack');
    const forwardButton = document.getElementById('cornhillNavForward');
    if (!backButton || !forwardButton) return;
    const hasInternalBack = mainWorkspace
      ? (backStack.length > 0 || (history.length > 1 && internalReferrer()))
      : true;
    backButton.disabled = !hasInternalBack;
    forwardButton.disabled = mainWorkspace ? forwardStack.length === 0 : !forwardAvailable;
  }

  function back() {
    if (mainWorkspace && backStack.length > 0) {
      if (history.state && history.state.cornhillWorkspace) {
        history.back();
        return;
      }
      const previous = backStack.pop();
      const current = app.dataset.activeWorkspace;
      if (current) forwardStack.push(current);
      replaying = true;
      originalTab(previous);
      replaying = false;
      updateControls();
      return;
    }
    if (history.length > 1 && internalReferrer()) {
      forwardAvailable = true;
      history.back();
      return;
    }
    window.location.assign(isParentPortal || isAdmissions ? SCHOOL_WEBSITE : MAIN_SYSTEM);
  }

  function forward() {
    if (mainWorkspace && forwardStack.length > 0) {
      history.forward();
      return;
    }
    if (!mainWorkspace && forwardAvailable) {
      forwardAvailable = false;
      history.forward();
      updateControls();
    }
  }

  function goHome() {
    if (mainWorkspace && typeof window.tab === 'function') {
      window.tab('dashboard');
      return;
    }
    window.location.assign(isParentPortal || isAdmissions ? SCHOOL_WEBSITE : MAIN_SYSTEM);
  }

  function addNavigation() {
    if (document.getElementById('cornhillNavigation')) return;
    const header = document.querySelector('header.top') || document.querySelector('header');
    if (!header) return;
    const nav = document.createElement('nav');
    nav.id = 'cornhillNavigation';
    nav.className = 'cornhill-navigation-controls cornhill-navigation-header';
    nav.setAttribute('aria-label', 'Page navigation');

    const backButton = control('←', 'Back', back);
    backButton.id = 'cornhillNavBack';
    const homeLabel = mainWorkspace ? 'Dashboard' : (isParentPortal || isAdmissions ? 'School website' : 'Main system');
    let homeButton;
    if (mainWorkspace) {
      homeButton = control('⌂', homeLabel, goHome, 'cornhill-nav-home');
    } else {
      homeButton = document.createElement('a');
      homeButton.id = 'cornhillNavHome';
      homeButton.className = 'cornhill-nav-control cornhill-nav-home';
      homeButton.href = isParentPortal || isAdmissions ? SCHOOL_WEBSITE : MAIN_SYSTEM;
      homeButton.textContent = '⌂';
      homeButton.title = homeLabel;
      homeButton.setAttribute('aria-label', homeLabel);
    }
    if (mainWorkspace) homeButton.id = 'cornhillNavHome';
    const forwardButton = control('→', 'Forward', forward);
    forwardButton.id = 'cornhillNavForward';
    nav.append(backButton, homeButton, forwardButton);

    // The action row is inside the sticky header beside Refresh app and Sign out.
    let actions = header.querySelector('.row');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'row cornhill-header-actions';
      header.appendChild(actions);
    }
    actions.classList.add('cornhill-header-actions');
    actions.insertBefore(nav, actions.firstChild);
    updateControls();
  }

  if (mainWorkspace && typeof window.tab === 'function') {
    originalTab = window.tab;
    window.tab = function (name) {
      const before = app.dataset.activeWorkspace || null;
      const result = originalTab.apply(this, arguments);
      const after = app.dataset.activeWorkspace || null;
      if (!replaying && after && before !== after) {
        if (before) {
          backStack.push(before);
          forwardStack.length = 0;
          const state = history.state && typeof history.state === 'object' ? history.state : {};
          history.pushState({ ...state, cornhillWorkspace: after }, '', location.href);
        } else {
          const state = history.state && typeof history.state === 'object' ? history.state : {};
          history.replaceState({ ...state, cornhillWorkspace: after }, '', location.href);
        }
      }
      updateControls();
      return result;
    };

    window.addEventListener('popstate', event => {
      const target = event.state && event.state.cornhillWorkspace;
      const current = app.dataset.activeWorkspace || null;
      if (!target || target === current || typeof originalTab !== 'function') return;
      const cameFromBack = backStack[backStack.length - 1] === target;
      const cameFromForward = forwardStack[forwardStack.length - 1] === target;
      if (cameFromBack) {
        backStack.pop();
        if (current) forwardStack.push(current);
      } else if (cameFromForward) {
        forwardStack.pop();
        if (current) backStack.push(current);
      }
      replaying = true;
      originalTab(target);
      replaying = false;
      updateControls();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addNavigation, { once: true });
  } else {
    addNavigation();
  }
})();
