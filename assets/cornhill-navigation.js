/* CORNHILL shared navigation controls.
   Adds accessible Back / Home / Forward controls without changing data or access rules.
   The Parent Portal links only to the public school website. */
(() => {
  'use strict';

  const MAIN_SYSTEM = 'https://cornhill-school-swart.vercel.app/';
  const SCHOOL_WEBSITE = 'https://school-website-cornhill-school.vercel.app/apps/school-website/';
  const pathname = window.location.pathname.toLowerCase();
  const host = window.location.hostname.toLowerCase();
  const isParentPortal = /parents\.html$/.test(pathname) || /parent-guardian/.test(pathname) || host.startsWith('parents-');
  const isAdmissions = /admissions\.html$/.test(pathname) || /\/apps\/admissions\/?$/.test(pathname) || host.startsWith('admissions-');
  const app = document.getElementById('app');
  const mainWorkspace = !!(app && document.querySelector('.cornhill-sidebar') && document.getElementById('dashboard'));
  const backStack = [];
  const forwardStack = [];
  let replaying = false;
  let forwardAvailable = false;
  let originalTab = null;

  function internalReferrer() {
    try {
      const ref = new URL(document.referrer);
      return ref.hostname === host ||
        /cornhill-school|school-website|parents-cornhill|notifications-cornhill|records-cornhill|evidence-cornhill|banking-cornhill/i.test(ref.hostname);
    } catch (_) {
      return false;
    }
  }

  function control(label, action, extraClass) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cornhill-nav-control' + (extraClass ? ' ' + extraClass : '');
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  function updateControls() {
    const back = document.getElementById('cornhillNavBack');
    const forward = document.getElementById('cornhillNavForward');
    if (!back || !forward) return;
    const hasInternalBack = mainWorkspace ? backStack.length > 0 : (history.length > 1 && internalReferrer());
    back.disabled = !hasInternalBack && !isParentPortal && !isAdmissions && history.length <= 1;
    if (isParentPortal || isAdmissions) {
      back.disabled = !hasInternalBack && history.length <= 1;
    }
    forward.disabled = mainWorkspace ? forwardStack.length === 0 : !forwardAvailable;
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
    const nav = document.createElement('nav');
    nav.id = 'cornhillNavigation';
    nav.className = 'cornhill-navigation-shell';
    nav.setAttribute('aria-label', 'Page navigation');

    const controls = document.createElement('div');
    controls.className = 'cornhill-navigation-controls';
    const backButton = control('← Back', back);
    backButton.id = 'cornhillNavBack';
    const homeLabel = mainWorkspace ? '⌂ Dashboard' : (isParentPortal || isAdmissions ? 'School website' : 'Main system');
    const homeButton = mainWorkspace
      ? control(homeLabel, goHome, 'cornhill-nav-home')
      : document.createElement('a');
    if (mainWorkspace) {
      homeButton.id = 'cornhillNavHome';
    } else {
      homeButton.id = 'cornhillNavHome';
      homeButton.className = 'cornhill-nav-control cornhill-nav-home';
      homeButton.href = isParentPortal || isAdmissions ? SCHOOL_WEBSITE : MAIN_SYSTEM;
      homeButton.textContent = homeLabel;
    }
    const forwardButton = control('Forward →', forward);
    forwardButton.id = 'cornhillNavForward';

    controls.append(backButton, homeButton, forwardButton);
    nav.appendChild(controls);

    if (mainWorkspace) {
      app.insertBefore(nav, app.firstChild);
    } else {
      const header = document.querySelector('header.top') || document.querySelector('header');
      if (header && header.parentNode) header.insertAdjacentElement('afterend', nav);
      else {
        const main = document.querySelector('main');
        if (main && main.parentNode) main.insertAdjacentElement('beforebegin', nav);
        else document.body.insertBefore(nav, document.body.firstChild);
      }
    }
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
      if (backStack[backStack.length - 1] === target) backStack.pop();
      else if (forwardStack[forwardStack.length - 1] === target) forwardStack.pop();
      if (current) {
        const direction = backStack.length >= forwardStack.length ? forwardStack : backStack;
        direction.push(current);
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
