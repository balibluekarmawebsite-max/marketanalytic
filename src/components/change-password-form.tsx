"use client";

import { useState } from "react";

const inputCls = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) return setMsg({ ok: false, text: "New password must be at least 8 characters." });
    if (next !== confirm) return setMsg({ ok: false, text: "New passwords don't match." });
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setMsg({ ok: true, text: "Password updated." });
        setCurrent(""); setNext(""); setConfirm("");
      } else {
        setMsg({ ok: false, text: data.error || "Could not update password." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="cur" className="text-xs font-medium text-muted-foreground">Current password</label>
        <input id="cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
      </div>
      <div className="space-y-1">
        <label htmlFor="new" className="text-xs font-medium text-muted-foreground">New password</label>
        <input id="new" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} placeholder="at least 8 characters" />
      </div>
      <div className="space-y-1">
        <label htmlFor="conf" className="text-xs font-medium text-muted-foreground">Confirm new password</label>
        <input id="conf" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
      </div>
      {msg && <p className={`rounded-md px-3 py-2 text-xs ${msg.ok ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>{msg.text}</p>}
      <button type="submit" disabled={busy} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {busy ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
