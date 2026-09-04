"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const inputCls = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const btn = "rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50";

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; user?: AdminUser }> {
  try {
    const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await res.json().catch(() => ({ ok: false, error: "Unexpected response." }));
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export function UsersManager({ initialUsers, meId }: { initialUsers: AdminUser[]; meId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  // Add-user form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("viewer");
  const [password, setPassword] = useState("");
  const [adding, setAdding] = useState(false);

  // Per-row reset state
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const flash = (ok: boolean, text: string) => { setBanner({ ok, text }); };

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    if (password.length < 8) return flash(false, "Password must be at least 8 characters.");
    setAdding(true);
    const r = await call({ op: "create", email, name, role, password });
    setAdding(false);
    if (r.ok && r.user) {
      setUsers((u) => [r.user!, ...u]);
      flash(true, `Added ${r.user.email}. Share the password with them; they can change it under Your account.`);
      setEmail(""); setName(""); setRole("viewer"); setPassword("");
    } else {
      flash(false, r.error || "Could not add user.");
    }
  }

  async function resetPassword(id: string) {
    setBanner(null);
    if (resetPw.length < 8) return flash(false, "Password must be at least 8 characters.");
    setBusyId(id);
    const r = await call({ op: "reset", id, password: resetPw });
    setBusyId(null);
    if (r.ok) {
      const u = users.find((x) => x.id === id);
      flash(true, `Password reset for ${u?.email}. Share the new password with them.`);
      setResetId(null); setResetPw("");
    } else {
      flash(false, r.error || "Could not reset password.");
    }
  }

  async function toggleActive(u: AdminUser) {
    setBanner(null);
    setBusyId(u.id);
    const r = await call({ op: "toggle", id: u.id, isActive: !u.isActive });
    setBusyId(null);
    if (r.ok) { setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isActive: !x.isActive } : x))); }
    else flash(false, r.error || "Could not update.");
  }

  async function changeRole(u: AdminUser) {
    setBanner(null);
    const nextRole = u.role === "admin" ? "viewer" : "admin";
    setBusyId(u.id);
    const r = await call({ op: "role", id: u.id, role: nextRole });
    setBusyId(null);
    if (r.ok) { setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x))); }
    else flash(false, r.error || "Could not update role.");
  }

  return (
    <div className="space-y-6">
      {banner && (
        <div className={`rounded-md px-3 py-2 text-sm ${banner.ok ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>{banner.text}</div>
      )}

      {/* Add teammate */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Add a teammate</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={addUser} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="name@bluekarmasecrets.com" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                <option value="viewer">Viewer — can see the dashboards</option>
                <option value="admin">Admin — can also manage logins</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Temporary password</label>
              <div className="flex gap-2">
                <input type="text" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="at least 8 characters" />
                <button type="button" onClick={() => setPassword(randomPassword())} className={btn} title="Generate a strong password">Generate</button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={adding} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {adding ? "Adding…" : "Add teammate"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Team ({users.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Last sign-in</th>
                <th className="py-2 pl-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border/40 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{u.name || u.email}</div>
                    {u.name && <div className="text-xs text-muted-foreground">{u.email}</div>}
                    {u.id === meId && <span className="text-[10px] text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-3 py-2"><Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge></td>
                  <td className="px-3 py-2">
                    {u.isActive ? <span className="text-emerald-600">Active</span> : <span className="text-muted-foreground">Disabled</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "never"}</td>
                  <td className="py-2 pl-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button className={btn} disabled={busyId === u.id} onClick={() => { setResetId(resetId === u.id ? null : u.id); setResetPw(""); }}>Reset password</button>
                      <button className={btn} disabled={busyId === u.id} onClick={() => changeRole(u)}>{u.role === "admin" ? "Make viewer" : "Make admin"}</button>
                      <button className={btn} disabled={busyId === u.id || u.id === meId} onClick={() => toggleActive(u)}>{u.isActive ? "Disable" : "Enable"}</button>
                    </div>
                    {resetId === u.id && (
                      <div className="mt-2 flex justify-end gap-1.5">
                        <input type="text" value={resetPw} onChange={(e) => setResetPw(e.target.value)} className={`${inputCls} max-w-[220px]`} placeholder="new password (8+ chars)" />
                        <button type="button" onClick={() => setResetPw(randomPassword())} className={btn}>Generate</button>
                        <button type="button" disabled={busyId === u.id} onClick={() => resetPassword(u.id)} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">Save</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        New teammates sign in with the temporary password you set, then change it under <span className="font-medium">Your account</span>. Passwords are stored hashed — you can only reset them, never read them.
      </p>
    </div>
  );
}
