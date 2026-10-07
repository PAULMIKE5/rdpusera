import { db } from "@/lib/db";
import { route, json } from "@/lib/http";
export const GET = route(async () =>
  json(
    await db.paymentMethod.findMany({
      where: {
        enabled: true,
        provider: {
          in: ["flutterwave", "flutterwave_ngn", "nowpayments", "manual"],
        },
      },
      select: {
        id: true,
        label: true,
        provider: true,
        instructions: true,
        usdToNgn: true,
      },
      orderBy: { label: "asc" },
    }),
  ),
);
