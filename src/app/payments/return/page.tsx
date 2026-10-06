"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, ApiError, useWorkspace } from "@/components/workspace";
export default function PaymentReturn() {
  const [payment, setPayment] = useState(""),
    [providerId, setProviderId] = useState(""),
    [draftId, setDraftId] = useState(""),
    [result, setResult] = useState<{
      status: string;
      gatewayStatus: string | null;
      needsProviderId: boolean;
      destination: string;
    } | null>(null),
    [error, setError] = useState(""),
    [login, setLogin] = useState(""),
    [busy, setBusy] = useState(false);
  const { refresh } = useWorkspace();
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setPayment(q.get("payment") ?? "");
    const id = q.get("transaction_id") ?? q.get("payment_id") ?? "";
    setProviderId(id);
    setDraftId(id);
  }, []);
  const check = useCallback(async () => {
    if (!payment) return;
    setBusy(true);
    try {
      const r = await api("payments/verify", {
        paymentId: payment,
        ...(providerId ? { providerPaymentId: providerId } : {}),
      });
      setResult(r);
      setError("");
      if (r.status === "PAID") await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        setLogin(
          `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
        );
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [payment, providerId, refresh]);
  useEffect(() => {
    if (!payment || login || result?.status === "PAID") return;
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [check, payment, login, result?.status]);
  return (
    <main className="page-shell">
      <section className="panel p-7 max-w-xl mx-auto">
        <p className="eyebrow mb-3">PAYMENT STATUS</p>
        <h1 className="text-3xl">
          {result?.status === "PAID"
            ? "Payment confirmed"
            : "Checking your payment"}
        </h1>
        {login ? (
          <p className="mt-5">
            Sign in to securely check this payment.{" "}
            <Link className="text-lime-200" href={login}>
              Sign in →
            </Link>
          </p>
        ) : (
          <>
            <p className="muted my-5">
              {result?.status === "PAID"
                ? "Your account has been updated. Your server will be assigned or queued for delivery."
                : "A return to this page does not confirm payment. Crypto can remain confirming until settlement completes. We check every 15 seconds."}
            </p>
            {result?.gatewayStatus && (
              <p className="badge">Provider: {result.gatewayStatus}</p>
            )}
            {error && (
              <p role="alert" className="text-amber-200 my-4">
                {error}
              </p>
            )}
            {result?.needsProviderId && (
              <label className="mt-5">
                Provider payment ID (optional)
                <input
                  inputMode="numeric"
                  value={draftId}
                  onChange={(e) =>
                    setDraftId(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="From your provider receipt"
                />
                <span className="muted text-xs">
                  Waiting for a webhook. You can enter the payment ID from your
                  receipt to verify directly. Do not pay again.
                </span>
              </label>
            )}
            <div className="flex flex-wrap gap-3 mt-6">
              <button
                className="primary"
                disabled={busy || !payment || result?.status === "PAID"}
                onClick={() => {
                  if (draftId !== providerId) setProviderId(draftId);
                  else check();
                }}
              >
                {busy ? "Checking…" : "Check payment"}
              </button>
              <Link
                className="secondary"
                href={result?.destination ?? "/dashboard/orders"}
              >
                Back to dashboard
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
