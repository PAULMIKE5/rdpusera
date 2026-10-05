"use client";
import { useEffect, useState } from "react";
import { Server, ArrowUpRight } from "lucide-react";
import { api, useWorkspace } from "./workspace";
import type { Plan } from "./types";
import { countries, operatingSystems, planDescription } from "@/lib/countries";
import { money, price } from "@/lib/domain";
export function Catalog() {
  const [plans, setPlans] = useState<Plan[]>([]),
    [loading, setLoading] = useState(true),
    [region, setRegion] = useState(""),
    [country, setCountry] = useState(""),
    [os, setOs] = useState(""),
    [minimum, setMinimum] = useState({ cpu: 0, ram: 0, disk: 0 });
  const { cart, setCart, setNotice } = useWorkspace();
  useEffect(() => {
    api("catalog")
      .then(setPlans)
      .catch((e) => setNotice(e.message))
      .finally(() => setLoading(false));
  }, [setNotice]);
  const filtered = plans.filter(
    (p) =>
      (!region || p.region === region) &&
      (!country ||
        p.countryCode === country ||
        p.location === countries.find((c) => c.code === country)?.name) &&
      (!os ||
        p.os === os ||
        (os === "Windows" && p.os.startsWith("Windows")) ||
        (os === "Ubuntu" && p.os.startsWith("Ubuntu"))) &&
      p.cpu >= minimum.cpu &&
      p.ram >= minimum.ram &&
      p.disk >= minimum.disk,
  );
  function add(p: Plan, s: { cpu: number; ram: number; disk: number }) {
    if (cart.reduce((n, l) => n + l.quantity, 0) >= 20) {
      setNotice("Maximum 20 servers in one cart");
      return;
    }
    const index = cart.findIndex(
      (l) =>
        l.planId === p.id &&
        l.cpu === s.cpu &&
        l.ram === s.ram &&
        l.disk === s.disk,
    );
    if (index >= 0) {
      if (cart[index].quantity >= Math.min(10, p.stock)) {
        setNotice("Maximum available quantity reached");
        return;
      }
      setCart(
        cart.map((l, n) =>
          n === index ? { ...l, quantity: l.quantity + 1 } : l,
        ),
      );
    } else
      setCart([
        ...cart,
        {
          planId: p.id,
          name: p.name,
          ...s,
          quantity: 1,
          estimate: price(p, s),
        },
      ]);
    setNotice("Added to your cart");
  }
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <label>
          Region
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {[...new Set(plans.map((p) => p.region))].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Country
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Operating system
          <select value={os} onChange={(e) => setOs(e.target.value)}>
            <option value="">All systems</option>
            {[...new Set([...operatingSystems, ...plans.map((p) => p.os)])].map(
              (r) => (
                <option key={r}>{r}</option>
              ),
            )}
          </select>
        </label>
        {(["cpu", "ram", "disk"] as const).map((k) => (
          <label key={k}>
            Minimum {k.toUpperCase()}
            <input
              type="number"
              min="0"
              value={minimum[k]}
              onChange={(e) =>
                setMinimum({ ...minimum, [k]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      {loading ? (
        <p className="muted">Loading plans…</p>
      ) : !filtered.length ? (
        <div className="panel p-8">No plans available for these filters.</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <PlanCard key={p.id} plan={p} add={(s) => add(p, s)} />
          ))}
        </div>
      )}
    </>
  );
}
function PlanCard({
  plan: p,
  add,
}: {
  plan: Plan;
  add: (s: { cpu: number; ram: number; disk: number }) => void;
}) {
  const [s, setS] = useState({ cpu: p.cpu, ram: p.ram, disk: p.disk });
  const valid = s.cpu >= p.cpu && s.ram >= p.ram && s.disk >= p.disk;
  return (
    <form
      className="panel p-6"
      onSubmit={(e) => {
        e.preventDefault();
        add(s);
      }}
    >
      <div className="flex justify-between">
        <Server className="text-lime-300" />
        <span className="badge">{p.stock} available</span>
      </div>
      <h3 className="text-xl mt-5">{p.name}</h3>
      <p className="muted text-sm my-3">
        {p.location} · {p.os}
      </p>
      <p className="muted text-sm">{p.description || planDescription}</p>
      <div className="grid grid-cols-3 gap-2 my-5">
        {(["cpu", "ram", "disk"] as const).map((k) => (
          <label key={k}>
            {k === "cpu" ? "vCPU" : k === "ram" ? "RAM GB" : "SSD GB"}
            <input
              aria-label={`${p.name} ${k}`}
              type="number"
              required
              min={p[k]}
              max={k === "cpu" ? 32 : k === "ram" ? 128 : 2000}
              value={s[k]}
              onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <p className="text-2xl my-5">
        {valid ? money(price(p, s)) : "—"}
        <span className="muted text-xs"> / 30 days</span>
      </p>
      <button className="primary w-full" disabled={!p.stock || !valid}>
        Add to cart <ArrowUpRight className="inline ml-2" size={16} />
      </button>
    </form>
  );
}
