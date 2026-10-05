import { Catalog } from "@/components/catalog";
export default function Home() {
  return (
    <main className="max-w-6xl mx-auto p-6 md:py-16">
      <section className="mb-14">
        <p className="text-lime-300 text-xs tracking-widest mb-5">
          YOUR NEXT WORKSPACE, ANYWHERE
        </p>
        <h1 className="text-4xl md:text-6xl font-semibold max-w-3xl leading-tight">
          Global servers.
          <br />
          Personal delivery.
        </h1>
        <p className="muted mt-6 max-w-xl text-lg">
          Find your Windows RDP or Linux VPS. Choose a plan, pay securely, and
          receive available servers automatically. If inventory is unavailable,
          our team prepares your server.
        </p>
        <div className="flex gap-4 mt-8">
          <a className="primary" href="#plans">
            Explore plans
          </a>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {[
            "1. Configure and add to cart",
            "2. Pay securely",
            "3. Instant assignment or pending delivery",
          ].map((t) => (
            <div className="panel p-5" key={t}>
              {t}
            </div>
          ))}
        </div>
      </section>
      <section id="plans">
        <h2 className="text-2xl mb-6">Available RDP & VPS plans</h2>
        <Catalog />
      </section>
    </main>
  );
}
