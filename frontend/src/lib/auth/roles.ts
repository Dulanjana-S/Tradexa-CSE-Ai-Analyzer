export type UserRole = "co_admin" | "admin" | "user";

export function normalizeRole(role: unknown): UserRole {
  const value = String(role || "user").toLowerCase();
  if (value === "owner") return "admin";
  if (value === "co_admin" || value === "co-admin" || value === "coadmin") return "co_admin";
  if (value === "admin") return "admin";
  return "user";
}

export function isStaffRole(role: unknown): boolean {
  return normalizeRole(role) !== "user";
}

export function canManageRoles(role: unknown): boolean {
  return normalizeRole(role) === "admin";
}

export function roleLabel(role: unknown): string {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case "co_admin":
      return "Co-Admin";
    case "admin":
      return "Admin";
    default:
      return "User";
  }
}
