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
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    throw e;
  }
  return (
    <main className="max-w-6xl mx-auto p-5 md:py-10">
      <DashboardNav />
      {children}
    </main>
  );
}
