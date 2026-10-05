"use client";
import { useEffect, useState } from "react";
import { api, useWorkspace } from "@/components/workspace";
import { money } from "@/lib/domain";
import type { Method } from "@/components/types";
export default function Billing() {
  const { me, refresh, setNotice } = useWorkspace(),
    [methods, setMethods] = useState<Method[]>([]),
    [cents, setCents] = useState(5000),
    [provider, setProvider] = useState(""),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("payment-methods")
      .then((m: Method[]) => {
        const available = m.filter((v) => v.provider !== "manual");
        setMethods(available);
        setProvider(available[0]?.provider ?? "");
      })
      .catch((e) => setNotice(e.message));
  }, [setNotice]);
  useEffect(() => setKey(crypto.randomUUID()), [cents, provider]);
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
              cents,
              provider,
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
          Amount in USD
          <input
            type="number"
            min="5"
            max="1000"
            step="1"
            value={cents / 100}
            onChange={(e) => setCents(Math.round(Number(e.target.value) * 100))}
          />
        </label>
        <label>
          Payment method
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="">Choose a payment method</option>
            {methods.map((m) => (
              <option key={m.id} value={m.provider}>
                {m.label}
              </option>
            ))}
            {me?.demo && <option value="demo">Demo credit (local only)</option>}
          </select>
        </label>
        <button className="primary" disabled={busy || !provider}>
          Add funds
        </button>
        {!methods.length && !me?.demo && (
          <p className="muted text-sm">
            Online wallet funding is not enabled. Available manual payment
            methods can be selected during cart checkout.
          </p>
        )}
      </form>
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
