"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Globe2, ShoppingCart, LogOut } from "lucide-react";
import { z } from "zod";
import type { Me, CartLine } from "./types";
export async function api(path: string, data?: unknown) {
  const r = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Request failed");
  return j;
}
const savedCart = z
  .array(
    z.object({
      planId: z.string(),
      name: z.string(),
      cpu: z.number(),
      ram: z.number(),
      disk: z.number(),
      quantity: z.number().int().min(1).max(10),
      estimate: z.number(),
    }),
  )
  .max(20);
const Context = createContext<{
  me: Me | null;
  refresh: () => Promise<void>;
  cart: CartLine[];
  setCart: (v: CartLine[]) => void;
  notice: string;
  setNotice: (v: string) => void;
}>({
  me: null,
  refresh: async () => {},
  cart: [],
  setCart: () => {},
  notice: "",
  setNotice: () => {},
});
export function useWorkspace() {
  return useContext(Context);
}
export function Workspace({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null),
    [cart, setCartState] = useState<CartLine[]>([]),
    [notice, setNotice] = useState("");
  const path = usePathname(),
    router = useRouter();
  const refresh = useCallback(async () => {
    try {
      setMe(await api("me"));
    } catch {
      setMe(null);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh, path]);
  useEffect(() => {
    try {
      const stored = savedCart.safeParse(
        JSON.parse(localStorage.getItem("rdp-cart") ?? "[]"),
      );
      if (stored.success) setCartState(stored.data);
    } catch {}
  }, []);
  function setCart(v: CartLine[]) {
    setCartState(v);
    localStorage.setItem("rdp-cart", JSON.stringify(v));
  }
  return (
    <Context.Provider value={{ me, refresh, cart, setCart, notice, setNotice }}>
      <header className="border-b border-slate-800 px-5 md:px-10 py-5 flex items-center justify-between gap-4">
        <Link className="font-bold flex items-center gap-2" href="/">
          <Globe2 className="text-lime-300" />
          GlobalRDP Hub
        </Link>
        <nav className="flex gap-4 items-center text-sm flex-wrap">
          <Link href="/">Plans</Link>
          <Link href="/cart" className="flex gap-2">
            <ShoppingCart size={18} />
            Cart ({cart.reduce((n, l) => n + l.quantity, 0)})
          </Link>
          {me ? (
            <>
              <Link href="/dashboard">Dashboard</Link>
              {me.role === "ADMIN" && (
                <Link className="text-lime-300" href="/admin">
                  Admin
                </Link>
              )}
              <button
                aria-label="Sign out"
                onClick={async () => {
                  try {
                    await api("auth/logout", {});
                    setMe(null);
                    router.push("/");
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link className="secondary" href="/login">
              Sign in
            </Link>
          )}
        </nav>
      </header>
      {notice && (
        <div
          role="alert"
          className="max-w-6xl mx-auto mt-4 p-4 panel border-amber-600 flex justify-between gap-4"
        >
          {notice}
          <button aria-label="Dismiss" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {children}
      <footer className="border-t border-slate-800 p-6 text-center text-xs muted">
        GlobalRDP Hub · Prepaid compute · Secure manual delivery
      </footer>
    </Context.Provider>
  );
}
export function DashboardNav() {
  const { me } = useWorkspace();
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-3 mb-8">
      {[
        ["/dashboard", "Overview"],
        ["/dashboard/orders", "Orders"],
        ["/dashboard/instances", "My instances"],
        ["/dashboard/billing", "Billing"],
        ["/dashboard/settings", "Settings"],
        ...(me?.role === "ADMIN" ? [["/admin", "Admin"]] : []),
      ].map(([href, label]) => (
        <Link
          className={path === href ? "primary" : "secondary"}
          key={href}
          href={href}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
