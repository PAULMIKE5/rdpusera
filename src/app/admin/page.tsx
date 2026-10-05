import { auth, HttpError } from "@/lib/security";
import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/admin-panel";
export default async function Admin() {
  try {
    await auth(true);
  } catch (e) {
    if (e instanceof HttpError)
      redirect(e.status === 401 ? "/login" : "/dashboard");
    throw e;
  }
  return (
    <main className="max-w-7xl mx-auto p-5 md:py-10">
      <AdminPanel />
    </main>
  );
}
