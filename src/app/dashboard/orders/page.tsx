"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, useWorkspace } from "@/components/workspace";
import { money } from "@/lib/domain";
import type { Order } from "@/components/types";
export default function Orders() {
  const [rows, setRows] = useState<Order[]>([]),
    [busy, setBusy] = useState(false);
  const { setNotice, refresh } = useWorkspace();
  const load = useCallback(
    () =>
      api("orders")
        .then(setRows)
        .catch((e) => setNotice(e.message)),
    [setNotice],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);
  async function action(id: string, action: string) {
    setBusy(true);
    try {
      const r = await api("orders", { id, action });
      if (r.url) window.location.assign(r.url);
      else if (r.manual)
        setNotice(
          "Follow the payment instructions. Include your order ID as the reference; an administrator will confirm receipt.",
        );
      await load();
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1 className="text-3xl mb-6">Your orders</h1>
      {!rows.length && (
        <p className="panel p-8">
          No orders yet.{" "}
          <Link href="/" className="text-lime-300">
            Browse plans
          </Link>
        </p>
      )}
      <div className="space-y-5">
        {rows.map((o) => (
          <article key={o.id} className="panel p-6">
            <div className="flex justify-between gap-3 flex-wrap">
              <div className="break-all">
                Order {o.id}
                <p className="muted text-xs mt-2">
                  {new Date(o.createdAt).toLocaleString()}
                </p>
              </div>
              <span className="badge h-fit">
                {o.status.replaceAll("_", " ")}
              </span>
            </div>
            <ul className="my-5 space-y-2">
              {o.items.map((i) => (
                <li key={i.id} className="text-sm">
                  {i.name} · {i.location} · {i.cpu} vCPU / {i.ram} GB / {i.disk}{" "}
                  GB · {money(i.cents)}{" "}
                  {i.instance?.status === "ACTIVE" && (
                    <Link href="/dashboard/instances" className="text-lime-300">
                      View access
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <strong>{money(o.totalCents)}</strong>
            {o.status === "AWAITING_PAYMENT" && (
              <>
                <p className="muted whitespace-pre-wrap my-4">
                  {o.paymentInstructions ||
                    "Complete payment to join the manual delivery queue."}
                </p>
                <div className="flex gap-3">
                  <button
                    disabled={busy}
                    className="primary"
                    onClick={() => action(o.id, "pay")}
                  >
                    {o.method === "manual"
                      ? "Payment instructions"
                      : "Continue payment"}
                  </button>
                  <button
                    disabled={busy}
                    className="secondary"
                    onClick={() => {
                      if (
                        confirm("Cancel this unpaid order and release stock?")
                      )
                        action(o.id, "cancel");
                    }}
                  >
                    Cancel unpaid order
                  </button>
                </div>
              </>
            )}
            {o.status === "PENDING" && (
              <p className="text-lime-300 mt-4">
                Payment received · awaiting administrator delivery.
              </p>
            )}
            {o.status === "COMPLETE" && (
              <p className="text-lime-300 mt-4">
                All server access details have been delivered.
              </p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
