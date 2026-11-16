"use strict";

(() => {
  const MESSAGE = "Offline: cached screens may open, but sign-in, learner records, marks and payments require a live school-server connection. Changes are not saved offline.";
  let banner;

  function updateConnectionNotice() {
    if (navigator.onLine !== false) {
      banner?.remove();
      banner = null;
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "offline-status";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      banner.textContent = MESSAGE;
      document.body.prepend(banner);
    }
  }

  window.addEventListener("offline", updateConnectionNotice);
  window.addEventListener("online", updateConnectionNotice);
  updateConnectionNotice();
})();
