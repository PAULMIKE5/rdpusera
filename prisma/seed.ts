import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
async function main() {
  const regions = [
    ["US", "New York"],
    ["EU", "Frankfurt"],
    ["ASIA", "Singapore"],
  ];
  for (const [region, location] of regions)
    for (const [n, os] of [
      "Windows Server 2019",
      "Windows Server 2022",
      "Ubuntu 24.04",
    ].entries()) {
      const id = `seed-${region}-${n}`;
      await db.plan.upsert({
        where: { id },
        update: {},
        create: {
          id,
          name: n === 2 ? "Linux Compute" : "Windows Performance",
          region,
          location,
          os,
          cpu: 2,
          ram: 4,
          disk: 80,
          baseCents: n === 2 ? 1400 : 2400,
          stock: 20,
        },
      });
    }
  const email = process.env.ADMIN_EMAIL,
    password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (Buffer.byteLength(password) > 72 || password.length < 16)
      throw Error("Admin password must be 16–72 bytes");
    await db.user.upsert({
      where: { email: email.toLowerCase() },
      update: {},
      create: {
        email: email.toLowerCase(),
        password: await bcrypt.hash(password, 12),
        role: "ADMIN",
      },
    });
  }
}
main().finally(() => db.$disconnect());
