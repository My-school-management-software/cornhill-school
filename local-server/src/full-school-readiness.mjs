// Truthful release gate for the local full-school application.
// Keep this blocked until the actual frontend, local APIs, and offline workflows
// have been integrated and accepted; finance readiness alone is insufficient.
const BLOCKERS = Object.freeze([
  Object.freeze({ code: "frontend_not_integrated", area: "application", message: "The complete school application is not yet served by the local HTTPS server." }),
  Object.freeze({ code: "school_api_parity_incomplete", area: "backend", message: "The full set of school module APIs has not yet been connected to local PostgreSQL repositories." }),
  Object.freeze({ code: "hosted_dependencies_pending", area: "migration", message: "Hosted application dependencies have not yet been fully replaced and verified against local services." }),
  Object.freeze({ code: "offline_sync_not_accepted", area: "offline", message: "Offline data workflows, safe synchronisation and conflict handling have not passed end-to-end acceptance." }),
  Object.freeze({ code: "multi_device_acceptance_pending", area: "operations", message: "Multi-computer and Android access controls have not passed end-to-end acceptance." })
]);

export function getFullSchoolReadiness() {
  const blockers = BLOCKERS.map(item => ({ ...item }));
  return Object.freeze({
    enabled: blockers.length === 0,
    status: blockers.length === 0 ? "ready" : "blocked",
    stage: "local-integration",
    blockers,
    checkedAt: new Date().toISOString()
  });
}
