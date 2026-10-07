"use client";
import { useEffect, useState, useCallback } from "react";
import {
  AdminOverview,
  AccountCreate,
  BalanceEditor,
  Transactions,
  AssignServer,
  CreateOrder,
  EmailTools,
  countryField,
} from "./admin-tools";
import { ChatPanel } from "./chat-panel";
import {
  LayoutDashboard,
  Users,
  Server,
  CreditCard,
  MessageCircle,
  Settings2,
} from "lucide-react";
import { api, useWorkspace } from "./workspace";
import {
  checkoutSystems,
  countries,
  operatingSystems,
  planDescription,
} from "@/lib/countries";
import { dollarsToCents } from "@/lib/money";
import { money } from "@/lib/domain";
import type { Plan, Order, Instance, Method } from "./types";
type Location = { id: string; name: string; region: string; enabled: boolean };
type Inventory = {
  id: string;
  planId: string;
  label: string;
  countryCode: string | null;
  os: string | null;
  ip: string;
  port: number;
  state: string;
};
export type AdminData = {
  totalUsers: number;
  pending: number;
  available: number;
  trend: { day: string; cents: number }[];
  transactions: {
    id: string;
    cents: number;
    notes: string;
    provider: string;
    status: string;
    providerId: string | null;
    chargeCurrency: string;
    chargeAmount: string | null;
    exchangeRate: string | null;
    createdAt: string;
    version: number;
    user: { email: string };
  }[];
  emailAttempts: {
    id: string;
    purpose: string;
    code: string;
    status: string;
    httpStatus: number | null;
    createdAt: string;
    help: string;
  }[];
  audits: {
    id: string;
    action: string;
    targetId: string;
    actorId: string;
    createdAt: string;
    details: unknown;
  }[];
  revenue: number;
  active: number;
  users: {
    id: string;
    email: string;
    name: string;
    countryCode: string | null;
    role: string;
    disabled: boolean;
    emailVerificationRequired: boolean;
    emailVerifiedAt: string | null;
    wallet: number;
  }[];
  plans: Plan[];
  locations: Location[];
  methods: Method[];
  keys: { name: string; configured: boolean; source: string }[];
  orders: (Order & { notes: string; deletedAt: string | null })[];
  instances: Instance[];
  inventory: Inventory[];
  jobs: {
    id: string;
    action: string;
    state: string;
    instance: { ip: string | null; user: { email: string } };
  }[];
  page: number;
  pages: number;
};
import { Editor, password, type Field } from "./admin-editor";
export function AdminPanel() {
  const { setNotice } = useWorkspace();
  const [data, setData] = useState<AdminData | null>(null),
    [tab, setTab] = useState("Overview"),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    setData(
      await api(
        `admin?page=${page}&q=${encodeURIComponent(search)}&archived=${archived}`,
      ),
    );
  }, [page, search, archived]);
  useEffect(() => {
    load().catch((e) => setNotice(e.message));
  }, [load, setNotice]);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  function selectTab(t: string) {
    setTab(t);
    setPage(0);
    setQ("");
    setSearch("");
    setArchived(false);
  }
  useEffect(() => {
    const handler = () => {
      load().catch((e) => setNotice(e.message));
    };
    window.addEventListener("admin-refresh", handler);
    return () => window.removeEventListener("admin-refresh", handler);
  }, [load, setNotice]);
  async function save(value: unknown) {
    await api("admin", value);
    await load();
    setRevision((n) => n + 1);
    setNotice("Admin changes saved");
  }
  async function click(value: unknown) {
    try {
      await save(value);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  if (!data) return <p>Loading administrator workspace…</p>;
  const planOptions = data.plans.map((p) => ({
    value: p.id,
    label: `${p.name} · ${p.location} · ${p.os}`,
  }));
  function planFields(p?: Plan): Field[] {
    return [
      { name: "name", label: "Plan name", value: p?.name },
      {
        name: "description",
        label: "Plan description",
        type: "textarea",
        value: p?.description ?? planDescription,
      },
      {
        name: "countryCode",
        label: "Server country (100 countries)",
        value: p?.countryCode,
        optional: !!p?.locationId,
        options: countries.map((c) => ({ value: c.code, label: c.name })),
      },
      {
        name: "os",
        label: "Operating system",
        value: p?.os ?? "Windows",
        options: operatingSystems.map((v) => ({ value: v, label: v })),
      },
      ...(["cpu", "ram", "disk"] as const).map((k) => ({
        name: k,
        label: k.toUpperCase(),
        type: "number" as const,
        value: p?.[k] ?? (k === "cpu" ? 2 : k === "ram" ? 4 : 80),
        min: k === "disk" ? 20 : 1,
        max: k === "cpu" ? 32 : k === "ram" ? 128 : 2000,
      })),
      {
        name: "price",
        label: "Price in USD / 30 days",
        type: "number",
        value: (p?.baseCents ?? 2400) / 100,
        step: 0.01,
        min: 0.1,
        max: 1000,
      },
      {
        name: "stock",
        label: "Available capacity slots",
        type: "number",
        value: p?.stock ?? 0,
        min: 0,
        max: 10000,
      },
      {
        name: "enabled",
        label: "Visible in marketplace",
        type: "checkbox",
        value: p?.enabled ?? true,
      },
    ];
  }
  function locationFields(l?: Location): Field[] {
    return [
      { name: "name", label: "Location name", value: l?.name },
      {
        name: "region",
        label: "Region code (US, EU, ASIA, etc.)",
        value: l?.region,
      },
      {
        name: "enabled",
        label: "Available to customers",
        type: "checkbox",
        value: l?.enabled ?? true,
      },
    ];
  }
  function methodFields(m?: Method): Field[] {
    return [
      { name: "label", label: "Display name", value: m?.label },
      {
        name: "provider",
        label: "Provider (cannot change after creation)",
        value: m?.provider ?? "manual",
        options: [
          { value: "flutterwave", label: "Flutterwave · USD cards" },
          {
            value: "flutterwave_ngn",
            label: "Flutterwave · NGN bank transfer, cards & USSD",
          },
          { value: "nowpayments", label: "NOWPayments (crypto)" },
          ...(m && ["stripe", "crypto"].includes(m.provider)
            ? [{ value: m.provider, label: "Legacy (disabled)" }]
            : []),
          { value: "manual", label: "Manual / bank transfer" },
        ],
      },
      {
        name: "instructions",
        label: "Customer payment instructions (never put secret API keys here)",
        type: "textarea",
        value: m?.instructions,
      },
      {
        name: "usdToNgn",
        label: "NGN per $1 (required for Naira; ignored for other methods)",
        value: m?.usdToNgn ?? "",
        optional: true,
      },
      {
        name: "enabled",
        label: "Enabled at checkout",
        type: "checkbox",
        value: m?.enabled ?? false,
      },
    ];
  }
  function connectionFields(): Field[] {
    return [
      { name: "ip", label: "Server IP address" },
      {
        name: "port",
        label: "RDP / SSH port",
        type: "number",
        min: 1,
        max: 65535,
        value: 3389,
      },
      { name: "username", label: "Server username", value: "Administrator" },
      { name: "password", label: "Server password", type: "password" },
    ];
  }
  return (
    <>
      <div className="flex justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-3xl">Admin control center</h1>
          <p className="muted mt-2">
            Manage your catalog, customers, payments and inventory delivery.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() =>
            load()
              .then(() => setRevision((n) => n + 1))
              .catch((e) => setNotice(e.message))
          }
        >
          Refresh
        </button>
      </div>
      <div className="admin-layout">
        <aside className="admin-sidebar panel">
          <p className="eyebrow px-3 mb-4">WORKSPACE</p>
          <nav aria-label="Administration">
            {[
              { name: "Overview", icon: LayoutDashboard },
              { name: "Orders", icon: CreditCard },
              { name: "Users", icon: Users },
              { name: "Transactions", icon: CreditCard },
              { name: "Inbox", icon: MessageCircle },
              { name: "Assign server", icon: Server },
              { name: "Instances", icon: Server },
              { name: "Available servers", icon: Server },
              { name: "Service requests", icon: Settings2 },
              { name: "Plans", icon: Settings2 },
              { name: "Locations", icon: Settings2 },
              { name: "Payments", icon: CreditCard },
              { name: "Email", icon: MessageCircle },
              { name: "System keys", icon: Settings2 },
              { name: "Audit log", icon: LayoutDashboard },
            ].map(({ name, icon: Icon }) => (
              <button
                key={name}
                aria-current={tab === name ? "page" : undefined}
                className={tab === name ? "admin-nav active" : "admin-nav"}
                onClick={() => selectTab(name)}
              >
                <Icon size={17} />
                {name}
                {name === "Orders" && data.pending > 0 && (
                  <span className="ml-auto text-xs">{data.pending}</span>
                )}
              </button>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">
          <div className="flex flex-wrap gap-4 items-end justify-between mb-5">
            <div>
              <p className="eyebrow mb-2">ADMINISTRATION</p>
              <h2 className="text-2xl">{tab}</h2>
            </div>
            {["Orders", "Users", "Instances", "Transactions"].includes(tab) && (
              <div className="flex flex-wrap gap-3 items-end">
                <label>
                  Search
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Name, email or order ID"
                  />
                </label>
                {["Orders", "Transactions"].includes(tab) && (
                  <label>
                    Records
                    <select
                      value={String(archived)}
                      onChange={(e) => {
                        setArchived(e.target.value === "true");
                        setPage(0);
                      }}
                    >
                      <option value="false">Current</option>
                      <option value="true">Deleted / restore</option>
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
          <div key={`${tab}-${page}-${revision}-${search}-${archived}`}>
            {tab === "Overview" && (
              <AdminOverview data={data} onSelect={selectTab} />
            )}
            {tab === "Transactions" && (
              <Transactions data={data} save={save} archived={archived} />
            )}
            {tab === "Assign server" && (
              <AssignServer data={data} save={save} />
            )}
            {tab === "Inbox" && <ChatPanel admin />}
            {tab === "Email" && (
              <EmailTools data={data} save={save} reload={load} />
            )}
            {tab === "Audit log" && (
              <div className="space-y-3">
                {data.audits.map((a) => (
                  <details key={a.id} className="panel p-4">
                    <summary className="cursor-pointer break-words">
                      {a.action} · {new Date(a.createdAt).toLocaleString()}
                    </summary>
                    <p className="muted text-xs my-3 break-all">
                      Actor: {a.actorId} · Record: {a.targetId}
                    </p>
                    <pre className="text-xs whitespace-pre-wrap break-all">
                      {JSON.stringify(a.details, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            )}
            {tab === "Orders" && (
              <div className="space-y-5">
                {!archived && <CreateOrder data={data} save={save} />}
                {!data.orders.length && <p>No orders yet.</p>}
                {data.orders.map((o) => (
                  <article key={o.id} className="panel p-5">
                    <div className="flex justify-between flex-wrap gap-3">
                      <h2 className="break-all">
                        {o.id} · {o.user?.email}
                      </h2>
                      <span className="badge">{o.status}</span>
                    </div>
                    <p className="muted my-3">
                      {money(o.totalCents)} · {o.method}
                    </p>
                    <details className="mb-4">
                      <summary className="cursor-pointer text-sm">
                        Order notes & management
                      </summary>
                      <div className="grid md:grid-cols-2 gap-3 mt-3">
                        <Editor
                          title="Internal order notes"
                          fields={[
                            {
                              name: "notes",
                              label: "Notes",
                              type: "textarea",
                              value: o.notes,
                            },
                            password,
                          ]}
                          submit={(v) =>
                            save({ action: "orderEdit", id: o.id, ...v })
                          }
                        />
                        <Editor
                          title={archived ? "Restore order" : "Delete order"}
                          label={archived ? "Restore" : "Delete order"}
                          danger={!archived}
                          fields={[
                            {
                              name: "reason",
                              label: "Reason (required)",
                              type: "textarea",
                            },
                            password,
                          ]}
                          submit={async (v) => {
                            if (
                              !confirm(
                                archived
                                  ? "Restore order visibility? Cancelled orders remain cancelled."
                                  : "Delete this order from lists? Unpaid orders will be cancelled. Paid services and financial records remain intact.",
                              )
                            )
                              return;
                            await save({
                              action: archived ? "orderRestore" : "orderDelete",
                              id: o.id,
                              ...v,
                            });
                          }}
                        />
                      </div>
                    </details>
                    {o.status === "AWAITING_PAYMENT" && (
                      <>
                        <button
                          className="secondary mb-4"
                          onClick={() => {
                            if (
                              confirm(
                                "Cancel this unpaid order and release its reserved stock?",
                              )
                            )
                              click({ action: "cancel", id: o.id });
                          }}
                        >
                          Cancel unpaid order
                        </button>
                        {o.method === "manual" && (
                          <Editor
                            title="Confirm payment only after verifying receipt in your payment account"
                            fields={[password]}
                            label="Confirm funds received"
                            submit={async (v) => {
                              if (
                                !confirm(
                                  "I independently verified the full payment amount. Mark this order paid?",
                                )
                              )
                                return;
                              await save({
                                action: "confirmPayment",
                                id: o.id,
                                ...v,
                              });
                            }}
                          />
                        )}
                      </>
                    )}
                    {o.items.map((i) => (
                      <div
                        key={i.id}
                        className="mt-5 border-t border-slate-700 pt-4"
                      >
                        <p>
                          {i.name} · {i.location} · {i.os} · {i.cpu} vCPU /{" "}
                          {i.ram} GB / {i.disk} GB
                        </p>
                        {o.status === "PENDING" &&
                        i.instance?.status === "PENDING" ? (
                          <div className="grid md:grid-cols-2 gap-4 mt-3">
                            <Editor
                              title="Enter access details and deliver"
                              fields={connectionFields()}
                              label="Deliver this server"
                              submit={(v) =>
                                save({
                                  action: "fulfill",
                                  data: { id: i.instance!.id, ...v },
                                })
                              }
                            />
                            <Editor
                              title="Or deliver an available inventory server"
                              fields={[
                                {
                                  name: "inventoryId",
                                  label: "Matching server",
                                  options: data.inventory
                                    .filter(
                                      (s) =>
                                        s.state === "AVAILABLE" &&
                                        s.planId === i.instance?.planId &&
                                        s.countryCode === i.countryCode &&
                                        s.os === i.os,
                                    )
                                    .map((s) => ({
                                      value: s.id,
                                      label: `${s.label} · ${s.ip}:${s.port}`,
                                    })),
                                },
                              ]}
                              label="Assign and deliver"
                              submit={(v) =>
                                save({
                                  action: "fulfill",
                                  data: { id: i.instance!.id, ...v },
                                })
                              }
                            />
                          </div>
                        ) : (
                          <p className="muted text-sm mt-2">
                            {i.instance?.status ?? "Awaiting payment"}
                          </p>
                        )}
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            )}
            {tab === "Plans" && (
              <>
                <p className="muted mb-5">
                  Prices affect future purchases. Stock is saleable capacity,
                  not proof that a physical server exists. Selecting a country
                  creates its location automatically.
                </p>
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <Editor
                    title="Create plan"
                    fields={planFields()}
                    label="Create plan"
                    submit={(v) =>
                      save({
                        action: "plan",
                        data: {
                          ...v,
                          baseCents: dollarsToCents(String(v.price)),
                        },
                      })
                    }
                  />
                  {data.plans.map((p) => (
                    <Editor
                      key={p.id}
                      title={`${p.name} · ${p.location}`}
                      fields={planFields(p)}
                      submit={(v) =>
                        save({
                          action: "plan",
                          data: {
                            id: p.id,
                            locationId: p.locationId,
                            ...v,
                            baseCents: dollarsToCents(String(v.price)),
                          },
                        })
                      }
                    />
                  ))}
                </div>
              </>
            )}
            {tab === "Locations" && (
              <div className="grid md:grid-cols-3 gap-4">
                <Editor
                  title="Add location"
                  fields={locationFields()}
                  submit={(v) => save({ action: "location", ...v })}
                />
                {data.locations.map((l) => (
                  <Editor
                    key={l.id}
                    title={l.name}
                    fields={locationFields(l)}
                    submit={(v) => save({ action: "location", id: l.id, ...v })}
                  />
                ))}
              </div>
            )}
            {tab === "Payments" && (
              <>
                <p className="muted mb-5">
                  Configure online provider keys under System keys. For manual
                  payments, provide public bank or wallet instructions; verify
                  actual receipt before confirming an order. Existing orders
                  retain their original instructions. Naira payments need your
                  selling rate in NGN per $1. Existing payments keep their saved
                  rate. Both Flutterwave options use the same keys and webhook.
                  In Flutterwave, turn off “Enable Dashboard Payment Options” so
                  checkout respects the selected currency’s payment methods.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <Editor
                    title="Add payment method"
                    fields={methodFields()}
                    submit={(v) => save({ action: "method", ...v })}
                  />
                  {data.methods.map((m) => (
                    <Editor
                      key={m.id}
                      title={m.label}
                      fields={methodFields(m)}
                      submit={(v) => save({ action: "method", id: m.id, ...v })}
                    />
                  ))}
                </div>
              </>
            )}
            {tab === "System keys" && (
              <>
                <p className="panel p-5 mb-5">
                  Saved integration keys are encrypted and never displayed.
                  Blank forms do not change existing keys. JWT_SECRET,
                  CREDENTIAL_KEY, DATABASE_URL and APP_URL remain managed in
                  your hosting environment; changing the encryption root here
                  would make stored credentials unreadable. Provider API URLs
                  are fixed to Flutterwave and NOWPayments.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  {data.keys.map((k) => (
                    <Editor
                      key={k.name}
                      title={`${k.name} · ${k.configured ? "Configured" : "Missing"} (${k.source})`}
                      fields={[
                        { name: "value", label: "New value", type: "password" },
                        password,
                      ]}
                      label="Replace key"
                      submit={(v) =>
                        save({ action: "key", name: k.name, ...v })
                      }
                    />
                  ))}
                </div>
              </>
            )}
            {tab === "Users" && (
              <div className="space-y-4">
                <AccountCreate save={save} />
                {data.users.map((u) => (
                  <div className="panel p-5" key={u.id}>
                    <div className="flex justify-between gap-4 flex-wrap">
                      <div>
                        <strong>{u.name || "Unnamed customer"}</strong>
                        <p className="muted text-sm break-all">
                          {u.email} ·{" "}
                          {countries.find((c) => c.code === u.countryCode)
                            ?.name ?? "Country not set"}
                        </p>
                        <p className="muted text-sm">
                          {u.role} · {money(u.wallet)} ·{" "}
                          {u.disabled
                            ? "Disabled"
                            : u.emailVerificationRequired && !u.emailVerifiedAt
                              ? "Email verification pending"
                              : "Enabled"}
                        </p>
                      </div>
                      {u.role !== "ADMIN" && (
                        <button
                          className="secondary"
                          onClick={() =>
                            click({
                              action: "disable",
                              id: u.id,
                              disabled: !u.disabled,
                            })
                          }
                        >
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                      )}
                    </div>
                    <details className="mt-4">
                      <summary className="cursor-pointer">
                        Edit profile & wallet
                      </summary>
                      <div className="grid md:grid-cols-2 gap-4 mt-4">
                        <Editor
                          title="Customer profile"
                          fields={[
                            { name: "name", label: "Full name", value: u.name },
                            { ...countryField, value: u.countryCode },
                            password,
                          ]}
                          submit={(v) =>
                            save({ action: "userEdit", id: u.id, ...v })
                          }
                        />
                        <BalanceEditor user={u} save={save} />
                      </div>
                    </details>
                    {u.role !== "ADMIN" && (
                      <details className="mt-4">
                        <summary className="text-red-300 cursor-pointer">
                          Delete account
                        </summary>
                        <p className="muted text-sm my-3">
                          Requires no remaining wallet funds, unsettled payments
                          or live servers. Deletes profile and access;
                          anonymized billing records are retained.
                        </p>
                        <Editor
                          title="Confirm account deletion"
                          fields={[password]}
                          danger
                          label="Delete account"
                          submit={async (v) => {
                            if (
                              !confirm(
                                `Delete ${u.email}? This cannot be undone.`,
                              )
                            )
                              return;
                            await save({ action: "delete", id: u.id, ...v });
                          }}
                        />
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
            {tab === "Instances" && (
              <>
                <p className="muted mb-5">
                  Apply server changes with your hosting provider first. This
                  form updates the assigned plan and expiry; it does not resize
                  the actual machine or retroactively charge the customer.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  {data.instances.map((i) => (
                    <div key={i.id}>
                      <div className="panel p-4 mb-2">
                        <p>
                          {i.user?.email} · {i.status}
                        </p>
                        <p className="muted text-xs">
                          {i.id} · {i.ip ?? "Awaiting access details"} ·{" "}
                          {i.plan.name}
                        </p>
                      </div>
                      {i.status === "ACTIVE" && (
                        <Editor
                          title="Edit customer plan"
                          fields={[
                            {
                              name: "planId",
                              label: "Plan (same location and OS)",
                              value: i.planId,
                              options: planOptions,
                            },
                            {
                              name: "expiresAt",
                              label: "Expiry (local time)",
                              type: "datetime-local",
                              value: new Date(
                                new Date(i.expiresAt).getTime() -
                                  new Date().getTimezoneOffset() * 60000,
                              )
                                .toISOString()
                                .slice(0, 16),
                            },
                          ]}
                          submit={(v) =>
                            save({
                              action: "userPlan",
                              id: i.id,
                              planId: v.planId,
                              expiresAt: new Date(
                                String(v.expiresAt),
                              ).toISOString(),
                            })
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === "Available servers" && (
              <>
                <p className="muted mb-5">
                  Paid orders automatically receive a matching ready server.
                  Adding a server does not change plan stock: set saleable
                  capacity in Plans. Inventory servers must match the plan’s
                  hardware and the country and OS selected by the customer.
                </p>
                <Editor
                  title="Add ready server"
                  fields={[
                    { name: "planId", label: "Plan", options: planOptions },
                    { name: "label", label: "Internal server label" },
                    {
                      name: "countryCode",
                      label: "Actual server country",
                      options: countries.map((c) => ({
                        value: c.code,
                        label: c.name,
                      })),
                    },
                    {
                      name: "os",
                      label: "Actual operating system",
                      value: "Windows",
                      options: checkoutSystems.map((os) => ({
                        value: os,
                        label: os,
                      })),
                    },
                    ...connectionFields(),
                  ]}
                  label="Save encrypted server details"
                  submit={(v) =>
                    save({
                      action: "inventory",
                      data: v,
                    })
                  }
                />
                <div className="panel overflow-auto mt-6">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th>Server</th>
                        <th>Address</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.inventory.map((i) => (
                        <tr key={i.id}>
                          <td>{i.label}</td>
                          <td>
                            {i.ip}:{i.port}
                          </td>
                          <td>{i.state}</td>
                          <td>
                            {i.state === "AVAILABLE" && (
                              <button
                                className="secondary"
                                onClick={() => {
                                  if (
                                    confirm(
                                      "Retire this server and remove its saved password?",
                                    )
                                  )
                                    click({
                                      action: "retireInventory",
                                      id: i.id,
                                    });
                                }}
                              >
                                Retire
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === "Service requests" && (
              <div className="space-y-4">
                <p className="muted">
                  Perform manual requests in your hosting provider first, then
                  mark them complete here. This does not execute a server
                  restart or deletion itself.
                </p>
                {!data.jobs.length && <p>No pending requests.</p>}
                {data.jobs.map((j) => (
                  <div className="panel p-5" key={j.id}>
                    <p>
                      {j.action} · {j.instance.user.email} · {j.instance.ip}
                    </p>
                    <p className="muted text-xs my-2">
                      {j.id} · {j.state}
                    </p>
                    <button
                      className="secondary"
                      onClick={() => {
                        if (
                          j.state !== "MANUAL_PENDING" ||
                          confirm(
                            "I completed this operation at the hosting provider. Update its status?",
                          )
                        )
                          click({
                            action:
                              j.state === "MANUAL_PENDING" ? "job" : "retry",
                            id: j.id,
                          });
                      }}
                    >
                      {j.state === "MANUAL_PENDING"
                        ? "Mark performed at provider"
                        : "Retry automated job"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {["Orders", "Users", "Instances", "Transactions"].includes(tab) && (
            <div className="flex gap-4 mt-6 items-center">
              <button
                className="secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} / {data.pages}
              </span>
              <button
                className="secondary"
                disabled={page + 1 >= data.pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
