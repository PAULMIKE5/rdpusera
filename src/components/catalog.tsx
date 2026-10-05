"use client";
import { useEffect, useState } from "react";
import {
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  ArrowUpRight,
  Check,
  Search,
} from "lucide-react";
import { api, useWorkspace } from "./workspace";
import type { Plan } from "./types";
import { money } from "@/lib/domain";
import { planDescription } from "@/lib/countries";
export function Catalog() {
  const [plans, setPlans] = useState<Plan[]>([]),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState("");
  const { cart, setCart, setNotice } = useWorkspace();
  useEffect(() => {
    api("catalog")
      .then(setPlans)
      .catch((e) => setNotice(e.message))
      .finally(() => setLoading(false));
  }, [setNotice]);
  function add(p: Plan) {
    if (cart.reduce((n, l) => n + l.quantity, 0) >= 20) {
      setNotice("Maximum 20 servers in one cart");
      return;
    }
    // Each row can be configured independently, including identical tiers in different countries.
    setCart([
      ...cart,
      {
        planId: p.id,
        name: p.name,
        cpu: p.cpu,
        ram: p.ram,
        disk: p.disk,
        quantity: 1,
        estimate: p.baseCents,
        countryCode: "",
        os: "Windows",
      },
    ]);
    setNotice(`${p.name} added. Choose its country and OS in your cart.`);
  }
  const filtered = plans.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-7">
        <span className="muted text-xs">
          {loading
            ? "Finding your next workspace…"
            : `${filtered.length} plans · billed every 30 days, manually renewed`}
        </span>
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Find a plan</span>
          <Search className="absolute left-3 top-4 muted" size={16} />
          <input
            className="!mt-0 !pl-10"
            type="search"
            placeholder="Find a plan…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {loading ? (
        <div className="grid md:grid-cols-3 gap-5" aria-label="Loading plans">
          {[1, 2, 3].map((n) => (
            <div key={n} className="panel p-8 h-80 animate-pulse">
              <div className="h-8 w-24 rounded bg-white/5" />
              <div className="h-4 mt-8 rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="panel p-10 text-center muted">
          No plans found. Try another search.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <article className="panel plan-card" key={p.id}>
              <div className="flex justify-between items-center gap-3">
                <span className="p-3 rounded-xl bg-lime-200/5 border border-lime-200/10">
                  <Server size={22} className="text-lime-200" />
                </span>
                <span className="badge">
                  {p.stock > 0 ? "AVAILABLE TO ORDER" : "OUT OF STOCK"}
                </span>
              </div>
              <h3 className="text-xl mt-6 mb-3">{p.name}</h3>
              <p className="muted text-xs leading-relaxed min-h-10">
                {p.description || planDescription}
              </p>
              <div className="my-6 flex items-baseline gap-2">
                <strong className="text-4xl tracking-tighter">
                  {money(p.baseCents)}
                </strong>
                <span className="muted text-xs">/ 30 days</span>
              </div>
              <dl className="mb-6">
                <div className="spec-row">
                  <dt>
                    <Cpu size={16} />
                    Processor
                  </dt>
                  <dd>{p.cpu} vCPU</dd>
                </div>
                <div className="spec-row">
                  <dt>
                    <MemoryStick size={16} />
                    Memory
                  </dt>
                  <dd>{p.ram} GB RAM</dd>
                </div>
                <div className="spec-row">
                  <dt>
                    <HardDrive size={16} />
                    Storage
                  </dt>
                  <dd>{p.disk} GB SSD</dd>
                </div>
              </dl>
              <p className="flex gap-2 items-center text-xs muted mb-6">
                <Check size={14} className="text-lime-200" /> Country & OS
                selected in cart
              </p>
              <button
                className="primary w-full mt-auto"
                disabled={!p.stock}
                onClick={() => add(p)}
              >
                Add to cart <ArrowUpRight size={17} />
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
