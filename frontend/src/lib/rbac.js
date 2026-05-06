const RULES = {
  admin: new Set([
    "dashboard.view",
    "book.view",
    "book.create",
    "book.update",
    "book.delete",
    "category.manage",
    "order.view",
    "order.update",
    "user.view",
    "user.ban",
    "user.changeRole",
    "voucher.manage",
    "chat.view",
    "chat.reply",
  ]),
  customer: new Set([]),
};

export function can(user, action) {
  if (!user) return false;
  const role = user.role || "customer";
  const set = RULES[role];
  return !!set?.has(action);
}

export function requireRole(user, role) {
  return !!user && user.role === role;
}
