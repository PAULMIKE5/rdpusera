"use client";
import { useEffect, useState, useCallback } from "react";
import { api, useWorkspace } from "./workspace";
import { countries, operatingSystems, planDescription } from "@/lib/countries";
import { money } from "@/lib/domain";
import type { Plan, Order, Instance, Method } from "./types";
type Location = { id: string; name: string; region: string; enabled: boolean };
type Inventory = {
  id: string;
  planId: string;
  label: string;
  ip: string;
  port: number;
  state: string;
};
type AdminData = {
  revenue: number;
  active: number;
  users: {
    id: string;
    email: string;
    name: string;
    role: string;
    disabled: boolean;
    wallet: number;
  }[];
  plans: Plan[];
  locations: Location[];
  methods: Method[];
  keys: { name: string; configured: boolean; source: string }[];
  orders: Order[];
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
type Field = {
  name: string;
  label: string;
  value?: string | number | boolean | null;
  type?:
    "text" | "number" | "password" | "checkbox" | "datetime-local" | "textarea";
  options?: { value: string; label: string }[];
  step?: number;
  min?: number;
  max?: number;
  optional?: boolean;
};
function Editor({
  title,
  fields,
  submit,
  label = "Save",
  danger = false,
}: {
  title: string;
  fields: Field[];
  submit: (v: Record<string, string | number | boolean>) => Promise<void>;
  label?: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="panel p-5 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const form = e.currentTarget,
          data = new FormData(form),
          v: Record<string, string | number | boolean> = {};
        for (const f of fields)
          v[f.name] =
            f.type === "checkbox"
              ? data.get(f.name) === "on"
              : f.type === "number"
                ? Number(data.get(f.name))
                : String(data.get(f.name) ?? "");
        try {
          await submit(v);
          for (const el of Array.from(form.elements))
            if (el instanceof HTMLInputElement && el.type === "password")
              el.value = "";
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">{title}</h3>
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          {f.type === "checkbox" ? (
            <input
              className="!w-auto ml-3"
              name={f.name}
              type="checkbox"
              defaultChecked={!!f.value}
            />
          ) : f.options ? (
            <select
              name={f.name}
              defaultValue={String(f.value ?? "")}
              required={!f.optional}
            >
              <option value="">Select…</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              className="w-full bg-slate-950 border border-slate-700 rounded p-3"
              name={f.name}
              defaultValue={String(f.value ?? "")}
              rows={3}
            />
          ) : (
            <input
              name={f.name}
              type={f.type ?? "text"}
              defaultValue={String(f.value ?? "")}
              step={f.step}
              min={f.min}
              max={f.max}
              required={!f.optional}
              autoComplete={f.type === "password" ? "new-password" : undefined}
            />
          )}
        </label>
      ))}
      {error && (
        <p role="alert" className="text-amber-300 text-sm">
          {error}
        </p>
      )}
      <button
        className={danger ? "secondary text-red-300" : "primary"}
        disabled={busy}
      >
        {busy ? "Saving…" : label}
      </button>
    </form>
  );
}
const password: Field = {
  name: "password",
  label: "Your administrator password",
  type: "password",
};
export function AdminPanel() {
  const { setNotice } = useWorkspace();
  const [data, setData] = useState<AdminData | null>(null),
    [tab, setTab] = useState("Orders"),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    setData(await api(`admin?page=${page}`));
  }, [page]);
  useEffect(() => {
    load().catch((e) => setNotice(e.message));
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
        min: 1,
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
          { value: "flutterwave", label: "Flutterwave (fiat)" },
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
          onClick={() => load().catch((e) => setNotice(e.message))}
        >
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="panel p-5">
          Gross server sales
          <strong className="block text-2xl mt-3">{money(data.revenue)}</strong>
        </div>
        <div className="panel p-5">
          Active servers
          <strong className="block text-2xl mt-3">{data.active}</strong>
        </div>
      </div>
      <nav className="flex flex-wrap gap-2 mb-6">
        {[
          "Orders",
          "Plans",
          "Locations",
          "Payments",
          "System keys",
          "Users",
          "Instances",
          "Available servers",
          "Service requests",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "primary" : "secondary"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <div key={`${tab}-${page}-${revision}`}>
        {tab === "Orders" && (
          <div className="space-y-5">
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
                      {i.name} · {i.location} · {i.cpu} vCPU / {i.ram} GB /{" "}
                      {i.disk} GB
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
                                    s.planId === i.instance?.planId,
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
              Prices affect future purchases. Stock is saleable capacity, not
              proof that a physical server exists. Selecting a country creates
              its location automatically.
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
                      baseCents: Math.round(Number(v.price) * 100),
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
                        baseCents: Math.round(Number(v.price) * 100),
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
              actual receipt before confirming an order. Existing orders retain
              their original instructions.
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
              Saved integration keys are encrypted and never displayed. Blank
              forms do not change existing keys. JWT_SECRET, CREDENTIAL_KEY,
              DATABASE_URL and APP_URL remain managed in Netlify; changing the
              encryption root here would make stored credentials unreadable.
              Provider API URLs are fixed to Flutterwave and NOWPayments.
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
                  submit={(v) => save({ action: "key", name: k.name, ...v })}
                />
              ))}
            </div>
          </>
        )}
        {tab === "Users" && (
          <div className="space-y-4">
            {data.users.map((u) => (
              <div className="panel p-5" key={u.id}>
                <div className="flex justify-between gap-4 flex-wrap">
                  <div>
                    {u.email}
                    <p className="muted text-sm">
                      {u.role} · {money(u.wallet)} ·{" "}
                      {u.disabled ? "Disabled" : "Enabled"}
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
                {u.role !== "ADMIN" && (
                  <details className="mt-4">
                    <summary className="text-red-300 cursor-pointer">
                      Delete account
                    </summary>
                    <p className="muted text-sm my-3">
                      Requires no remaining wallet funds, unsettled payments or
                      live servers. Deletes profile and access; anonymized
                      billing records are retained.
                    </p>
                    <Editor
                      title="Confirm account deletion"
                      fields={[password]}
                      danger
                      label="Delete account"
                      submit={async (v) => {
                        if (
                          !confirm(`Delete ${u.email}? This cannot be undone.`)
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
              Apply server changes with your hosting provider first. This form
              updates the assigned plan and expiry; it does not resize the
              actual machine or retroactively charge the customer.
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
              Paid orders automatically receive a matching ready server. Adding
              a server does not change plan stock: set saleable capacity in
              Plans. Inventory servers match the plan's base specs; customized
              orders require manually verified access details.
            </p>
            <Editor
              title="Add ready server"
              fields={[
                { name: "planId", label: "Plan", options: planOptions },
                { name: "label", label: "Internal server label" },
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
                                click({ action: "retireInventory", id: i.id });
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
              Perform manual requests in your hosting provider first, then mark
              them complete here. This does not execute a server restart or
              deletion itself.
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
                        action: j.state === "MANUAL_PENDING" ? "job" : "retry",
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
      {["Orders", "Users", "Instances"].includes(tab) && (
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
    </>
  );
}
