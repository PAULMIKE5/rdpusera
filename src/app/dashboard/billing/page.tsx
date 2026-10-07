"use client";
import { PaymentChoices, NairaPreview } from "@/components/payment-choice";
import { paymentLabel } from "@/lib/payment-currency";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useWorkspace } from "@/components/workspace";
import { dollarsToCents } from "@/lib/money";
import { money } from "@/lib/domain";
import type { Method } from "@/components/types";
export default function Billing() {
  const { me, refresh, setNotice } = useWorkspace(),
    [payments, setPayments] = useState<
      {
        id: string;
        cents: number;
        provider: string;
        status: string;
        gatewayStatus: string | null;
        chargeCurrency: string;
        chargeAmount: string | null;
      }[]
    >([]),
    [methods, setMethods] = useState<Method[]>([]),
    [amount, setAmount] = useState("50.00"),
    [methodId, setMethodId] = useState(""),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("payment-methods")
      .then((m: Method[]) => {
        const available = m.filter((v) => v.provider !== "manual");
        setMethods(available);
        setMethodId(available[0]?.id ?? "");
      })
      .catch((e) => setNotice(e.message));
  }, [setNotice]);
  useEffect(() => {
    api("funding")
      .then(setPayments)
      .catch((e) => setNotice(e.message));
  }, [setNotice]);
  useEffect(() => setKey(crypto.randomUUID()), [amount, methodId]);
  return (
    <>
      <h1 className="text-3xl mb-6">Wallet & billing</h1>
      <form
        className="panel p-6 space-y-4 mb-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api("funding", {
              cents: dollarsToCents(amount),
              provider:
                methodId === "demo"
                  ? "demo"
                  : methods.find((m) => m.id === methodId)?.provider,
              ...(methodId === "demo" ? {} : { method: methodId }),
              requestKey: key,
            });
            if (r.url) window.location.assign(r.url);
            else {
              await refresh();
              setKey(crypto.randomUUID());
              setNotice("Wallet updated");
            }
          } catch (e) {
            setNotice((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">Current balance</p>
        <p className="text-3xl">{money(me?.wallet ?? 0)}</p>
        <label>
          Amount in USD (minimum $0.10)
          <input
            type="number"
            min="0.10"
            max="1000"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <PaymentChoices
          methods={methods}
          value={methodId}
          onChange={setMethodId}
          disabled={busy}
          demo={!!me?.demo}
        />
        <NairaPreview
          method={methods.find((m) => m.id === methodId)}
          cents={(() => {
            try {
              return dollarsToCents(amount);
            } catch {
              return 0;
            }
          })()}
        />
        <button className="primary" disabled={busy || !methodId || !key}>
          Add funds
        </button>
        {!methods.length && !me?.demo && (
          <p className="muted text-sm">
            Online wallet funding is not enabled. Available manual payment
            methods can be selected during cart checkout.
          </p>
        )}
      </form>
      {payments.length > 0 && (
        <section className="panel p-6 mb-6">
          <h2 className="text-xl mb-4">Recent wallet payments</h2>
          {payments.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap justify-between gap-3 border-t border-white/10 py-4"
            >
              <div>
                <strong>{money(p.cents)} wallet credit</strong>
                {p.chargeCurrency === "NGN" && p.chargeAmount && (
                  <p className="text-sm">
                    Naira charge: ₦
                    {Number(p.chargeAmount).toLocaleString("en-NG", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                )}
                <p className="muted text-sm">
                  {paymentLabel(p.provider)} · {p.status}{" "}
                  {p.gatewayStatus ? `(${p.gatewayStatus})` : ""}
                </p>
              </div>
              {p.status === "PENDING" &&
                ["flutterwave", "flutterwave_ngn", "nowpayments"].includes(
                  p.provider,
                ) && (
                  <Link
                    className="secondary"
                    href={`/payments/return?payment=${p.id}`}
                  >
                    Check payment
                  </Link>
                )}
            </div>
          ))}
        </section>
      )}
      <div className="panel overflow-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Date</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {me?.ledger.map((l) => (
              <tr key={l.id}>
                <td>{l.kind}</td>
                <td>{new Date(l.createdAt).toLocaleString()}</td>
                <td>{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
