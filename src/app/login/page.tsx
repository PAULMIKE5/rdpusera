"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useWorkspace } from "@/components/workspace";
export default function Login() {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { refresh } = useWorkspace(),
    router = useRouter();
  return (
    <main className="max-w-md mx-auto px-5 py-16">
      <form
        className="panel p-7 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await api(`auth/${register ? "register" : "login"}`, data);
            await refresh();
            router.push("/dashboard");
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="text-2xl">
          {register ? "Create your account" : "Welcome back"}
        </h1>
        {error && (
          <p role="alert" className="text-amber-300">
            {error}
          </p>
        )}
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete={register ? "new-password" : "current-password"}
            required
          />
        </label>
        <button className="primary w-full" disabled={busy}>
          {register ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          className="muted text-sm"
          onClick={() => setRegister(!register)}
        >
          {register
            ? "Already registered? Sign in"
            : "New here? Create an account"}
        </button>
      </form>
    </main>
  );
}
