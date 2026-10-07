"use client";
import { useState } from "react";
import { Editor, password, type Field } from "./admin-editor";
import { UserPicker } from "./user-picker";
import { countries, checkoutSystems } from "@/lib/countries";
import { dollarsToCents } from "@/lib/money";
import { money } from "@/lib/domain";
import type { AdminData } from "./admin-panel";
import { api } from "./workspace";
export const countryField: Field = {
  name: "countryCode",
  label: "Country",
  options: countries.map((c) => ({ value: c.code, label: c.name })),
};
const reason: Field = {
  name: "reason",
  label: "Reason for this change (at least 5 characters)",
  type: "textarea",
};
type Save = (value: unknown) => Promise<void>;
export function AdminOverview({
  data,
  onSelect,
}: {
  data: AdminData;
  onSelect: (tab: string) => void;
}) {
  const [days, setDays] = useState(14);
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(Date.now() - (days - i - 1) * 86400000).toISOString().slice(0, 10),
  );
  const max = Math.max(1, ...data.trend.map((t) => t.cents));
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { title: "Revenue", value: money(data.revenue), tab: "Transactions" },
          { title: "Customers", value: data.totalUsers, tab: "Users" },
          { title: "Awaiting delivery", value: data.pending, tab: "Orders" },
          {
            title: "Ready inventory",
            value: data.available,
            tab: "Available servers",
          },
        ].map((c) => (
          <button
            key={c.title}
            className="panel p-6 text-left hover:border-lime-200/50 transition"
            onClick={() => onSelect(c.tab)}
          >
            <p className="muted text-sm">{c.title}</p>
            <p className="text-3xl font-semibold mt-3">{c.value}</p>
            <p className="text-lime-200 text-xs mt-4">
              View {c.tab.toLowerCase()} ↗
            </p>
          </button>
        ))}
      </div>
      <section className="panel p-6">
        <div className="flex flex-wrap justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl">Sales activity</h2>
            <p className="muted text-xs mt-2">
              Completed payments for orders · UTC dates
            </p>
          </div>
          <select
            aria-label="Chart period"
            className="!w-auto"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
          </select>
        </div>
        <div
          className="flex items-end gap-2 h-44"
          role="img"
          aria-label={`Revenue chart for the last ${days} days`}
        >
          {dates.map((date) => {
            const cents = data.trend.find((t) => t.day === date)?.cents ?? 0;
            return (
              <div
                className="flex-1 h-full flex flex-col justify-end items-center group"
                key={date}
                title={`${date}: ${money(cents)}`}
              >
                <span className="text-[10px] muted">{money(cents)}</span>
                <div
                  className="w-full rounded-t-md bg-lime-200/60 group-hover:bg-lime-200 transition"
                  style={{ height: `${Math.max(2, (cents / max) * 80)}%` }}
                />
                <span className="text-[9px] muted mt-2">{date.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </section>
      <div className="grid md:grid-cols-2 gap-5">
        <section className="panel p-6">
          <h2 className="text-xl mb-4">Quick actions</h2>
          <div className="flex flex-wrap gap-3">
            {["Assign server", "Inbox", "Email", "Users"].map((t) => (
              <button className="secondary" key={t} onClick={() => onSelect(t)}>
                {t} ↗
              </button>
            ))}
          </div>
          <p className="muted text-sm mt-5">
            {data.active} active servers across your marketplace.
          </p>
        </section>
        <section className="panel p-6">
          <h2 className="text-xl mb-4">Recent operations</h2>
          <ul className="space-y-3">
            {data.audits.slice(0, 5).map((a) => (
              <li key={a.id} className="text-sm">
                <span>{a.action.replaceAll("_", " ")}</span>
                <small className="block muted">
                  {new Date(a.createdAt).toLocaleString()}
                </small>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
export function AccountCreate({ save }: { save: Save }) {
  return (
    <details className="panel p-5 mb-5">
      <summary className="cursor-pointer text-lime-200">
        Create customer account
      </summary>
      <p className="muted my-4 text-sm">
        The customer must verify the emailed OTP before signing in. Share the
        initial password securely; they can change it in Settings.
      </p>
      <Editor
        title="New customer"
        fields={[
          { name: "name", label: "Full name" },
          countryField,
          { name: "email", label: "Email address" },
          {
            name: "newPassword",
            label: "Initial password (12–72 characters)",
            type: "password",
          },
          password,
        ]}
        submit={(v) =>
          save({
            action: "userCreate",
            adminPassword: v.password,
            data: {
              name: v.name,
              countryCode: v.countryCode,
              email: v.email,
              password: v.newPassword,
            },
          })
        }
      />
    </details>
  );
}
export function BalanceEditor({
  user,
  save,
}: {
  user: AdminData["users"][number];
  save: Save;
}) {
  const [key] = useState(() => crypto.randomUUID());
  return (
    <Editor
      title="Set wallet balance"
      fields={[
        {
          name: "balance",
          label: "New balance in USD",
          type: "number",
          value: (user.wallet / 100).toFixed(2),
          step: 0.01,
          min: 0,
          max: 1000000,
        },
        reason,
        password,
      ]}
      submit={(v) =>
        save({
          action: "balance",
          id: user.id,
          wallet: dollarsToCents(String(v.balance)),
          expectedWallet: user.wallet,
          reason: v.reason,
          requestKey: key,
          password: v.password,
        })
      }
    />
  );
}
export function Transactions({
  data,
  save,
  archived,
}: {
  data: AdminData;
  save: Save;
  archived: boolean;
}) {
  const [userId, setUserId] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  return (
    <div className="space-y-5">
      <details className="panel p-5">
        <summary className="cursor-pointer text-lime-200">
          Create credit or debit transaction
        </summary>
        <div className="mt-5">
          <UserPicker value={userId} onChange={setUserId} />
        </div>
        <Editor
          title="Wallet adjustment"
          fields={[
            {
              name: "amount",
              label: "USD amount (positive credit / negative debit)",
              type: "number",
              step: 0.01,
              min: -1000000,
              max: 1000000,
            },
            { name: "notes", label: "Reason (required)", type: "textarea" },
            password,
          ]}
          submit={(v) => {
            if (!userId) throw Error("Select a customer");
            const n = Number(v.amount);
            return save({
              action: "transactionCreate",
              userId,
              cents: (n < 0 ? -1 : 1) * dollarsToCents(String(Math.abs(n))),
              notes: v.notes,
              requestKey: key,
              password: v.password,
            });
          }}
        />
      </details>
      <p className="muted text-sm">
        Gateway amounts and references are protected. Edit their notes or create
        an adjustment. Editing a manual adjustment posts the difference to the
        wallet. Deletion hides a transaction without reversing funds.
      </p>
      {!data.transactions.length && (
        <p className="panel p-6">No transactions match this view.</p>
      )}
      {data.transactions.map((t) => (
        <article className="panel p-5" key={t.id}>
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="break-all">{t.user.email}</h3>
              <p className="muted text-xs break-all mt-2">
                {t.id} · {t.provider} · {new Date(t.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <strong>{money(t.cents)}</strong>
              <span className="badge ml-3">{t.status}</span>
            </div>
          </div>
          {t.chargeCurrency === "NGN" && t.chargeAmount && (
            <p className="text-sm text-lime-200 my-2">
              NGN collected: ₦
              {Number(t.chargeAmount).toLocaleString("en-NG", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              · Rate: ₦{t.exchangeRate} per $1
            </p>
          )}
          {t.providerId && (
            <p className="muted text-xs mt-3 break-all">
              Provider reference: {t.providerId}
            </p>
          )}
          {t.status === "PENDING" &&
            ["flutterwave", "flutterwave_ngn", "nowpayments"].includes(
              t.provider,
            ) && (
              <details className="mt-4">
                <summary className="cursor-pointer text-lime-200">
                  Verify payment with provider
                </summary>
                <Editor
                  title="Reconcile a missed callback"
                  fields={[
                    {
                      name: "providerPaymentId",
                      label: "Provider payment / transaction ID",
                      optional: true,
                    },
                  ]}
                  label="Check verified status"
                  submit={async (v) => {
                    const r = await api("payments/verify", {
                      paymentId: t.id,
                      ...(v.providerPaymentId
                        ? { providerPaymentId: v.providerPaymentId }
                        : {}),
                    });
                    if (r.status !== "PAID")
                      throw Error(
                        `Not paid yet: ${r.gatewayStatus ?? "waiting for a callback or provider payment ID"}. Do not manually mark paid.`,
                      );
                    window.dispatchEvent(new Event("admin-refresh"));
                  }}
                />
              </details>
            )}
          {!archived && (
            <details className="mt-4">
              <summary className="cursor-pointer">
                Edit transaction details
              </summary>
              <Editor
                title="Transaction correction"
                fields={[
                  ...(t.provider === "admin_adjustment"
                    ? [
                        {
                          name: "amount",
                          label: "Corrected adjustment (USD)",
                          type: "number" as const,
                          value: t.cents / 100,
                          step: 0.01,
                        },
                      ]
                    : []),
                  {
                    name: "notes",
                    label: "Notes / reason",
                    type: "textarea",
                    value: t.notes,
                  },
                  password,
                ]}
                submit={(v) => {
                  const n = Number(v.amount);
                  return save({
                    action: "transactionEdit",
                    id: t.id,
                    version: t.version,
                    cents:
                      t.provider === "admin_adjustment"
                        ? (n < 0 ? -1 : 1) * dollarsToCents(String(Math.abs(n)))
                        : t.cents,
                    notes: v.notes,
                    password: v.password,
                  });
                }}
              />
            </details>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-amber-200">
              {archived ? "Restore transaction" : "Delete transaction"}
            </summary>
            <Editor
              title={
                archived ? "Restore record" : "Delete from transaction lists"
              }
              fields={[reason, password]}
              danger={!archived}
              label={archived ? "Restore" : "Delete transaction"}
              submit={async (v) => {
                if (
                  !confirm(
                    archived
                      ? "Restore this record?"
                      : "Hide this record? This does not refund or reverse the payment.",
                  )
                )
                  return;
                await save({
                  action: archived ? "transactionRestore" : "transactionDelete",
                  id: t.id,
                  ...v,
                });
              }}
            />
          </details>
        </article>
      ))}
    </div>
  );
}
export function AssignServer({ data, save }: { data: AdminData; save: Save }) {
  const [userId, setUserId] = useState(""),
    [manual, setManual] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  const planOptions = data.plans.map((p) => ({ value: p.id, label: p.name }));
  const [planId, setPlanId] = useState("");
  return (
    <section className="panel p-6 max-w-3xl">
      <h2 className="text-xl mb-3">Deliver a server to a customer</h2>
      <p className="muted text-sm mb-6">
        Creates an active, complimentary instance and sends an in-app
        notification. For a paid order, use its delivery controls in Orders.
        Passwords are available only in the customer’s secure instance view.
      </p>
      <UserPicker value={userId} onChange={setUserId} />
      <label className="mt-4">
        Plan
        <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Choose a plan</option>
          {planOptions.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3 my-5">
        <button
          className={!manual ? "primary" : "secondary"}
          onClick={() => setManual(false)}
        >
          From inventory
        </button>
        <button
          className={manual ? "primary" : "secondary"}
          onClick={() => setManual(true)}
        >
          Manual details
        </button>
      </div>
      <Editor
        key={`${manual}-${planId}`}
        title="Assignment details"
        fields={[
          ...(!manual
            ? [
                {
                  name: "inventoryId",
                  label: "Available server",
                  options: data.inventory
                    .filter(
                      (i) => i.state === "AVAILABLE" && i.planId === planId,
                    )
                    .map((i) => ({
                      value: i.id,
                      label: `${i.label} · ${i.countryCode} · ${i.os} · ${i.ip}`,
                    })),
                },
              ]
            : [
                countryField,
                {
                  name: "os",
                  label: "OS",
                  value: "Windows",
                  options: checkoutSystems.map((o) => ({ value: o, label: o })),
                },
                { name: "ip", label: "IP address (without port)" },
                {
                  name: "port",
                  label: "Port",
                  type: "number" as const,
                  value: 3389,
                  min: 1,
                  max: 65535,
                },
                { name: "username", label: "Server username" },
                {
                  name: "serverPassword",
                  label: "Server password",
                  type: "password" as const,
                },
              ]),
          {
            name: "days",
            label: "Access duration in days",
            type: "number",
            value: 30,
            min: 1,
            max: 366,
          },
          reason,
          password,
        ]}
        label="Assign and notify customer"
        submit={async (v) => {
          if (!userId || !planId) throw Error("Select a customer and plan");
          const inventory = data.inventory.find((i) => i.id === v.inventoryId);
          await save({
            action: "assignServer",
            adminPassword: v.password,
            data: {
              userId,
              planId,
              days: v.days,
              reason: v.reason,
              requestKey: key,
              countryCode: manual ? v.countryCode : inventory?.countryCode,
              os: manual ? v.os : inventory?.os,
              ...(manual
                ? {
                    connection: {
                      ip: v.ip,
                      port: v.port,
                      username: v.username,
                      password: v.serverPassword,
                    },
                  }
                : { inventoryId: v.inventoryId }),
            },
          });
        }}
      />
    </section>
  );
}
export function CreateOrder({ data, save }: { data: AdminData; save: Save }) {
  const [userId, setUserId] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  return (
    <details className="panel p-5 mb-5">
      <summary className="cursor-pointer text-lime-200">
        Create order for a customer
      </summary>
      <div className="mt-5">
        <UserPicker value={userId} onChange={setUserId} />
      </div>
      <Editor
        title="Predefined plan order"
        fields={[
          {
            name: "planId",
            label: "Plan",
            options: data.plans
              .filter((p) => p.enabled)
              .map((p) => ({
                value: p.id,
                label: `${p.name} · ${money(p.baseCents)}`,
              })),
          },
          countryField,
          {
            name: "os",
            label: "OS",
            value: "Windows",
            options: checkoutSystems.map((o) => ({ value: o, label: o })),
          },
          {
            name: "quantity",
            label: "Quantity",
            type: "number",
            value: 1,
            min: 1,
            max: 10,
          },
          {
            name: "method",
            label: "Payment",
            options: [
              { value: "wallet", label: "Debit customer wallet" },
              ...data.methods
                .filter((m) => m.enabled && m.provider === "manual")
                .map((m) => ({ value: m.id, label: m.label })),
            ],
          },
          password,
        ]}
        submit={async (v) => {
          if (!userId) throw Error("Choose a customer");
          if (
            !confirm(
              "Create this order? Choosing wallet debits the customer's balance.",
            )
          )
            return;
          await save({
            action: "orderCreate",
            adminPassword: v.password,
            data: {
              userId,
              checkout: {
                requestKey: key,
                method: v.method,
                lines: [
                  {
                    planId: v.planId,
                    quantity: v.quantity,
                    countryCode: v.countryCode,
                    os: v.os,
                  },
                ],
              },
            },
          });
        }}
      />
    </details>
  );
}
export function EmailTools({
  data,
  save,
  reload,
}: {
  data: AdminData;
  save: Save;
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-5">
      <div className="panel p-6">
        <h2 className="text-xl">Email delivery</h2>
        <p className="muted text-sm mt-3">
          Use a verified domain in Resend. A website address on
          amazonlightsail.com is not a sender email domain. Save RESEND_API_KEY
          in System keys; saved vault values override hosting variables.
        </p>
      </div>
      <Editor
        title="Sender address"
        fields={[
          { name: "value", label: "EMAIL_FROM", value: "" },
          { ...password },
        ]}
        label="Save sender"
        submit={(v) => save({ action: "key", name: "EMAIL_FROM", ...v })}
      />
      <Editor
        title="Send a test to your administrator email"
        fields={[password]}
        label="Send email test"
        submit={async (v) => {
          const r = await api("admin", {
            action: "emailTest",
            adminPassword: v.password,
          });
          setMessage(
            `Accepted by Resend: ${r.providerId}. Check your inbox and spam folder.`,
          );
          await reload();
        }}
      />
      {message && (
        <p className="panel p-4 text-lime-200" role="status">
          {message}
        </p>
      )}
      <div className="panel p-5">
        <h3 className="mb-4">Recent sending attempts</h3>
        {data.emailAttempts.length === 0 && (
          <p className="muted">No attempts recorded yet.</p>
        )}
        {data.emailAttempts.map((e) => (
          <div key={e.id} className="border-t border-white/10 py-4">
            <p>
              {e.purpose} ·{" "}
              <span
                className={
                  e.status === "FAILED" ? "text-amber-200" : "text-lime-200"
                }
              >
                {e.code}
              </span>
            </p>
            <p className="muted text-sm mt-2">{e.help}</p>
            <small className="muted">
              {new Date(e.createdAt).toLocaleString()}
              {e.httpStatus ? ` · HTTP ${e.httpStatus}` : ""}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
