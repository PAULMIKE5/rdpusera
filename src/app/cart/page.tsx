"use client";
import { PaymentChoices, NairaPreview } from "@/components/payment-choice";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  ShoppingCart,
  Trash2,
  MapPin,
  Monitor,
  LockKeyhole,
  Check,
  Server,
} from "lucide-react";
import { api, useWorkspace } from "@/components/workspace";
import { money } from "@/lib/domain";
import { countries, checkoutSystems } from "@/lib/countries";
import type { Plan, Method, CartLine } from "@/components/types";
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
    return p ? p.baseCents * l.quantity : null;
  });
  const configured =
    cart.length > 0 &&
    cart.every(
      (l) =>
        countries.some((c) => c.code === l.countryCode) &&
        checkoutSystems.includes(l.os),
    );
  const valid =
    configured && totals.every((n) => n !== null) && !loading && !!key;
  const total = totals.reduce<number>((a, b) => a + (b ?? 0), 0);
  function update(index: number, data: Partial<CartLine>) {
    setCart(cart.map((l, n) => (n === index ? { ...l, ...data } : l)));
  }
  async function checkout() {
    if (!valid) return;
    if (!me) {
      router.push("/login?next=cart");
      return;
    }
    setBusy(true);
    try {
      const order = await api("checkout", {
        requestKey: key,
        method,
        lines: cart.map((l) => ({
          planId: l.planId,
          quantity: l.quantity,
          countryCode: l.countryCode,
          os: l.os,
        })),
      });
      setCart([]);
      await refresh();
      router.push("/dashboard/orders");
      setNotice(
        order.status === "COMPLETE"
          ? "Your servers are ready. Open My instances for access details."
          : order.status === "PENDING"
            ? "Payment received. Your configured servers are pending delivery."
            : "Order reserved. Continue payment from your order.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-shell">
      <Link
        href="/#plans"
        className="muted text-xs flex gap-2 items-center mb-8"
      >
        <ArrowLeft size={14} /> Back to plans
      </Link>
      <div className="mb-10">
        <p className="eyebrow mb-3">MAKE IT YOURS</p>
        <h1 className="text-4xl md:text-5xl">Configure your workspace.</h1>
        <p className="muted mt-4">
          Your hardware is ready to go. Choose where—and how—you work.
        </p>
      </div>
      {!cart.length ? (
        <div className="panel text-center py-16 px-6">
          <ShoppingCart className="mx-auto text-lime-200 mb-5" size={32} />
          <h2 className="text-2xl">A fresh start.</h2>
          <p className="muted mt-3 mb-6">
            Add a plan to start building your next workspace.
          </p>
          <Link href="/#plans" className="primary">
            Explore plans <ArrowUpRight size={16} />
          </Link>
        </div>
      ) : (
        <>
          <div className="flex gap-5 flex-wrap mb-8">
            <span className="step-indicator">
              <span className="step-number">
                <Check size={13} />
              </span>
              Choose a plan
            </span>
            <span className="step-indicator !text-lime-200">
              <span className="step-number">02</span>Configure
            </span>
            <span className="step-indicator">
              <span className="step-number">03</span>Secure checkout
            </span>
          </div>
          <div className="cart-layout">
            <div className="space-y-5">
              {cart.map((l, n) => {
                const p = plans.find((p) => p.id === l.planId);
                return (
                  <article key={n} className="panel p-5 md:p-7">
                    <div className="flex justify-between items-start gap-4 pb-6 border-b border-white/10">
                      <div className="flex gap-4">
                        <span className="p-3 h-fit rounded-xl bg-lime-200/5">
                          <Server size={20} className="text-lime-200" />
                        </span>
                        <div>
                          <h2 className="text-xl">{p?.name ?? l.name}</h2>
                          <p className="muted text-xs mt-2">
                            {p?.cpu ?? l.cpu} vCPU · {p?.ram ?? l.ram} GB RAM ·{" "}
                            {p?.disk ?? l.disk} GB SSD
                          </p>
                          <p className="text-xs mt-2 text-lime-200">
                            {p
                              ? money(p.baseCents)
                              : loading
                                ? "Loading…"
                                : "Plan unavailable"}{" "}
                            / 30 days
                          </p>
                        </div>
                      </div>
                      <button
                        className="icon-button text-slate-400 hover:text-red-300"
                        aria-label={`Remove ${l.name}`}
                        disabled={busy}
                        onClick={() => setCart(cart.filter((_, k) => k !== n))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-5 mt-6">
                      <label>
                        <span className="flex gap-2 items-center">
                          <MapPin size={14} /> Server country
                        </span>
                        <select
                          required
                          disabled={busy}
                          value={l.countryCode}
                          onChange={(e) =>
                            update(n, { countryCode: e.target.value })
                          }
                        >
                          <option value="">Choose a country</option>
                          {countries.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="flex gap-2 items-center">
                          <Monitor size={14} /> Operating system
                        </span>
                        <select
                          required
                          disabled={busy}
                          value={l.os}
                          onChange={(e) =>
                            update(n, { os: e.target.value as CartLine["os"] })
                          }
                        >
                          {checkoutSystems.map((os) => (
                            <option key={os}>{os}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex justify-between items-end mt-6">
                      <label className="w-24">
                        Quantity
                        <input
                          type="number"
                          min="1"
                          max="10"
                          step="1"
                          value={l.quantity}
                          disabled={busy}
                          onChange={(e) =>
                            update(n, {
                              quantity: Math.max(
                                1,
                                Math.min(
                                  10,
                                  Math.trunc(Number(e.target.value) || 1),
                                ),
                              ),
                            })
                          }
                        />
                      </label>
                      <div className="text-right">
                        <p className="muted text-xs mb-1">Item total</p>
                        <strong className="text-xl">
                          {totals[n] === null
                            ? "Unavailable"
                            : money(totals[n]!)}
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <aside className="panel checkout-summary p-7">
              <h2 className="text-xl">Order summary</h2>
              <div className="flex justify-between text-sm mt-7">
                <span className="muted">Servers</span>
                <span>{cart.reduce((n, l) => n + l.quantity, 0)}</span>
              </div>
              <div className="flex justify-between text-sm mt-4">
                <span className="muted">Term</span>
                <span>30 days from delivery</span>
              </div>
              <div className="flex justify-between items-end py-6 my-6 border-y border-white/10">
                <span className="muted text-sm">Total due</span>
                <strong className="text-3xl tracking-tight">
                  {loading ? "…" : money(total)}
                </strong>
              </div>
              <PaymentChoices
                methods={methods}
                value={method}
                onChange={setMethod}
                disabled={busy}
                walletLabel={`Wallet · ${money(me?.wallet ?? 0)}`}
              />
              <NairaPreview
                method={methods.find((m) => m.id === method)}
                cents={total}
              />
              {!configured && (
                <p className="text-amber-200 text-xs mt-4" role="status">
                  Choose a country for every server to continue.
                </p>
              )}
              <button
                className="primary w-full mt-6"
                disabled={busy || !valid}
                onClick={checkout}
              >
                {busy
                  ? "Creating your order…"
                  : me
                    ? "Continue to checkout"
                    : "Sign in to checkout"}
                <ArrowUpRight size={16} />
              </button>
              <p className="muted text-xs mt-5 flex items-start gap-2">
                <LockKeyhole size={14} className="shrink-0 mt-0.5" />
                Payment is verified before access is released. No automatic
                renewals.
              </p>
              <p className="muted text-xs mt-5 pt-5 border-t border-white/10">
                Country and OS are delivery requirements. Matching inventory is
                assigned after payment; other configurations stay pending while
                an admin prepares them.
              </p>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
