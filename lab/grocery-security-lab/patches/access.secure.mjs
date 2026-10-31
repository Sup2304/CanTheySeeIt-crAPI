// Replacement module demonstrating real, server-side authorization checks.
// Use this file to replace src/access.mjs and restart the server.
export function mayReadOrder(actor, order) {
  return Boolean(actor && order && (actor.role === 'owner' || actor.id === order.ownerUserId));
}
export function mayEditShopSettings(actor) {
  return Boolean(actor && actor.role === 'owner');
}
