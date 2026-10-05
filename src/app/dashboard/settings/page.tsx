"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useWorkspace } from "@/components/workspace";
export default function Settings() {
  const { me, refresh, setNotice } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    setBusy(true);
    const form = e.currentTarget;
    try {
      const r = await api("settings", {
        action,
        ...Object.fromEntries(new FormData(form)),
      });
      form.reset();
      await refresh();
      if (r.signInAgain) router.push("/login");
      setNotice(
        r.signInAgain
          ? "Password updated. Sign in again."
          : "Account settings saved. Other sessions were signed out.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1 className="text-3xl mb-6">Account settings</h1>
      <div className="grid md:grid-cols-2 gap-5">
        <form
          key={me?.email}
          className="panel p-6 space-y-4"
          onSubmit={(e) => submit(e, "profile")}
        >
          <h2 className="text-xl">Profile</h2>
          <label>
            Name
            <input name="name" defaultValue={me?.name} maxLength={80} />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              defaultValue={me?.email}
              required
            />
          </label>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Save profile
          </button>
        </form>
        <form
          className="panel p-6 space-y-4"
          onSubmit={(e) => submit(e, "password")}
        >
          <h2 className="text-xl">Change password</h2>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              required
            />
          </label>
          <p className="muted text-xs">
            Changing your password signs out every session.
          </p>
          <button className="primary" disabled={busy}>
            Update password
          </button>
        </form>
        <form
          className="panel p-6 space-y-4"
          onSubmit={(e) => submit(e, "sessions")}
        >
          <h2 className="text-xl">Session management</h2>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="secondary" disabled={busy}>
            Sign out all other sessions
          </button>
        </form>
      </div>
    </>
  );
}
