(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  function registerOfflineShell() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }, { once: true });
  }

  registerOfflineShell();

  function updateNetworkState() {
    const state = $("network-state");
    if (!state) return;
    const connected = navigator.onLine !== false;
    state.textContent = connected
      ? "Browser network interface connected · local service checked separately"
      : "Browser reports no network · a local server on this computer may still work";
    state.classList.toggle("network-connected", connected);
    state.classList.toggle("network-disconnected", !connected);
  }

  window.addEventListener("online", updateNetworkState);
  window.addEventListener("offline", updateNetworkState);
  updateNetworkState();

  const BLOCKER_LABELS = Object.freeze({
    frontend_not_integrated: "Complete school application is not yet integrated.",
    school_api_parity_incomplete: "Some school module APIs still need local PostgreSQL integration.",
    hosted_dependencies_pending: "Remaining hosted dependencies still need replacement and verification.",
    offline_sync_not_accepted: "Offline synchronisation and conflict recovery have not passed acceptance.",
    multi_device_acceptance_pending: "Multi-computer and Android access have not passed acceptance."
  });

  function setServiceState(message, healthy) {
    $("service-message").textContent = message;
    $("service-state").classList.toggle("online", healthy === true);
    $("service-state").classList.toggle("offline", healthy === false);
  }

  function renderReadiness(readiness) {
    const list = $("readiness-list");
    list.replaceChildren();
    const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];
    const ready = readiness.enabled === true && readiness.status === "ready" && blockers.length === 0;
    $("readiness-summary").textContent = ready
      ? "All release conditions have explicit passing evidence."
      : "Release blocked · " + blockers.length + " outstanding condition(s).";
    if (!blockers.length && ready) {
      const item = document.createElement("li");
      item.className = "pass";
      item.textContent = "All local full-school release conditions passed.";
      list.append(item);
      return;
    }
    for (const blocker of blockers) {
      const item = document.createElement("li");
      item.textContent = BLOCKER_LABELS[blocker.code] || blocker.message || "A release condition remains unverified.";
      list.append(item);
    }
  }

  async function refreshStatus() {
    $("refresh-status").disabled = true;
    setServiceState("Checking local services…", null);
    try {
      const [healthResponse, readinessResponse] = await Promise.all([
        fetch("/api/v1/health", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/v1/readiness", { cache: "no-store", credentials: "same-origin" })
      ]);
      if (!healthResponse.ok || !readinessResponse.ok) throw new Error("The local status endpoints did not respond successfully.");
      const [health, readiness] = await Promise.all([healthResponse.json(), readinessResponse.json()]);
      if (health.status !== "ok" || health.transport !== "https" || health.bind !== "loopback-only") {
        throw new Error("The local service identity could not be confirmed.");
      }
      setServiceState("Local HTTPS service is responding", true);
      $("local-service-note").textContent =
        "Local HTTPS service responded. Browser network status is separate; each private-data action still needs its own successful API response.";
      $("server-detail").textContent = "HTTPS · loopback-only · " + health.service;
      renderReadiness(readiness);

      const financeEnabled = health.financeApiEnabled === true;
      $("finance-status").textContent = financeEnabled
        ? "Local finance API enabled · sign-in required"
        : "Finance screen installed · API not enabled";
      $("finance-status").className = "module-status " + (financeEnabled ? "connected" : "conditional");
      $("finance-link").setAttribute("aria-disabled", String(!financeEnabled));
      $("finance-link").tabIndex = financeEnabled ? 0 : -1;
      $("finance-warning").hidden = financeEnabled;
      if (!financeEnabled) {
        $("finance-warning").textContent = "Payment and finance operations remain unavailable until the protected local finance runtime is enabled.";
      }
    } catch (error) {
      setServiceState("Local status could not be verified", false);
      $("local-service-note").textContent =
        "The local service could not be confirmed. Cached public screens may still open, but private records and saves are unavailable until the local server responds.";
      $("readiness-summary").textContent = error.message || "Local integration status is unavailable.";
      $("server-detail").textContent = "Check that the CORNHILL local HTTPS service is running.";
      $("finance-status").textContent = "Finance runtime not verified";
      $("finance-status").className = "module-status conditional";
      $("finance-link").setAttribute("aria-disabled", "true");
      $("finance-link").tabIndex = -1;
      $("finance-warning").hidden = false;
      $("finance-warning").textContent = "The finance API status could not be verified.";
    } finally {
      $("refresh-status").disabled = false;
    }
  }

  $("refresh-status").addEventListener("click", refreshStatus);
  $("finance-link").addEventListener("click", event => {
    if (event.currentTarget.getAttribute("aria-disabled") === "true") event.preventDefault();
  });
  void refreshStatus();
})();
