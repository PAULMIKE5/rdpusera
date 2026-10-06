"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  ShieldCheck,
  Mail,
  Globe2,
  ArrowLeft,
} from "lucide-react";
import { api, useWorkspace } from "@/components/workspace";
import { countries } from "@/lib/countries";
type Challenge = { challengeId: string; email: string; retryAfter: number };
export default function Login() {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [challenge, setChallenge] = useState<Challenge | null>(null),
    [cooldown, setCooldown] = useState(0),
    [code, setCode] = useState("");
  const { refresh, cart } = useWorkspace(),
    router = useRouter();
  useEffect(() => {
    try {
      const c = JSON.parse(
        sessionStorage.getItem("rdp-verification") ?? "null",
      );
      if (
        c &&
        /^[a-f0-9]{64}$/.test(c.challengeId) &&
        typeof c.email === "string"
      )
        setChallenge(c);
    } catch {}
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(
      () => setCooldown((n) => Math.max(0, n - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);
  function saveChallenge(c: Challenge) {
    setChallenge(c);
    setCooldown(c.retryAfter ?? 60);
    setCode("");
    try {
      sessionStorage.setItem("rdp-verification", JSON.stringify(c));
    } catch {}
  }
  function clearChallenge() {
    setChallenge(null);
    setCode("");
    setError("");
    try {
      sessionStorage.removeItem("rdp-verification");
    } catch {}
  }
  async function finish() {
    clearChallenge();
    await refresh();
    const next = new URLSearchParams(window.location.search).get("next");
    const allowed =
      next &&
      /^\/(dashboard(?:[/?]|$)|admin(?:[/?]|$)|payments\/return(?:[?]|$)|cart$)/.test(
        next,
      ) &&
      !/[\\\r\n]/.test(next);
    router.push(allowed ? next : cart.length ? "/cart" : "/dashboard");
    router.refresh();
  }
  return (
    <main className="page-shell">
      <Link href="/" className="muted text-xs flex gap-2 items-center mb-10">
        <ArrowLeft size={14} /> Back to GlobalRDP
      </Link>
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 max-w-5xl mx-auto items-center py-6">
        <section className="hidden lg:block">
          <span className="brand-mark !w-14 !h-14 !rounded-2xl mb-8">
            <Globe2 size={30} />
          </span>
          <p className="eyebrow mb-4">YOUR WORKSPACE AWAITS</p>
          <h1 className="text-5xl leading-tight">
            Great work starts
            <br />
            with a little space.
          </h1>
          <p className="muted mt-6 max-w-sm leading-relaxed">
            One account to manage your servers, payments, and next big idea.
            Wherever you choose to work.
          </p>
          <p className="text-xs muted mt-10 flex gap-2 items-center">
            <ShieldCheck size={17} className="text-lime-200" />
            Email verification protects every new account.
          </p>
        </section>
        <section className="panel p-7 md:p-10">
          {challenge ? (
            <>
              <span className="inline-flex p-3 rounded-xl bg-lime-200/10 text-lime-200 mb-5">
                <Mail size={22} />
              </span>
              <h2 className="text-3xl">Check your inbox.</h2>
              <p className="muted text-sm mt-4">
                Enter the six-digit code sent to{" "}
                <strong className="text-slate-200 break-all">
                  {challenge.email}
                </strong>
                . Your account stays inactive until you verify it.
              </p>
              <form
                className="mt-7 space-y-5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await api("auth/verify", {
                      challengeId: challenge.challengeId,
                      code,
                    });
                    await finish();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Email verification code
                  <input
                    className="otp-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    required
                    autoFocus
                  />
                </label>
                <p className="muted text-xs">
                  Expires in 10 minutes. Check your spam folder too.
                </p>
                {error && (
                  <p role="alert" className="text-amber-200 text-sm">
                    {error}
                  </p>
                )}
                <button
                  className="primary w-full"
                  disabled={busy || code.length !== 6}
                >
                  {busy ? "Verifying…" : "Verify & continue"}
                  <ArrowUpRight size={16} />
                </button>
              </form>
              <button
                className="secondary w-full mt-4"
                disabled={busy || cooldown > 0}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    saveChallenge(
                      await api("auth/resend", {
                        challengeId: challenge.challengeId,
                      }),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {cooldown ? `Resend code in ${cooldown}s` : "Send a new code"}
              </button>
              <button
                className="muted text-xs mt-6"
                disabled={busy}
                onClick={() => {
                  clearChallenge();
                  setRegister(true);
                }}
              >
                Wrong email? Start again
              </button>
            </>
          ) : (
            <>
              <p className="eyebrow mb-4">
                {register ? "JOIN GLOBALRDP" : "WELCOME BACK"}
              </p>
              <h2 className="text-3xl">
                {register ? "Make room for more." : "Your workspace is here."}
              </h2>
              <p className="muted text-sm mt-3">
                {register
                  ? "Create an account. Verify your email. Get to work."
                  : "Sign in to pick up where you left off."}
              </p>
              <form
                className="space-y-5 mt-8"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  const data = Object.fromEntries(
                    new FormData(e.currentTarget),
                  );
                  try {
                    const r = await api(
                      `auth/${register ? "register" : "login"}`,
                      data,
                    );
                    if (r.verificationRequired) saveChallenge(r);
                    else await finish();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {register && (
                  <>
                    <label>
                      Full name
                      <input
                        name="name"
                        autoComplete="name"
                        minLength={2}
                        maxLength={80}
                        required
                      />
                    </label>
                    <label>
                      Country of residence
                      <select
                        name="countryCode"
                        autoComplete="country-name"
                        defaultValue=""
                        required
                      >
                        <option value="" disabled>
                          Select your country
                        </option>
                        {countries.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    maxLength={72}
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    placeholder="At least 12 characters"
                    required
                  />
                </label>
                {register && (
                  <p className="muted text-xs">
                    We’ll email you a six-digit activation code.
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-amber-200 text-sm">
                    {error}
                  </p>
                )}
                <button className="primary w-full" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : register
                      ? "Send verification code"
                      : "Sign in"}
                  <ArrowUpRight size={16} />
                </button>
              </form>
              <div className="border-t border-white/10 mt-7 pt-6 text-center">
                <button
                  className="text-sm muted"
                  disabled={busy}
                  onClick={() => {
                    setRegister(!register);
                    setError("");
                  }}
                >
                  {register
                    ? "Already have an account? "
                    : "New to GlobalRDP? "}
                  <span className="text-lime-200">
                    {register ? "Sign in" : "Create an account"}
                  </span>
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
