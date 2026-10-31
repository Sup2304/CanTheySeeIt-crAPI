// Intentionally vulnerable local lab variant; not for production.
export function mayReadOrder(actor, order) {
  return Boolean(actor && order); // Missing object ownership check.
}
export function mayEditShopSettings(actor) {
  return Boolean(actor); // Missing owner-role check.
}
