import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Search, Loader2, ShieldCheck, Crown, Shield, Users } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { AdminUser } from "../../../lib/api/types";
import { canManageRoles, normalizeRole, roleLabel } from "../../../lib/auth/roles";
import { useAuth } from "../../../lib/auth/AuthContext";

const roleOptions = [
  { value: "user", label: "User" },
  { value: "co_admin", label: "Co-Admin" },
] as const;

function roleBadgeClass(role: string) {
  switch (normalizeRole(role)) {
    case "co_admin":
      return "bg-purple-600/20 text-purple-300 border-purple-500/30";
    case "admin":
      return "bg-amber-600/20 text-amber-300 border-amber-500/30";
    default:
      return "bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)] border-[var(--color-border)]";
  }
}

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const canManageStaff = canManageRoles(currentUser?.role);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await adminApi.getUsers());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery = !q || user.name.toLowerCase().includes(q) || user.username.toLowerCase().includes(q) || (user.email || "").toLowerCase().includes(q);
    const matchesRole = roleFilter === "all" || normalizeRole(user.role) === roleFilter;
    return matchesQuery && matchesRole;
  }), [roleFilter, searchQuery, users]);

  const updateRole = async (username: string, role: "co_admin" | "user") => {
    setBusyUser(username);
    try {
      setUsers(await adminApi.updateUserRole(username, role));
    } finally {
      setBusyUser(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">System Access Control</h1>
          <p className="text-[13px] text-[var(--color-text-tertiary)]">Manage operational staff roles and administrative privileges. Primary access is restricted to the account owner.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Total Users</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[var(--color-text-primary)]">{users.length}</div></CardContent></Card>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Admin</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-amber-300">{users.filter((u) => normalizeRole(u.role) === "admin").length}</div></CardContent></Card>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Co-Admins</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-purple-300">{users.filter((u) => normalizeRole(u.role) === "co_admin").length}</div></CardContent></Card>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Users</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-blue-300">{users.filter((u) => normalizeRole(u.role) === "user").length}</div></CardContent></Card>
        </div>

        <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Staff Accounts & Permissions</CardTitle>
                <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Primary Administrators oversee account ownership and role delegation. Co-Administrators are authorized for system operations.</CardDescription>
              </div>
              <div className="flex gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search users" className="w-64 border-[var(--color-border)] bg-[var(--color-bg-secondary)] pl-10 text-[var(--color-text-primary)]" />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-10 w-40 border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[13px] text-[var(--color-text-primary)]"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="co_admin">Co-Admins</SelectItem>
                    <SelectItem value="user">Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
              {canManageStaff ? "Primary Administrator session active. You have full authorization to manage system privileges and delegate staff access levels." : "Operational Staff session active. You have read-only access to system accounts. Role modifications require Primary Administrator authorization."}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-16 text-center text-[var(--color-text-tertiary)]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading users...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--color-border)] hover:bg-transparent">
                    <TableHead className="text-[var(--color-text-tertiary)]">User</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Username</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Role</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Created</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const role = normalizeRole(user.role);
                    const locked = role === "admin" || !canManageStaff;
                    return (
                      <TableRow key={user.username} className="border-[var(--color-border)]">
                        <TableCell>
                          <div>
                            <div className="font-medium text-[var(--color-text-primary)] flex items-center gap-2">
                              {role === "admin" ? <Crown className="h-4 w-4 text-amber-300" /> : role === "co_admin" ? <ShieldCheck className="h-4 w-4 text-purple-300" /> : <Users className="h-4 w-4 text-[var(--color-text-tertiary)]" />}
                              {user.name}
                            </div>
                            <div className="text-[12px] text-[var(--color-text-tertiary)]">{user.email || "No email"}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-[var(--color-text-tertiary)]">{user.username}</TableCell>
                        <TableCell><Badge className={roleBadgeClass(role)}>{roleLabel(role)}</Badge></TableCell>
                        <TableCell className="text-[var(--color-text-tertiary)]">{user.createdAt || "—"}</TableCell>
                        <TableCell className="text-right">
                          {locked ? (
                            <span className="text-xs text-[var(--color-text-tertiary)]">{role === "admin" ? "Primary Account (Immutable)" : "Primary Authorization Required"}</span>
                          ) : (
                            <div className="flex justify-end">
                              <Select value={role} onValueChange={(value) => updateRole(user.username, value as "user" | "co_admin") } disabled={busyUser === user.username}>
                                <SelectTrigger className="h-9 w-36 border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]"><SelectValue /></SelectTrigger>
                                <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                                  {roleOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
