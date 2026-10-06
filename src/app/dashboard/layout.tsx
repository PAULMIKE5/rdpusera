import { auth, HttpError } from "@/lib/security";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/workspace";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await auth();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401)
      redirect("/login?next=/dashboard");
    throw e;
  }
  return (
    <main className="page-shell">
      <DashboardNav />
      {children}
    </main>
  );
}
