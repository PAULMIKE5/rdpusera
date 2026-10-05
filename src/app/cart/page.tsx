"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, useWorkspace } from "@/components/workspace";
import { money, price } from "@/lib/domain";
import type { Plan, Method } from "@/components/types";
export default function Cart() {
  const { cart, setCart, me, refresh, setNotice } = useWorkspace();
  const [plans, setPlans] = useState<Plan[]>([]),
    [methods, setMethods] = useState<Method[]>([]),
    [method, setMethod] = useState("wallet"),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(""),
    [loading, setLoading] = useState(true);
  const router = useRouter();
  useEffect(() => {
    Promise.all([api("catalog"), api("payment-methods")])
      .then(([p, m]) => {
        setPlans(p);
        setMethods(m);
      })
      .catch((e) => setNotice(e.message))
      .finally(() => setLoading(false));
  }, [setNotice]);
  useEffect(() => setKey(crypto.randomUUID()), [cart, method]);
  const totals = cart.map((l) => {
    const p = plans.find((p) => p.id === l.planId);
    try {
      return p ? price(p, l) * l.quantity : null;
    } catch {
      return null;
    }
  });
  const valid = totals.every((n) => n !== null);
  async function checkout() {
    if (!me) {
      router.push("/login");
      return;
    }
    setBusy(true);
    try {
      const order = await api("checkout", {
        requestKey: key,
        method,
        lines: cart.map(({ name, estimate, ...l }) => l),
      });
      setCart([]);
      await refresh();
      router.push("/dashboard/orders");
      setNotice(
        order.status === "PENDING"
          ? "Payment received. Your order is pending manual delivery."
          : "Order reserved. Open your order to complete payment.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="max-w-4xl mx-auto p-6 py-12">
      <h1 className="text-3xl mb-6">Your cart</h1>
      {!cart.length ? (
        <div className="panel p-8">
          Your cart is empty.{" "}
          <Link href="/" className="text-lime-300">
            Browse plans
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {cart.map((l, n) => (
              <div
                className="panel p-5 flex flex-wrap gap-4 justify-between items-center"
                key={n}
              >
                <div>
                  <h2>{l.name}</h2>
                  <p className="muted text-xs">
                    {l.cpu} vCPU · {l.ram} GB RAM · {l.disk} GB SSD
                  </p>
                </div>
                <label>
                  Quantity
                  <input
                    disabled={busy}
                    className="max-w-20"
                    type="number"
                    min="1"
                    max="10"
                    value={l.quantity}
                    onChange={(e) =>
                      setCart(
                        cart.map((v, k) =>
                          k === n
                            ? {
                                ...v,
                                quantity: Math.max(
                                  1,
                                  Math.min(10, Number(e.target.value)),
                                ),
                              }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
                <span>
                  {loading
                    ? "…"
                    : totals[n] === null
                      ? "Unavailable"
                      : money(totals[n]!)}
                </span>
                <button
                  disabled={busy}
                  className="text-red-300 text-sm"
                  onClick={() => setCart(cart.filter((_, k) => k !== n))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="panel p-6 mt-6 space-y-5">
            <label>
              Payment method
              <select
                disabled={busy}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="wallet">
                  Wallet · {money(me?.wallet ?? 0)}
                </option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-between text-xl">
              <span>30-day total</span>
              <strong>
                {valid
                  ? money(totals.reduce<number>((a, b) => a + (b ?? 0), 0))
                  : "Update cart"}
              </strong>
            </div>
            <p className="muted text-sm">
              After verified payment, matching available servers are assigned
              automatically. Otherwise your order stays pending for
              administrator delivery. Your 30-day term begins at delivery. No
              automatic renewal.
            </p>
            <button
              className="primary w-full"
              disabled={busy || loading || !valid}
              onClick={checkout}
            >
              {busy ? "Processing…" : me ? "Checkout" : "Sign in to checkout"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
