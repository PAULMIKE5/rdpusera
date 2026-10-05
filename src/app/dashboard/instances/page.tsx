"use client";
import { useEffect, useState, useCallback } from "react";
import { api, useWorkspace } from "@/components/workspace";
import type { Instance } from "@/components/types";
export default function Instances() {
  const [rows, setRows] = useState<Instance[]>([]),
    [busy, setBusy] = useState(false),
    [credentials, setCredentials] = useState<{
      id: string;
      ip: string;
      port: number;
      username: string;
      password: string;
    } | null>(null);
  const { setNotice } = useWorkspace();
  const load = useCallback(
    () =>
      api("instances")
        .then(setRows)
        .catch((e) => setNotice(e.message)),
    [setNotice],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!credentials) return;
    const t = setTimeout(() => setCredentials(null), 30000);
    return () => clearTimeout(t);
  }, [credentials]);
  async function action(i: Instance, a: string) {
    setBusy(true);
    try {
      const r = await api(`instances/${i.id}/${a}`, {});
      if (a === "credentials") setCredentials({ id: i.id, ...r });
      else
        setNotice(
          i.controlMode === "MANUAL"
            ? "Request sent to your administrator."
            : "Request queued.",
        );
      await load();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1 className="text-3xl mb-6">My instances</h1>
      {!rows.length && (
        <p className="panel p-8">
          Paid orders will appear here while awaiting delivery.
        </p>
      )}
      <div className="space-y-5">
        {rows.map((i) => (
          <article className="panel p-6" key={i.id}>
            <div className="flex justify-between gap-4">
              <h2>
                {i.plan.name} · {i.plan.location}
              </h2>
              <span className="badge">{i.status}</span>
            </div>
            <p className="muted my-4 text-sm">
              {i.plan.os} · {i.cpu} vCPU / {i.ram} GB RAM / {i.disk} GB SSD
            </p>
            {i.status === "PENDING" ? (
              <p>
                Awaiting manual access details. Your paid term starts at
                delivery.
              </p>
            ) : (
              <>
                <p className="muted text-sm mb-4">
                  {i.ip ?? "No address"} · Expires{" "}
                  {new Date(i.expiresAt).toLocaleDateString()}
                  {i.controlMode === "AUTO" &&
                    ` · ${Math.floor(i.uptimeSeconds / 3600)}h uptime · ${(Number(i.bandwidthBytes) / 1e9).toFixed(2)} GB used`}
                </p>
                <div className="flex gap-3 flex-wrap">
                  <button
                    disabled={busy || i.status !== "ACTIVE"}
                    className="secondary"
                    onClick={() => action(i, "credentials")}
                  >
                    Reveal access
                  </button>
                  {i.plan.os.startsWith("Windows") && i.status === "ACTIVE" && (
                    <a
                      className="secondary"
                      href={`/api/instances/${i.id}/rdp`}
                    >
                      Download RDP
                    </a>
                  )}
                  <button
                    disabled={busy || i.status !== "ACTIVE"}
                    className="secondary"
                    onClick={() => action(i, "restart")}
                  >
                    Request restart
                  </button>
                  <button
                    disabled={busy || i.status !== "ACTIVE"}
                    className="secondary text-red-300"
                    onClick={() => {
                      if (
                        confirm(
                          "Request permanent server termination? Server data will be deleted; prepaid time is not refunded.",
                        )
                      )
                        action(i, "terminate");
                    }}
                  >
                    Request termination
                  </button>
                </div>
              </>
            )}
            {credentials?.id === i.id && (
              <div className="bg-slate-950 rounded-lg p-4 mt-5">
                {(["ip", "port", "username", "password"] as const).map((k) => (
                  <div
                    className="flex justify-between gap-4 my-2 break-all"
                    key={k}
                  >
                    <span>
                      {k}: {credentials[k]}
                    </span>
                    <button
                      className="text-lime-300 text-xs"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(String(credentials[k]))
                          .then(() => setNotice("Copied"))
                          .catch(() =>
                            setNotice(
                              "Could not copy; select the value manually",
                            ),
                          )
                      }
                    >
                      Copy
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
    </>
  );
}
