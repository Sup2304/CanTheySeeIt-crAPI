// Local OWASP-style training lab: intentionally incomplete authorization.
// This file is meant to be inspected AFTER running CanTheySeeIt? against the lab.
// Run only on 127.0.0.1 with synthetic accounts and records.
export function mayReadOrder(actor, order) {
  // Mistake: verifies a session exists, but not whether it owns THIS order.
  return Boolean(actor && order);
}

export function mayEditShopSettings(actor) {
  // Mistake: confuses being signed-in with holding the owner role.
  return Boolean(actor);
}
