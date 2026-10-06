"use client";
import { useState, useEffect } from "react";
import { api } from "./workspace";
export function UserPicker({
  value,
  onChange,
  label = "Customer",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const [q, setQ] = useState(""),
    [users, setUsers] = useState<{ id: string; email: string; name: string }[]>(
      [],
    ),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      api(`admin?lookup=users&q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (active) {
            setUsers(r);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <div className="space-y-2">
      <label>
        {label}: search
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            onChange("");
          }}
          placeholder="Name or email"
        />
      </label>
      <label>
        Select customer
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        >
          <option value="">Choose a customer</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ? `${u.name} · ` : ""}
              {u.email}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-amber-200">
          {error}
        </p>
      )}
    </div>
  );
}
