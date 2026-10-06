import { z } from "zod";
import { atomic } from "./db";
import { HttpError, encrypt } from "./security";
import { profileInput } from "./registration";
import { connectionInput } from "./checkout-domain";
import { countries, checkoutSystems } from "./countries";
import { systemMessage } from "./chat";
const password = z.string().max(72);
const reason = z.string().trim().min(5).max(1000);
const cents = z.number().int().min(0).max(100000000);
const id = z.string().min(1).max(100);
export const operationInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("balance"),
    id,
    wallet: cents,
    expectedWallet: cents,
    reason,
    requestKey: z.string().uuid(),
    password,
  }),
  z.object({
    action: z.literal("transactionCreate"),
    userId: id,
    cents: z
      .number()
      .int()
      .min(-100000000)
      .max(100000000)
      .refine((v) => v !== 0),
    notes: reason,
    requestKey: z.string().uuid(),
    password,
  }),
  z.object({
    action: z.literal("transactionEdit"),
    id,
    cents: z.number().int().min(-100000000).max(100000000),
    notes: reason,
    version: z.number().int().min(0),
    password,
  }),
  z.object({ action: z.literal("transactionDelete"), id, reason, password }),
  z.object({ action: z.literal("transactionRestore"), id, reason, password }),
  z.object({ action: z.literal("orderDelete"), id, reason, password }),
  z.object({ action: z.literal("orderRestore"), id, reason, password }),
  z.object({
    action: z.literal("orderEdit"),
    id,
    notes: z.string().trim().max(2000),
    password,
  }),
  z.object({
    action: z.literal("userEdit"),
    id,
    ...profileInput.shape,
    password,
  }),
]);
export async function adminOperation(
  actorId: string,
  input: z.infer<typeof operationInput>,
) {
  const s = operationInput.parse(input);
  return atomic(async (tx) => {
    let details: object = {},
      target = "id" in s ? s.id : s.userId;
    if (s.action === "balance" || s.action === "transactionCreate") {
      const userId = s.action === "balance" ? s.id : s.userId;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.deletedAt)
        throw new HttpError(404, "Account not found");
      const reference = `admin:${actorId}:${s.requestKey}`;
      const previous = await tx.ledger.findUnique({ where: { reference } });
      if (previous) {
        const expected =
          s.action === "balance" ? s.wallet - s.expectedWallet : s.cents;
        if (previous.userId !== userId || previous.amount !== expected)
          throw new HttpError(409, "Request key already used");
        return;
      }
      if (s.action === "balance" && user.wallet !== s.expectedWallet)
        throw new HttpError(
          409,
          "Balance changed. Refresh and review the latest balance.",
        );
      const delta = s.action === "balance" ? s.wallet - user.wallet : s.cents;
      const wallet = user.wallet + delta;
      if (wallet < 0 || wallet > 100000000)
        throw new HttpError(
          409,
          "Adjustment would put the wallet outside its allowed range",
        );
      await tx.user.update({ where: { id: userId }, data: { wallet } });
      await tx.ledger.create({
        data: { userId, amount: delta, kind: "ADMIN_ADJUSTMENT", reference },
      });
      await tx.payment.create({
        data: {
          userId,
          cents: delta,
          provider: "admin_adjustment",
          status: "PAID",
          notes: s.action === "balance" ? s.reason : s.notes,
          requestKey: reference,
        },
      });
      details = {
        before: user.wallet,
        after: wallet,
        delta,
        reason: s.action === "balance" ? s.reason : s.notes,
      };
    } else if (s.action.startsWith("transaction")) {
      const p = await tx.payment.findUnique({ where: { id: s.id } });
      if (!p) throw new HttpError(404, "Transaction not found");
      if (s.action === "transactionEdit") {
        if (p.deletedAt)
          throw new HttpError(409, "Restore the transaction before editing");
        if (p.version !== s.version)
          throw new HttpError(
            409,
            "Transaction changed. Refresh before editing.",
          );
        if (s.cents !== p.cents && p.provider !== "admin_adjustment")
          throw new HttpError(
            409,
            "Provider payment amounts are fixed. Create a credit/debit adjustment instead.",
          );
        const delta = s.cents - p.cents;
        const user = await tx.user.findUniqueOrThrow({
          where: { id: p.userId },
        });
        if (user.deletedAt) throw new HttpError(409, "Account deleted");
        if (user.wallet + delta < 0 || user.wallet + delta > 100000000)
          throw new HttpError(
            409,
            "Adjustment exceeds the available balance or limit",
          );
        if (delta) {
          await tx.user.update({
            where: { id: p.userId },
            data: { wallet: { increment: delta } },
          });
          await tx.ledger.create({
            data: {
              userId: p.userId,
              amount: delta,
              kind: "ADMIN_CORRECTION",
              reference: `correction:${p.id}:${p.version + 1}`,
            },
          });
        }
        await tx.payment.update({
          where: { id: p.id },
          data: { cents: s.cents, notes: s.notes, version: { increment: 1 } },
        });
        details = {
          before: { cents: p.cents, notes: p.notes },
          after: { cents: s.cents, notes: s.notes },
        };
      } else if (
        s.action === "transactionDelete" ||
        s.action === "transactionRestore"
      ) {
        if (s.action === "transactionDelete" && p.status === "PENDING")
          throw new HttpError(
            409,
            "Reconcile the pending payment before deleting it. Deletion does not cancel a gateway charge.",
          );
        await tx.payment.update({
          where: { id: p.id },
          data: {
            deletedAt: s.action === "transactionDelete" ? new Date() : null,
            version: { increment: 1 },
          },
        });
        details = { reason: s.reason, walletUnchanged: true };
      }
    } else if (s.action === "userEdit") {
      const user = await tx.user.findUnique({ where: { id: s.id } });
      if (!user || user.deletedAt)
        throw new HttpError(404, "Account not found");
      await tx.user.update({
        where: { id: s.id },
        data: { name: s.name, countryCode: s.countryCode },
      });
      details = {
        before: { name: user.name, countryCode: user.countryCode },
        after: { name: s.name, countryCode: s.countryCode },
      };
    } else if (
      s.action === "orderDelete" ||
      s.action === "orderRestore" ||
      s.action === "orderEdit"
    ) {
      const o = await tx.order.findUnique({
        where: { id: s.id },
        include: { items: true },
      });
      if (!o) throw new HttpError(404, "Order not found");
      if (s.action === "orderEdit") {
        await tx.order.update({
          where: { id: o.id },
          data: { notes: s.notes },
        });
        details = { before: o.notes, after: s.notes };
      } else {
        if (s.action === "orderDelete" && o.status === "PENDING")
          throw new HttpError(
            409,
            "Deliver or resolve this paid order before deleting it",
          );
        if (s.action === "orderDelete" && o.status === "AWAITING_PAYMENT") {
          for (const item of o.items)
            await tx.plan.update({
              where: { id: item.planId },
              data: { stock: { increment: 1 } },
            });
          await tx.order.update({
            where: { id: o.id },
            data: { status: "CANCELLED" },
          });
          if (o.method === "manual")
            await tx.payment.updateMany({
              where: { orderId: o.id, status: "PENDING" },
              data: { status: "CANCELLED" },
            });
        }
        await tx.order.update({
          where: { id: o.id },
          data: { deletedAt: s.action === "orderDelete" ? new Date() : null },
        });
        details = { reason: s.reason, previousStatus: o.status };
      }
    }
    await tx.audit.create({
      data: {
        actorId,
        action: `ADMIN_${s.action}`,
        targetId: target,
        details: details as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  });
}
export const assignmentInput = z
  .object({
    userId: id,
    planId: id,
    inventoryId: z.string().optional(),
    connection: connectionInput.omit({ id: true }).optional(),
    countryCode: profileInput.shape.countryCode,
    os: z.enum(checkoutSystems),
    days: z.number().int().min(1).max(366),
    reason,
    requestKey: z.string().uuid(),
    password,
  })
  .refine(
    (v) => Boolean(v.inventoryId) !== Boolean(v.connection),
    "Choose inventory or manual access details, not both",
  );
export async function assignServer(
  actorId: string,
  input: z.infer<typeof assignmentInput>,
) {
  const s = assignmentInput.parse(input);
  return atomic(async (tx) => {
    const prior = await tx.instance.findUnique({
      where: {
        userId_requestKey: {
          userId: s.userId,
          requestKey: `assignment:${s.requestKey}`,
        },
      },
    });
    if (prior) {
      if (
        prior.planId !== s.planId ||
        prior.countryCode !== s.countryCode ||
        prior.os !== s.os ||
        (prior.inventoryId ?? undefined) !== s.inventoryId ||
        (s.connection &&
          (prior.ip !== s.connection.ip ||
            prior.port !== s.connection.port ||
            prior.username !== s.connection.username))
      )
        throw new HttpError(
          409,
          "Assignment key already used. Refresh for a new assignment.",
        );
      return prior;
    }
    const user = await tx.user.findUnique({ where: { id: s.userId } });
    if (
      !user ||
      user.disabled ||
      user.deletedAt ||
      (user.emailVerificationRequired && !user.emailVerifiedAt)
    )
      throw new HttpError(409, "Select an active, verified customer");
    const plan = await tx.plan.findUnique({ where: { id: s.planId } });
    if (!plan?.enabled) throw new HttpError(409, "Plan unavailable");
    let connection: {
      ip: string;
      port: number;
      username: string;
      secret: string;
      inventoryId?: string;
    };
    if (s.inventoryId) {
      const server = await tx.inventoryServer.findUnique({
        where: { id: s.inventoryId },
        include: { instance: true },
      });
      if (
        !server ||
        server.state !== "AVAILABLE" ||
        server.instance ||
        server.planId !== s.planId ||
        server.countryCode !== s.countryCode ||
        server.os !== s.os
      )
        throw new HttpError(
          409,
          "Inventory must be available and match the plan, country and OS",
        );
      const claim = await tx.inventoryServer.updateMany({
        where: { id: server.id, state: "AVAILABLE" },
        data: { state: "ASSIGNED" },
      });
      if (!claim.count) throw new HttpError(409, "Server already assigned");
      connection = {
        ip: server.ip,
        port: server.port,
        username: server.username,
        secret: server.secret,
        inventoryId: server.id,
      };
    } else {
      const c = s.connection!;
      if (
        await tx.inventoryServer.count({
          where: { ip: c.ip, port: c.port, state: { not: "RETIRED" } },
        })
      )
        throw new HttpError(
          409,
          "This address exists in inventory. Assign it from inventory.",
        );
      connection = {
        ip: c.ip,
        port: c.port,
        username: c.username,
        secret: encrypt(c.password),
      };
    }
    if (
      await tx.instance.count({
        where: {
          ip: connection.ip,
          port: connection.port,
          status: { not: "TERMINATED" },
        },
      })
    )
      throw new HttpError(409, "Server address already assigned");
    const stock = await tx.plan.updateMany({
      where: { id: plan.id, stock: { gt: 0 } },
      data: { stock: { decrement: 1 } },
    });
    if (!stock.count)
      throw new HttpError(
        409,
        "Increase available plan capacity before assigning a server",
      );
    const instance = await tx.instance.create({
      data: {
        userId: user.id,
        planId: plan.id,
        ...connection,
        cpu: plan.cpu,
        ram: plan.ram,
        disk: plan.disk,
        countryCode: s.countryCode,
        location: countries.find((c) => c.code === s.countryCode)!.name,
        os: s.os,
        priceCents: 0,
        status: "ACTIVE",
        controlMode: "MANUAL",
        expiresAt: new Date(Date.now() + s.days * 86400000),
        requestKey: `assignment:${s.requestKey}`,
      },
    });
    await systemMessage(
      tx,
      user.id,
      `Your ${plan.name} server is ready. Open My instances to securely view your connection details. Expires ${instance.expiresAt.toISOString().slice(0, 10)}.`,
      `assignment:${instance.id}`,
    );
    await tx.audit.create({
      data: {
        actorId,
        action: "ASSIGN_SERVER",
        targetId: instance.id,
        details: { userId: user.id, reason: s.reason, priceCents: 0 },
      },
    });
    return instance;
  });
}
