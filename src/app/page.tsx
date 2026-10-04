"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Globe2,
  Server,
  Wallet,
  LayoutDashboard,
  Shield,
  ArrowUpRight,
  Plus,
  Copy,
  Download,
  RotateCw,
  Trash2,
  LogOut,
  Check,
  ChevronRight,
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
} from "lucide-react";
import { price, money } from "@/lib/domain";
type Plan = {
  id: string;
  name: string;
  region: string;
  location: string;
  os: string;
  cpu: number;
  ram: number;
  disk: number;
  baseCents: number;
  stock: number;
};
type Instance = {
  id: string;
  plan: Plan;
  cpu: number;
  ram: number;
  disk: number;
  priceCents: number;
  status: string;
  ip: string | null;
  username: string | null;
  uptimeSeconds: number;
  bandwidthBytes: string;
  expiresAt: string;
};
type Me = {
  id: string;
  email: string;
  role: string;
  wallet: number;
  demo: boolean;
  ledger: { id: string; kind: string; amount: number; createdAt: string }[];
};
type Admin = {
  revenue: number;
  active: number;
  users: {
    id: string;
    email: string;
    role: string;
    wallet: number;
    disabled: boolean;
  }[];
  plans: Plan[];
  jobs: { id: string; action: string; error: string }[];
};
async function api(path: string, data?: unknown) {
  const r = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Request failed");
  return j;
}
export default function Home() {
  const [tab, setTab] = useState("Overview"),
    [me, setMe] = useState<Me | null>(null),
    [plans, setPlans] = useState<Plan[]>([]),
    [instances, setInstances] = useState<Instance[]>([]),
    [admin, setAdmin] = useState<Admin | null>(null),
    [region, setRegion] = useState(""),
    [os, setOs] = useState(""),
    [cpu, setCpu] = useState("0"),
    [ram, setRam] = useState("0"),
    [disk, setDisk] = useState("0"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<"auth" | "configure" | "fund" | null>(null),
    [register, setRegister] = useState(false),
    [plan, setPlan] = useState<Plan | null>(null),
    [config, setConfig] = useState({ cpu: 2, ram: 4, disk: 80 }),
    [fund, setFund] = useState(5000),
    [key, setKey] = useState(""),
    [credentials, setCredentials] = useState<{
      id: string;
      ip: string;
      username: string;
      password: string;
    } | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current
      ?.querySelector<HTMLElement>("input,button,select,a")
      ?.focus();
    return () => previous?.focus();
  }, [modal]);
  const refresh = useCallback(async () => {
    try {
      const m = await api("me");
      setMe(m);
      setInstances(await api("instances"));
      if (m.role === "ADMIN") setAdmin(await api("admin"));
    } catch (e) {
      if ((e as Error).message === "Please sign in") {
        setMe(null);
        setInstances([]);
        setAdmin(null);
        setCredentials(null);
      } else setNotice((e as Error).message);
    }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ cpu, ram, disk });
    if (region) q.set("region", region);
    if (os) q.set("os", os);
    api("catalog?" + q)
      .then((v) => {
        if (live) setPlans(v);
      })
      .catch((e) => setNotice(e.message));
    return () => {
      live = false;
    };
  }, [region, os, cpu, ram, disk]);
  useEffect(() => {
    if (!credentials) return;
    const t = setTimeout(() => setCredentials(null), 30000);
    return () => clearTimeout(t);
  }, [credentials]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function configure(p: Plan) {
    if (!me) {
      setModal("auth");
      return;
    }
    setPlan(p);
    setConfig({ cpu: p.cpu, ram: p.ram, disk: p.disk });
    setKey(crypto.randomUUID());
    setModal("configure");
  }
  function funding() {
    setKey(crypto.randomUUID());
    setModal(me ? "fund" : "auth");
  }
  const nav = [
    "Overview",
    "Marketplace",
    "My instances",
    "Billing",
    ...(me?.role === "ADMIN" ? ["Admin"] : []),
  ];
  return (
    <div className="min-h-screen lg:flex">
      <aside className="lg:w-64 lg:fixed lg:inset-y-0 border-r border-slate-800 p-6 flex flex-col bg-[#0d131d]">
        <a href="/" className="flex items-center gap-3 font-bold text-lg">
          <Globe2 className="text-lime-300" size={30} />
          GlobalRDP <span className="text-lime-300">Hub</span>
        </a>
        <p className="text-[10px] tracking-[.23em] muted mt-10 mb-4">
          WORKSPACE
        </p>
        <nav className="flex lg:flex-col gap-2 overflow-auto">
          {nav.map((n, i) => {
            const Icon = [LayoutDashboard, Globe2, Server, Wallet, Shield][i];
            return (
              <button
                key={n}
                onClick={() => setTab(n)}
                className={`flex items-center gap-3 rounded-lg p-3 text-sm text-left whitespace-nowrap ${tab === n ? "bg-lime-300/10 text-lime-300" : "text-slate-400 hover:bg-slate-800"}`}
              >
                <Icon size={18} />
                {n}
                {n === "My instances" && (
                  <span className="ml-auto">{instances.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto pt-12">
          <div className="panel p-4">
            <div className="flex gap-2 items-center text-xs">
              <span className="w-2 h-2 rounded-full bg-lime-300" />
              Your cloud, connected
            </div>
            <p className="muted text-xs mt-3">
              Compute across three global regions.
            </p>
          </div>
          <div className="mt-5 text-xs truncate muted">
            {me?.email ?? "Guest workspace"}
          </div>
          {me && (
            <button
              className="mt-3 text-xs flex gap-2 muted"
              onClick={() =>
                run(async () => {
                  await api("auth/logout", {});
                  setCredentials(null);
                  setMe(null);
                  setTab("Overview");
                })
              }
            >
              <LogOut size={14} />
              Sign out
            </button>
          )}
        </div>
      </aside>
      <main className="lg:ml-64 flex-1 min-w-0">
        <header className="h-20 px-6 lg:px-10 border-b border-slate-800 flex justify-between items-center">
          <div className="text-sm muted">
            Workspace <ChevronRight className="inline mx-2" size={13} />
            <span className="text-slate-200">{tab}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm hidden sm:block muted">
              USD{" "}
              <span className="text-white ml-2">{money(me?.wallet ?? 0)}</span>
            </span>
            <button
              className="secondary text-xs"
              onClick={() => (me ? funding() : setModal("auth"))}
            >
              {me ? "Add funds" : "Sign in"}{" "}
              <Plus className="inline ml-2" size={14} />
            </button>
          </div>
        </header>
        <div className="p-6 lg:p-10 max-w-[1500px] mx-auto">
          {me?.demo && (
            <div className="mb-5 border border-amber-800 bg-amber-950/30 text-amber-200 rounded-lg p-3 text-xs">
              DEMO ENVIRONMENT · Test credits and simulated instances.
              Connection addresses are not real servers.
            </div>
          )}
          {notice && (
            <div
              role="alert"
              className="mb-5 panel border-amber-700 p-4 flex justify-between"
            >
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-4 items-center mb-8">
            <div>
              <p className="text-lime-300 text-xs tracking-widest mb-3">
                GLOBAL INFRASTRUCTURE / YOUR CONTROL
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                {tab === "Overview" ? "Your cloud, without borders." : tab}
              </h1>
              <p className="muted text-sm mt-3">
                {tab === "Overview"
                  ? "Deploy globally. Connect instantly. Make room for what’s next."
                  : "Manage your infrastructure from one secure workspace."}
              </p>
            </div>
            <button
              className="primary text-sm"
              onClick={() => setTab("Marketplace")}
            >
              <Plus size={16} className="inline mr-2" />
              Deploy a server
            </button>
          </div>
          {tab === "Overview" && (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                {[
                  [
                    Server,
                    "Active instances",
                    instances.filter((i) => i.status === "ACTIVE").length,
                    "Your running infrastructure",
                  ],
                  [
                    Wallet,
                    "Wallet balance",
                    money(me?.wallet ?? 0),
                    "Available for deployments",
                  ],
                  [Globe2, "Global regions", "03", "US · Europe · Asia"],
                  [
                    Activity,
                    "Billing period",
                    "30 days",
                    "Prepaid, no automatic renewal",
                  ],
                ].map(([Icon, title, value, sub]) => {
                  const I = Icon as typeof Server;
                  return (
                    <div key={String(title)} className="panel p-5">
                      <div className="flex justify-between muted text-sm">
                        {String(title)}
                        <I size={18} />
                      </div>
                      <div className="text-3xl mt-5 mb-3">{String(value)}</div>
                      <div className="text-xs muted">{String(sub)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="panel p-7 mb-9 relative overflow-hidden bg-gradient-to-r from-[#182c2c] to-[#101722]">
                <div className="absolute right-12 top-5 opacity-10">
                  <Globe2 size={190} />
                </div>
                <span className="badge">BUILT TO GO FURTHER</span>
                <h2 className="text-2xl mt-5 mb-3 relative">
                  Big ideas need powerful servers.
                </h2>
                <p className="muted text-sm max-w-lg relative">
                  Windows RDP and Linux VPS, flexible configurations, and a
                  single wallet. Choose your region and build your next
                  workspace.
                </p>
                <button
                  className="mt-6 text-lime-300 text-sm"
                  onClick={() => setTab("Marketplace")}
                >
                  Explore the marketplace{" "}
                  <ArrowUpRight className="inline ml-2" size={16} />
                </button>
              </div>
            </>
          )}
          {["Overview", "Marketplace"].includes(tab) && (
            <>
              <div className="flex justify-between mb-5">
                <h2 className="text-xl">Find your next server</h2>
                <span className="muted text-sm">
                  {plans.length} configurations
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                <label>
                  Region
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    <option value="">All regions</option>
                    <option value="US">United States</option>
                    <option value="EU">Europe</option>
                    <option value="ASIA">Asia Pacific</option>
                  </select>
                </label>
                <label>
                  Operating system
                  <select value={os} onChange={(e) => setOs(e.target.value)}>
                    <option value="">All systems</option>
                    <option>Windows Server 2019</option>
                    <option>Windows Server 2022</option>
                    <option>Ubuntu 24.04</option>
                  </select>
                </label>
                {[
                  ["Min. vCPU", cpu, setCpu, [0, 2, 4, 8, 16]],
                  ["Min. RAM (GB)", ram, setRam, [0, 4, 8, 16, 32]],
                  ["Min. SSD (GB)", disk, setDisk, [0, 80, 160, 320]],
                ].map(([label, v, set, options]) => (
                  <label key={String(label)}>
                    {String(label)}
                    <select
                      value={v as string}
                      onChange={(e) =>
                        (set as (v: string) => void)(e.target.value)
                      }
                    >
                      {(options as number[]).map((n) => (
                        <option key={n} value={n}>
                          {n || "Any"}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                {plans.map((p) => (
                  <article className="panel p-6" key={p.id}>
                    <div className="flex justify-between">
                      <div className="p-3 rounded-xl bg-slate-800">
                        <Server size={22} className="text-lime-300" />
                      </div>
                      <span className="badge h-fit">
                        {p.stock > 0 ? `${p.stock} available` : "Sold out"}
                      </span>
                    </div>
                    <h3 className="text-lg mt-5">{p.name}</h3>
                    <p className="muted text-xs mt-2">
                      {p.location} · {p.region} / {p.os}
                    </p>
                    <div className="grid grid-cols-3 my-6 border-y border-slate-800 py-4 text-sm">
                      <div>
                        <Cpu size={15} className="muted mb-2" />
                        {p.cpu} vCPU
                      </div>
                      <div>
                        <MemoryStick size={15} className="muted mb-2" />
                        {p.ram} GB
                      </div>
                      <div>
                        <HardDrive size={15} className="muted mb-2" />
                        {p.disk} GB
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-2xl">{money(p.baseCents)}</span>
                        <span className="muted text-xs"> / 30d</span>
                      </div>
                      <button
                        disabled={!p.stock || busy}
                        className="secondary text-xs"
                        onClick={() => configure(p)}
                      >
                        Configure <ArrowUpRight className="inline" size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!plans.length && (
                <p className="panel p-8 muted">No plans match these filters.</p>
              )}
            </>
          )}
          {tab === "My instances" && (
            <div className="space-y-4">
              {instances.length === 0 && (
                <div className="panel p-10 muted">
                  No instances yet. Choose a server in the marketplace.
                </div>
              )}
              {instances.map((i) => (
                <article key={i.id} className="panel p-6">
                  <div className="flex justify-between gap-4">
                    <div>
                      <h2>
                        {i.plan.location} · {i.plan.os}
                      </h2>
                      <p className="muted text-xs mt-2">
                        {i.id} · {i.cpu} vCPU / {i.ram} GB RAM / {i.disk} GB SSD
                      </p>
                    </div>
                    <span className="badge h-fit">{i.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-6 my-5 text-sm muted">
                    <span>IP: {i.ip ?? "Awaiting provisioning"}</span>
                    <span>Uptime: {Math.floor(i.uptimeSeconds / 3600)}h</span>
                    <span>
                      Bandwidth: {(Number(i.bandwidthBytes) / 1e9).toFixed(2)}{" "}
                      GB
                    </span>
                    <span>
                      Expires: {new Date(i.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      disabled={busy || i.status !== "ACTIVE"}
                      className="secondary text-xs"
                      onClick={() =>
                        run(async () =>
                          setCredentials({
                            id: i.id,
                            ...(await api(`instances/${i.id}/credentials`, {})),
                          }),
                        )
                      }
                    >
                      Reveal connection
                    </button>
                    {i.plan.os.startsWith("Windows") &&
                      i.status === "ACTIVE" && (
                        <a
                          className="secondary text-xs"
                          href={`/api/instances/${i.id}/rdp`}
                        >
                          <Download className="inline mr-1" size={13} />
                          RDP file
                        </a>
                      )}
                    <button
                      disabled={busy || i.status !== "ACTIVE"}
                      className="secondary text-xs"
                      onClick={() =>
                        run(async () => {
                          await api(`instances/${i.id}/restart`, {});
                        })
                      }
                    >
                      <RotateCw className="inline mr-1" size={13} />
                      Restart
                    </button>
                    <button
                      disabled={busy || i.status !== "ACTIVE"}
                      className="secondary text-xs text-red-300"
                      onClick={() => {
                        if (
                          confirm(
                            "Permanently terminate this server? Data will be lost. Prepaid time is not refunded.",
                          )
                        )
                          run(async () => {
                            await api(`instances/${i.id}/terminate`, {});
                          });
                      }}
                    >
                      <Trash2 className="inline mr-1" size={13} />
                      Terminate
                    </button>
                  </div>
                  {credentials?.id === i.id && (
                    <div className="mt-4 p-4 rounded-lg bg-slate-950 text-sm space-y-2">
                      {(["ip", "username", "password"] as const).map((k) => (
                        <div
                          key={k}
                          className="flex justify-between gap-3 break-all"
                        >
                          <span>
                            {k}: {credentials[k]}
                          </span>
                          <button
                            aria-label={`Copy ${k}`}
                            onClick={() =>
                              run(async () => {
                                await navigator.clipboard.writeText(
                                  credentials[k],
                                );
                                setNotice("Copied");
                              })
                            }
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      ))}
                      <p className="muted text-xs">
                        Hidden automatically after 30 seconds.
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === "Billing" && (
            <>
              <div className="panel p-6 mb-6 flex justify-between items-center">
                <div>
                  <p className="muted text-sm">Available wallet balance</p>
                  <p className="text-3xl mt-2">{money(me?.wallet ?? 0)}</p>
                </div>
                <button className="primary" onClick={funding}>
                  Add funds
                </button>
              </div>
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
                        <td>
                          {l.kind}
                          <div className="muted text-xs">{l.id}</div>
                        </td>
                        <td>{new Date(l.createdAt).toLocaleString()}</td>
                        <td className={l.amount > 0 ? "text-lime-300" : ""}>
                          {money(l.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!me?.ledger.length && (
                  <p className="p-8 muted">No transactions yet.</p>
                )}
              </div>
            </>
          )}
          {tab === "Admin" && admin && (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="panel p-6">
                  Gross server sales{" "}
                  <strong className="block text-3xl mt-3">
                    {money(admin.revenue)}
                  </strong>
                </div>
                <div className="panel p-6">
                  Active servers{" "}
                  <strong className="block text-3xl mt-3">
                    {admin.active}
                  </strong>
                </div>
              </div>
              <h2 className="text-xl">Inventory</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {admin.plans.map((p) => (
                  <form
                    key={p.id}
                    className="panel p-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      run(async () => {
                        await api("admin", {
                          action: "stock",
                          id: p.id,
                          stock: Number(data.get("stock")),
                        });
                      });
                    }}
                  >
                    <p className="text-sm mb-3">
                      {p.location} · {p.os}
                    </p>
                    <div className="flex gap-3">
                      <input
                        aria-label="Available stock"
                        name="stock"
                        type="number"
                        min="0"
                        max="10000"
                        defaultValue={p.stock}
                        required
                      />
                      <button disabled={busy} className="secondary">
                        Restock
                      </button>
                    </div>
                  </form>
                ))}
              </div>
              <h2 className="text-xl">Users</h2>
              <div className="panel overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Wallet</th>
                      <th>Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admin.users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>{money(u.wallet)}</td>
                        <td>
                          {u.role === "ADMIN" ? (
                            "Administrator"
                          ) : (
                            <button
                              disabled={busy}
                              className="secondary"
                              onClick={() =>
                                run(async () => {
                                  await api("admin", {
                                    action: "disable",
                                    id: u.id,
                                    disabled: !u.disabled,
                                  });
                                })
                              }
                            >
                              {u.disabled ? "Enable" : "Disable"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h2 className="text-xl">Failed provisioning jobs</h2>
              {admin.jobs.length === 0 ? (
                <p className="muted">No failed jobs.</p>
              ) : (
                admin.jobs.map((j) => (
                  <div className="panel p-4" key={j.id}>
                    {j.action} · {j.id}
                    <p className="muted text-sm">{j.error}</p>
                    <button
                      className="secondary mt-3"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api("admin", { action: "retry", id: j.id });
                        })
                      }
                    >
                      Retry safely
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          <footer className="mt-12 pt-6 border-t border-slate-800 muted text-xs flex justify-between">
            <span>© {new Date().getFullYear()} GlobalRDP Hub</span>
            <span>Infrastructure for your next chapter.</span>
          </footer>
        </div>
      </main>
      {modal && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setModal(null);
          }}
        >
          <section
            ref={dialogRef}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
              );
              if (!nodes?.length) return;
              const first = nodes[0],
                last = nodes[nodes.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="panel p-7 w-full max-w-lg max-h-[90vh] overflow-auto"
          >
            <div className="flex justify-between mb-6">
              <h2 id="modal-title" className="text-xl">
                {modal === "auth"
                  ? register
                    ? "Create your account"
                    : "Welcome back"
                  : modal === "fund"
                    ? "Fund your wallet"
                    : "Configure your server"}
              </h2>
              <button
                disabled={busy}
                aria-label="Close dialog"
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </div>
            {notice && (
              <p role="alert" className="text-amber-300 text-sm mb-4">
                {notice}
              </p>
            )}
            {modal === "auth" && (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  run(async () => {
                    await api(
                      `auth/${register ? "register" : "login"}`,
                      Object.fromEntries(d),
                    );
                    setModal(null);
                  });
                }}
              >
                <label>
                  Email
                  <input
                    autoFocus
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    minLength={12}
                    maxLength={72}
                    required
                  />
                </label>
                <p className="muted text-xs">
                  Use at least 12 characters. Sessions expire after 8 hours.
                </p>
                <button disabled={busy} className="primary w-full">
                  {busy
                    ? "Please wait…"
                    : register
                      ? "Create account"
                      : "Sign in"}
                </button>
                <button
                  type="button"
                  className="text-sm muted"
                  onClick={() => setRegister(!register)}
                >
                  {register
                    ? "Already have an account? Sign in"
                    : "New here? Create an account"}
                </button>
              </form>
            )}
            {modal === "configure" && plan && (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    await api("instances", {
                      planId: plan.id,
                      ...config,
                      requestKey: key,
                    });
                    setModal(null);
                    setTab("My instances");
                    setNotice("Order received. Provisioning has been queued.");
                  });
                }}
              >
                <p className="muted text-sm">
                  {plan.location} · {plan.os}
                </p>
                {(["cpu", "ram", "disk"] as const).map((k) => (
                  <label key={k}>
                    {k === "cpu"
                      ? "CPU cores"
                      : k === "ram"
                        ? "Memory (GB)"
                        : "SSD storage (GB)"}
                    <input
                      type="number"
                      required
                      min={plan[k]}
                      max={k === "cpu" ? 32 : k === "ram" ? 128 : 2000}
                      value={config[k]}
                      onChange={(e) =>
                        setConfig({ ...config, [k]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
                <div className="border-t border-slate-700 pt-4 flex justify-between">
                  <span>30-day total</span>
                  <strong>
                    {config.cpu >= plan.cpu &&
                    config.ram >= plan.ram &&
                    config.disk >= plan.disk
                      ? money(price(plan, config))
                      : "Invalid specs"}
                  </strong>
                </div>
                <p className="muted text-xs">
                  One prepaid term. Expires after 30 days; no automatic renewal.
                  Termination permanently deletes server data and does not
                  refund remaining time.
                </p>
                <button disabled={busy} className="primary w-full">
                  Pay with wallet & deploy
                </button>
              </form>
            )}
            {modal === "fund" && (
              <div className="space-y-4">
                <label>
                  Amount (USD)
                  <input
                    autoFocus
                    type="number"
                    min="5"
                    max="1000"
                    step="1"
                    value={fund / 100}
                    onChange={(e) =>
                      setFund(Math.round(Number(e.target.value) * 100))
                    }
                  />
                </label>
                <p className="muted text-xs">
                  Credits are added after a verified payment confirmation.
                </p>
                {["stripe", "crypto", ...(me?.demo ? ["demo"] : [])].map(
                  (provider) => (
                    <button
                      key={provider}
                      className="secondary w-full flex justify-between"
                      disabled={busy || fund < 500 || fund > 100000}
                      onClick={() =>
                        run(async () => {
                          const r = await api("funding", {
                            cents: fund,
                            provider,
                            requestKey: key,
                          });
                          if (r.url) window.location.assign(r.url);
                          else {
                            setModal(null);
                            setNotice("Wallet funded.");
                          }
                        })
                      }
                    >
                      {provider === "stripe"
                        ? "Pay by card · Stripe"
                        : provider === "crypto"
                          ? "Pay with crypto"
                          : "Add demo credits"}
                      <ArrowUpRight size={16} />
                    </button>
                  ),
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
