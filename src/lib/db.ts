import { PrismaClient, Prisma } from "@prisma/client";
const globalDB = globalThis as unknown as { db?: PrismaClient };
export const db = globalDB.db ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDB.db = db;
export async function atomic<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let n = 0; ; n++) {
    try {
      return await db.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034" &&
        n < 4
      )
        continue;
      throw e;
    }
  }
}
