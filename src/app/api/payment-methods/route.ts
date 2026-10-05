import { db } from "@/lib/db";
import { route, json } from "@/lib/http";
export const GET = route(async () =>
  json(
    await db.paymentMethod.findMany({
      where: {
        enabled: true,
        provider: { in: ["flutterwave", "nowpayments", "manual"] },
      },
      select: { id: true, label: true, provider: true, instructions: true },
      orderBy: { label: "asc" },
    }),
  ),
);
