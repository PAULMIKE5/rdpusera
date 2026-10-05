import { auth, demo } from "@/lib/security";
import { route, json } from "@/lib/http";
import { db } from "@/lib/db";
export const GET = route(async () => {
  const { user } = await auth();
  const ledger = await db.ledger.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    wallet: user.wallet,
    demo: demo(),
    ledger,
  });
});
