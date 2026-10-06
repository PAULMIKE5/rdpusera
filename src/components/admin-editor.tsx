"use client";
import { useState } from "react";
export type Field = {
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
export function Editor({
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
export const password: Field = {
  name: "password",
  label: "Your administrator password",
  type: "password",
};
