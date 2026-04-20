import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Search, Loader2, ShieldCheck, Users } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { AdminUser } from "../../../lib/api/types";

export function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyUser, setBusyUser] = useState<string | null>(null);

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
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesQuery && matchesRole;
  }), [roleFilter, searchQuery, users]);

  const updateRole = async (username: string, role: "admin" | "user") => {
    setBusyUser(username);
    try {
      setUsers(await adminApi.updateUserRole(username, role));
    } finally {
      setBusyUser(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">User Management</h1>
          <p className="text-[13px] text-[#768390]">View registered users and manage access roles</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Total Users</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{users.length}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Admins</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{users.filter((u) => u.role === "admin").length}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Standard Users</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{users.filter((u) => u.role !== "admin").length}</div></CardContent></Card>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-[18px] text-[#e6edf3]">Users</CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Search and update user roles</CardDescription>
              </div>
              <div className="flex gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#768390]" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search users" className="w-64 border-[#30363d] bg-[#0d1117] pl-10 text-[#e6edf3]" />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-10 w-40 border-[#30363d] bg-[#0d1117] text-[13px] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[#30363d] bg-[#161b22]">
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="admin">Admins</SelectItem>
                    <SelectItem value="user">Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-16 text-center text-[#768390]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading users...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[#30363d] hover:bg-transparent">
                    <TableHead className="text-[#768390]">User</TableHead>
                    <TableHead className="text-[#768390]">Username</TableHead>
                    <TableHead className="text-[#768390]">Role</TableHead>
                    <TableHead className="text-[#768390]">Created</TableHead>
                    <TableHead className="text-[#768390] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.username} className="border-[#30363d]">
                      <TableCell>
                        <div>
                          <div className="font-medium text-[#e6edf3]">{user.name}</div>
                          <div className="text-[12px] text-[#768390]">{user.email || "No email"}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-[#768390]">{user.username}</TableCell>
                      <TableCell>
                        <Badge className={user.role === "admin" ? "bg-blue-600/20 text-blue-400 border-blue-500/30" : "bg-[#1c2128] text-[#768390] border-[#30363d]"}>{user.role}</Badge>
                      </TableCell>
                      <TableCell className="text-[#768390]">{user.createdAt || "—"}</TableCell>
                      <TableCell className="text-right">
                        {user.role === "admin" ? (
                          <Button variant="outline" size="sm" className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]" onClick={() => updateRole(user.username, "user")} disabled={busyUser === user.username}>
                            {busyUser === user.username ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />} Make User
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]" onClick={() => updateRole(user.username, "admin")} disabled={busyUser === user.username}>
                            {busyUser === user.username ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Make Admin
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
