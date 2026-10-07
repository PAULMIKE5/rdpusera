"use client";
import { ngnAmount } from "@/lib/payment-currency";
import type { Method } from "./types";
export function PaymentChoices({
  methods,
  value,
  onChange,
  disabled = false,
  walletLabel,
  demo = false,
}: {
  methods: Method[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  walletLabel?: string;
  demo?: boolean;
}) {
  const options = [
    ...(walletLabel
      ? [
          {
            id: "wallet",
            label: walletLabel,
            provider: "wallet",
            instructions: "",
          },
        ]
      : []),
    ...methods,
    ...(demo
      ? [
          {
            id: "demo",
            label: "Demo credit (local only)",
            provider: "demo",
            instructions: "",
          },
        ]
      : []),
  ];
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-sm mb-3">Payment method</legend>
      {options.map((m) => (
        <label
          key={m.id}
          className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${value === m.id ? "border-lime-300 bg-lime-200/5" : "border-white/10 hover:border-white/30"}`}
        >
          <input
            className="!w-4 mt-1 shrink-0 accent-lime-300"
            type="radio"
            name="payment-method"
            value={m.id}
            checked={value === m.id}
            onChange={() => onChange(m.id)}
          />
          <span>
            <strong className="block text-sm">
              {m.provider === "flutterwave_ngn"
                ? "Pay in Naira"
                : m.provider === "flutterwave"
                  ? "Pay in USD"
                  : m.label}
            </strong>
            <span className="block muted text-xs mt-1">
              {m.provider === "flutterwave_ngn"
                ? "Bank transfer, cards & USSD · Flutterwave"
                : m.provider === "flutterwave"
                  ? "Card payments · Flutterwave"
                  : m.provider === "nowpayments"
                    ? "Cryptocurrency · NOWPayments"
                    : ""}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
export function NairaPreview({
  method,
  cents,
}: {
  method?: Method;
  cents: number;
}) {
  if (method?.provider !== "flutterwave_ngn" || !method.usdToNgn) return null;
  let amount: string;
  try {
    amount = ngnAmount(cents, method.usdToNgn);
  } catch {
    return null;
  }
  return (
    <p className="rounded-xl bg-lime-200/5 p-4 text-sm mt-4" aria-live="polite">
      Estimated payment:{" "}
      <strong>
        ₦
        {Number(amount).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </strong>
      <span className="block muted text-xs mt-2">
        ₦
        {Number(method.usdToNgn).toLocaleString("en-NG", {
          maximumFractionDigits: 6,
        })}{" "}
        per $1. Plans and wallet balances stay in USD. Your payment amount is
        locked when created; confirm it on the payment page.
      </span>
    </p>
  );
}
