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
import {
  Globe2,
  ShoppingCart,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
} from "lucide-react";
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
      countryCode: z.string().default(""),
      os: z.enum(["Windows", "Ubuntu", "Linux"]).default("Windows"),
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
    [notice, setNotice] = useState(""),
    [menuOpen, setMenuOpen] = useState(false);
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
    setMenuOpen(false);
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
    try {
      localStorage.setItem("rdp-cart", JSON.stringify(v));
    } catch {
      setNotice(
        "Your cart is available for this visit; browser storage is unavailable.",
      );
    }
  }
  return (
    <Context.Provider value={{ me, refresh, cart, setCart, notice, setNotice }}>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <Globe2 size={23} />
            </span>
            GlobalRDP
            <span className="hidden lg:inline text-xs font-normal muted tracking-normal">
              / HUB
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            <Link href="/#plans">Explore plans</Link>
            <Link href="/#how-it-works">How it works</Link>
            {me && <Link href="/dashboard">Dashboard</Link>}
            {me?.role === "ADMIN" && <Link href="/admin">Admin</Link>}
          </nav>
          <div className="header-actions">
            <Link
              href="/cart"
              className="icon-button relative"
              aria-label={`Cart, ${cart.reduce((n, l) => n + l.quantity, 0)} items`}
            >
              <ShoppingCart size={18} />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-lime-200 text-slate-950 rounded-full text-[10px] min-w-4 text-center px-1">
                  {cart.reduce((n, l) => n + l.quantity, 0)}
                </span>
              )}
            </Link>
            {me ? (
              <button
                className="icon-button desktop-only"
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
                <LogOut size={17} />
              </button>
            ) : (
              <Link className="secondary desktop-only" href="/login">
                Sign in <ArrowUpRight size={15} />
              </Link>
            )}
            <button
              className="icon-button mobile-only"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-navigation"
            className="mobile-nav md:hidden"
            aria-label="Mobile navigation"
          >
            <Link href="/#plans" onClick={() => setMenuOpen(false)}>
              Explore plans
            </Link>
            <Link href="/#how-it-works" onClick={() => setMenuOpen(false)}>
              How it works
            </Link>
            {me ? (
              <>
                <Link href="/dashboard">Dashboard</Link>
                {me.role === "ADMIN" && <Link href="/admin">Admin</Link>}
                <button
                  className="secondary mt-2"
                  onClick={async () => {
                    try {
                      await api("auth/logout", {});
                      setMe(null);
                      setMenuOpen(false);
                      router.push("/");
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/login">Sign in / Create account</Link>
            )}
          </nav>
        )}
      </header>
      {notice && (
        <div role="alert" className="notice">
          {notice}
          <button aria-label="Dismiss" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {children}
      {cart.length > 0 && (
        <Link
          href="/cart"
          className="cart-fab"
          aria-label={`Open cart, ${cart.reduce((n, l) => n + l.quantity, 0)} items`}
        >
          <ShoppingCart size={22} />
          <span>Cart ({cart.reduce((n, l) => n + l.quantity, 0)})</span>
        </Link>
      )}
      <footer className="site-footer">
        <span className="font-semibold text-slate-300">GlobalRDP Hub</span>
        <span>Your workspace. Without borders.</span>
        <Link href="/#plans">Find your next plan ↗</Link>
      </footer>
    </Context.Provider>
  );
}
export function DashboardNav() {
  const { me } = useWorkspace();
  const path = usePathname();
  return (
    <nav className="dashboard-nav">
      {[
        ["/dashboard", "Overview"],
        ["/dashboard/orders", "Orders"],
        ["/dashboard/instances", "My instances"],
        ["/dashboard/billing", "Billing"],
        ["/dashboard/settings", "Settings"],
        ...(me?.role === "ADMIN" ? [["/admin", "Admin"]] : []),
      ].map(([href, label]) => (
        <Link className={path === href ? "active" : ""} key={href} href={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
