import { Catalog } from "@/components/catalog";
import {
  ArrowUpRight,
  Globe2,
  ShieldCheck,
  Server,
  Monitor,
  MapPin,
  Check,
  Layers3,
} from "lucide-react";
export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <span className="badge">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-300" /> YOUR
            WORKSPACE. WITHOUT BORDERS.
          </span>
          <h1 className="hero-title">
            A better place
            <br />
            to <span className="text-lime-200">get to work.</span>
          </h1>
          <p className="muted text-base md:text-lg max-w-lg leading-relaxed">
            Your next remote desktop starts here. Choose your compute, pick a
            country, and make it yours with Windows, Ubuntu, or Linux.
          </p>
          <div className="flex gap-4 flex-wrap mt-8">
            <a className="primary" href="#plans">
              Find your plan <ArrowUpRight size={17} />
            </a>
            <a className="secondary" href="#how-it-works">
              How it works
            </a>
          </div>
          <p className="muted text-xs mt-6 flex items-center gap-2">
            <ShieldCheck size={15} className="text-lime-200" /> Prepaid for 30
            days. No automatic renewals.
          </p>
        </div>
        <div
          className="hero-art"
          aria-label="Choose a tier, a country and an operating system"
        >
          <div className="orbit" aria-hidden="true" />
          <div className="server-preview">
            <div className="flex justify-between items-center mb-7">
              <span className="text-sm font-semibold flex gap-2 items-center">
                <Globe2 size={18} className="text-lime-200" /> Your next
                workspace
              </span>
              <span className="text-xs muted">01 — 03</span>
            </div>
            <div className="preview-row">
              <span className="flex gap-3 items-center">
                <Server size={18} className="text-lime-200" />
                Choose your tier
              </span>
              <Check size={16} className="text-lime-200" />
            </div>
            <div className="preview-row">
              <span className="flex gap-3 items-center">
                <MapPin size={18} className="text-lime-200" />
                Find your location
              </span>
              <span className="muted text-xs">100 countries</span>
            </div>
            <div className="preview-row">
              <span className="flex gap-3 items-center">
                <Monitor size={18} className="text-lime-200" />
                Make it familiar
              </span>
              <span className="muted text-xs">3 OS choices</span>
            </div>
            <div className="mt-7 pt-4 border-t border-white/10 flex justify-between text-xs">
              <span className="muted">One cart. Your configuration.</span>
              <ArrowUpRight size={16} className="text-lime-200" />
            </div>
          </div>
        </div>
      </section>
      <section id="how-it-works" className="feature-strip">
        {[
          [
            Server,
            "01",
            "Choose a plan",
            "Clear specs. One transparent monthly price.",
          ],
          [
            Globe2,
            "02",
            "Configure in your cart",
            "Choose your country and operating system.",
          ],
          [
            Layers3,
            "03",
            "Connect to your workspace",
            "Ready inventory is assigned after payment; otherwise, we prepare your server.",
          ],
        ].map(([Icon, n, title, description]) => {
          const I = Icon as typeof Server;
          return (
            <div className="flex gap-4 items-start" key={String(n)}>
              <span className="p-3 rounded-xl bg-lime-200/5 border border-lime-200/10">
                <I size={20} className="text-lime-200" />
              </span>
              <div>
                <h2 className="text-sm tracking-normal mb-2">
                  {String(title)}
                </h2>
                <p className="muted text-xs max-w-xs leading-relaxed">
                  {String(description)}
                </p>
              </div>
            </div>
          );
        })}
      </section>
      <section id="plans">
        <div className="flex flex-wrap gap-5 justify-between items-end mb-8">
          <div>
            <p className="eyebrow mb-3">COMPUTE THAT FITS</p>
            <h2 className="text-3xl md:text-4xl">
              Small start. Serious possibilities.
            </h2>
          </div>
          <p className="muted text-sm max-w-xs">
            Fixed hardware. Flexible location.
            <br />
            Configure your country and OS in the cart.
          </p>
        </div>
        <Catalog />
      </section>
      <section className="panel p-7 md:p-10 mt-12 flex flex-wrap gap-6 items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl">
            Your workspace, on your terms.
          </h2>
          <p className="muted text-sm mt-3">
            Residential IP plans for remote jobs, bot work, and trading.
          </p>
        </div>
        <a href="#plans" className="secondary">
          Explore the plans <ArrowUpRight size={16} />
        </a>
      </section>
    </main>
  );
}
