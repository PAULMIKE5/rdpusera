"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api, useWorkspace } from "@/components/workspace";
import { money } from "@/lib/domain";
import type { Instance, Order } from "@/components/types";
export default function Dashboard() {
  const { me, setNotice } = useWorkspace();
  const [instances, setInstances] = useState<Instance[]>([]),
    [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    Promise.all([api("instances"), api("orders")])
      .then(([i, o]) => {
        setInstances(i);
        setOrders(o);
      })
      .catch((e) => setNotice(e.message));
  }, [setNotice]);
  const active = instances.filter(
    (i) => i.status === "ACTIVE" && new Date(i.expiresAt) > new Date(),
  );
  return (
    <>
      <h1 className="text-4xl md:text-5xl mb-4">Your workspace</h1>
      <p className="muted mb-8">
        Welcome{me?.name ? `, ${me.name}` : ""}. Your account and compute at a
        glance.
      </p>
      <div className="grid md:grid-cols-3 gap-4">
        {[
          ["Account balance", money(me?.wallet ?? 0)],
          ["Active instances", String(active.length)],
          [
            "Current RDP plan",
            active.length
              ? [...new Set(active.map((i) => i.plan.name))].join(", ")
              : "No active plan",
          ],
        ].map(([k, v]) => (
          <div className="panel p-7" key={k}>
            <p className="muted text-sm">{k}</p>
            <p className="text-3xl mt-5 tracking-tight">{v}</p>
          </div>
        ))}
      </div>
      <div className="panel p-6 mt-8">
        <h2 className="text-xl">Awaiting manual delivery</h2>
        <p className="muted mt-3">
          {orders.filter((o) => o.status === "PENDING").length} paid orders are
          being prepared. Access details appear only after an administrator
          delivers your server.
        </p>
        <Link className="secondary inline-block mt-5" href="/dashboard/orders">
          View orders
        </Link>
      </div>
      <Link href="/" className="primary inline-block mt-6">
        Browse more plans
      </Link>
    </>
  );
}
