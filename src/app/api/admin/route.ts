import { exchangeRateInput } from "@/lib/payment-currency";
import { randomUUID } from "node:crypto";
import {
  adminOperation,
  operationInput,
  assignmentInput,
  assignServer,
} from "@/lib/admin-operations";
import { registrationInput, registerAccount } from "@/lib/registration";
import { sendEmail } from "@/lib/email";
import { mailHelp, senderAddress } from "@/lib/email-provider";
import { checkout } from "@/lib/orders";
import { checkoutInput } from "@/lib/checkout-domain";
import { z } from "zod";
import {
  countries,
  operatingSystems,
  planDescription,
  checkoutSystems,
  osFamily,
} from "@/lib/countries";
import bcrypt from "bcryptjs";
import { auth, origin, limit, HttpError, encrypt } from "@/lib/security";
import { route, json, body } from "@/lib/http";
import { db, atomic } from "@/lib/db";
import { keyStatus, editableKeys } from "@/lib/config";
import { fulfill, cancelUnpaid } from "@/lib/orders";
import { deliveryInput, connectionInput } from "@/lib/checkout-domain";
import { confirmManualPayment, deleteAccount } from "@/lib/admin";
export const GET = route(async (req) => {
  await auth(true);
  const params = new URL(req.url).searchParams;
  const q = z
    .string()
    .max(100)
    .parse(params.get("q") ?? "");
  const archived = params.get("archived") === "true";
  const matchUser = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const userWhere = { deletedAt: null, ...matchUser };
  const orderWhere = {
    deletedAt: archived ? { not: null } : null,
    ...(q ? { OR: [{ id: { contains: q } }, { user: matchUser }] } : {}),
  };
  const paymentWhere = {
    deletedAt: archived ? { not: null } : null,
    ...(q ? { OR: [{ id: { contains: q } }, { user: matchUser }] } : {}),
  };
  if (params.get("lookup") === "users")
    return json(
      await db.user.findMany({
        where: userWhere,
        select: { id: true, email: true, name: true },
        take: 30,
        orderBy: { email: "asc" },
      }),
    );
  const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(new URL(req.url).searchParams.get("page") ?? 0),
    skip = page * 50;
  const [
    revenue,
    active,
    users,
    plans,
    locations,
    methods,
    keys,
    orders,
    instances,
    inventory,
    jobs,
    userCount,
    orderCount,
    instanceCount,
    transactions,
    transactionCount,
    pending,
    totalUsers,
    available,
    emailAttempts,
    audits,
    trend,
  ] = await Promise.all([
    db.ledger.aggregate({
      where: { kind: "PURCHASE" },
      _sum: { amount: true },
    }),
    db.instance.count({
      where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    }),
    db.user.findMany({
      where: userWhere,
      select: {
        id: true,
        email: true,
        name: true,
        countryCode: true,
        role: true,
        disabled: true,
        emailVerificationRequired: true,
        emailVerifiedAt: true,
        wallet: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: 50,
    }),
    db.plan.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ orderBy: { name: "asc" } }),
    db.paymentMethod.findMany(),
    keyStatus(),
    db.order.findMany({
      where: orderWhere,
      include: {
        user: { select: { email: true } },
        items: {
          include: {
            instance: { select: { id: true, status: true, planId: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: 50,
    }),
    db.instance.findMany({
      where: q ? { user: matchUser } : {},
      select: {
        id: true,
        userId: true,
        user: { select: { email: true } },
        plan: true,
        planId: true,
        status: true,
        ip: true,
        port: true,
        cpu: true,
        ram: true,
        disk: true,
        priceCents: true,
        expiresAt: true,
        controlMode: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: 50,
    }),
    db.inventoryServer.findMany({
      select: {
        id: true,
        planId: true,
        label: true,
        countryCode: true,
        os: true,
        ip: true,
        port: true,
        state: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.job.findMany({
      where: { state: { in: ["FAILED", "MANUAL_PENDING"] } },
      include: {
        instance: { select: { ip: true, user: { select: { email: true } } } },
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    }),
    db.user.count({ where: userWhere }),
    db.order.count({ where: orderWhere }),
    db.instance.count({ where: q ? { user: matchUser } : {} }),
    db.payment.findMany({
      where: paymentWhere,
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: 50,
    }),
    db.payment.count({ where: paymentWhere }),
    db.order.count({ where: { status: "PENDING", deletedAt: null } }),
    db.user.count({ where: { deletedAt: null } }),
    db.inventoryServer.count({ where: { state: "AVAILABLE" } }),
    db.emailAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    db.audit.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    db.$queryRaw<
      { day: string; cents: number }[]
    >`SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, CAST(-SUM(amount) AS DOUBLE PRECISION) AS cents FROM "Ledger" WHERE kind = 'PURCHASE' AND "createdAt" >= NOW() - INTERVAL '14 days' GROUP BY day ORDER BY day`,
  ]);
  return json({
    revenue: -(revenue._sum.amount ?? 0),
    transactions,
    pending,
    totalUsers,
    available,
    emailAttempts: emailAttempts.map((e) => ({
      ...e,
      help:
        mailHelp[e.code] ??
        "Accepted by Resend; delivery can be checked in the Resend dashboard.",
    })),
    audits,
    trend,
    active,
    users,
    plans,
    locations,
    methods,
    keys,
    orders,
    instances,
    inventory,
    jobs,
    page,
    pages: Math.max(
      1,
      Math.ceil(
        Math.max(userCount, orderCount, instanceCount, transactionCount) / 50,
      ),
    ),
  });
});
const planSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(100),
  locationId: z.string().optional(),
  countryCode: z.string().optional(),
  description: z.string().trim().min(1).max(2000).default(planDescription),
  os: z.enum(operatingSystems),
  cpu: z.number().int().min(1).max(32),
  ram: z.number().int().min(1).max(128),
  disk: z.number().int().min(20).max(2000),
  baseCents: z.number().int().min(10).max(100000),
  stock: z.number().int().min(0).max(10000),
  enabled: z.boolean(),
});
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), data: planSchema }),
  z.object({
    action: z.literal("location"),
    id: z.string().optional(),
    name: z.string().trim().min(2).max(100),
    region: z.string().trim().min(2).max(40),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("method"),
    id: z.string().optional(),
    label: z.string().trim().min(2).max(80),
    provider: z.enum([
      "flutterwave",
      "flutterwave_ngn",
      "nowpayments",
      "manual",
      "stripe",
      "crypto",
    ]),
    instructions: z.string().max(2000),
    usdToNgn: z.string().trim().max(20).optional(),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("key"),
    name: z.enum(editableKeys),
    value: z.string().min(1).max(4096),
    password: z.string().max(72),
  }),
  z.object({
    action: z.literal("disable"),
    id: z.string(),
    disabled: z.boolean(),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string(),
    password: z.string().max(72),
  }),
  z.object({
    action: z.literal("confirmPayment"),
    id: z.string(),
    password: z.string().max(72),
  }),
  z.object({ action: z.literal("cancel"), id: z.string() }),
  z.object({ action: z.literal("fulfill"), data: deliveryInput }),
  z.object({
    action: z.literal("inventory"),
    data: connectionInput.omit({ id: true }).extend({
      planId: z.string(),
      label: z.string().min(1).max(100),
      countryCode: z
        .string()
        .refine((v) => countries.some((c) => c.code === v)),
      os: z.enum(checkoutSystems),
    }),
  }),
  z.object({ action: z.literal("retireInventory"), id: z.string() }),
  z.object({
    action: z.literal("userPlan"),
    id: z.string(),
    planId: z.string(),
    expiresAt: z.string().datetime(),
  }),
  z.object({ action: z.literal("job"), id: z.string() }),
  z.object({ action: z.literal("retry"), id: z.string() }),
]);
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth(true);
  await limit(`admin:${user.id}`, 60);
  const raw = await body(req);
  if (
    typeof raw.action === "string" &&
    operationInput.options.some(
      (schema) => schema.shape.action.value === raw.action,
    )
  ) {
    const op = operationInput.parse(raw);
    await limit(`admin-sensitive:${user.id}`, 20, 900);
    if (!(await bcrypt.compare(op.password, user.password)))
      throw new HttpError(403, "Administrator password is incorrect");
    await adminOperation(user.id, op);
    return json({ ok: true });
  }
  if (
    ["assignServer", "emailTest", "userCreate", "orderCreate"].includes(
      raw.action,
    )
  ) {
    const secret = z.string().max(72).parse(raw.adminPassword);
    await limit(`admin-sensitive:${user.id}`, 20, 900);
    if (!(await bcrypt.compare(secret, user.password)))
      throw new HttpError(403, "Administrator password is incorrect");
    if (raw.action === "assignServer") {
      const instance = await assignServer(
        user.id,
        assignmentInput.parse({ ...raw.data, password: secret }),
      );
      return json({ ok: true, instanceId: instance.id });
    }
    if (raw.action === "emailTest") {
      await limit(`email-test:${user.id}`, 3, 300);
      const providerId = await sendEmail(
        user.email,
        "GlobalRDP email configuration test",
        "Your email integration accepted this test. Registration codes use the same sender and API key.",
        `test/${randomUUID()}`,
        "ADMIN_TEST",
        true,
      );
      return json({ ok: true, providerId });
    }
    if (raw.action === "userCreate") {
      const data = registrationInput.parse(raw.data);
      const existing = await db.user.findUnique({
        where: { email: data.email },
      });
      if (existing)
        throw new HttpError(409, "Account already exists; use Edit profile");
      await registerAccount(data);
      await db.audit.create({
        data: {
          actorId: user.id,
          action: "CREATE_ACCOUNT",
          targetId: data.email,
        },
      });
      return json({ ok: true });
    }
    const data = z
      .object({ userId: z.string(), checkout: checkoutInput })
      .parse(raw.data);
    if (data.checkout.method !== "wallet") {
      const method = await db.paymentMethod.findUnique({
        where: { id: data.checkout.method },
      });
      if (method?.provider !== "manual")
        throw new HttpError(400, "Admin orders use wallet or manual payment");
    }
    const order = await checkout(data.userId, data.checkout);
    await db.audit.create({
      data: {
        actorId: user.id,
        action: "CREATE_CUSTOMER_ORDER",
        targetId: order.id,
      },
    });
    return json({ ok: true, orderId: order.id });
  }
  const s = input.parse(raw);
  if ("password" in s) {
    await limit(`admin-sensitive:${user.id}`, 8, 900);
    if (!(await bcrypt.compare(s.password, user.password)))
      throw new HttpError(403, "Administrator password is incorrect");
  }
  if (s.action === "fulfill") {
    await fulfill(user.id, s.data);
    return json({ ok: true });
  }
  if (s.action === "confirmPayment") {
    await confirmManualPayment(user.id, s.id);
    return json({ ok: true });
  }
  if (s.action === "delete") {
    await deleteAccount(user.id, s.id);
    return json({ ok: true });
  }
  if (s.action === "cancel") {
    await cancelUnpaid(user.id, s.id, true);
    return json({ ok: true });
  }
  await atomic(async (tx) => {
    if (s.action === "plan") {
      const { id, ...data } = s.data;
      const country = countries.find((c) => c.code === data.countryCode);
      if (data.countryCode && !country)
        throw new HttpError(400, "Select a supported country");
      const previous = id
        ? await tx.plan.findUniqueOrThrow({ where: { id } })
        : null;
      const keepLocation =
        previous &&
        previous.countryCode === (data.countryCode || null) &&
        data.locationId === previous.locationId;
      const loc =
        country && !keepLocation
          ? await tx.location.upsert({
              where: {
                region_name: { region: country.region, name: country.name },
              },
              create: { name: country.name, region: country.region },
              update: {},
            })
          : data.locationId
            ? await tx.location.findUnique({ where: { id: data.locationId } })
            : null;
      if (loc) data.locationId = loc.id;
      if (!loc) throw new HttpError(400, "Select a location");
      if (id) {
        const old = await tx.plan.findUniqueOrThrow({ where: { id } });
        const structuralChange =
          old.os !== data.os ||
          old.locationId !== data.locationId ||
          old.cpu !== data.cpu ||
          old.ram !== data.ram ||
          old.disk !== data.disk;
        if (
          structuralChange &&
          ((await tx.instance.count({
            where: { planId: id, status: { not: "TERMINATED" } },
          })) ||
            (await tx.orderItem.count({
              where: {
                planId: id,
                order: { status: { in: ["AWAITING_PAYMENT", "PENDING"] } },
              },
            })) ||
            (await tx.inventoryServer.count({
              where: { planId: id, state: { not: "RETIRED" } },
            })))
        )
          throw new HttpError(
            409,
            "This plan has live commitments. Create a new plan to change specs, OS or location; pricing and available stock remain editable.",
          );
      }
      const value = { ...data, region: loc.region, location: loc.name };
      if (id) await tx.plan.update({ where: { id }, data: value });
      else await tx.plan.create({ data: value });
    }
    if (s.action === "location") {
      const { action, id, ...data } = s;
      const loc = id
        ? await tx.location.update({ where: { id }, data })
        : await tx.location.create({ data });
      await tx.plan.updateMany({
        where: { locationId: loc.id },
        data: { region: loc.region, location: loc.name },
      });
    }
    if (s.action === "method") {
      const { action, id, usdToNgn, ...fields } = s;
      const rate =
        fields.provider === "flutterwave_ngn" && usdToNgn
          ? exchangeRateInput.parse(usdToNgn)
          : null;
      if (fields.provider === "flutterwave_ngn" && fields.enabled && !rate)
        throw new HttpError(
          400,
          "Enter the NGN per $1 exchange rate before enabling Naira payments",
        );
      const data = { ...fields, usdToNgn: rate };
      if (["stripe", "crypto"].includes(data.provider) && data.enabled)
        throw new HttpError(
          400,
          "Use Flutterwave or NOWPayments for new payments",
        );
      if (id) {
        const old = await tx.paymentMethod.findUniqueOrThrow({ where: { id } });
        if (old.provider !== data.provider)
          throw new HttpError(
            400,
            "Create a new method to change the provider",
          );
        await tx.paymentMethod.update({ where: { id }, data });
      } else await tx.paymentMethod.create({ data });
    }
    if (s.action === "key") {
      if (s.name === "EMAIL_FROM") senderAddress.parse(s.value);
      await tx.systemKey.upsert({
        where: { name: s.name },
        create: { name: s.name, ciphertext: encrypt(s.value.trim()) },
        update: { ciphertext: encrypt(s.value.trim()) },
      });
    }
    if (s.action === "disable") {
      const target = await tx.user.findUnique({ where: { id: s.id } });
      if (!target || target.role === "ADMIN" || target.deletedAt)
        throw new HttpError(400, "Cannot change this account");
      await tx.user.update({
        where: { id: s.id },
        data: { disabled: s.disabled },
      });
      if (s.disabled) await tx.session.deleteMany({ where: { userId: s.id } });
    }
    if (s.action === "inventory") {
      const { password, ...data } = s.data;
      if (!(await tx.plan.findUnique({ where: { id: data.planId } })))
        throw new HttpError(
          400,
          "Select an existing plan before adding a server",
        );
      await tx.inventoryServer.create({
        data: { ...data, secret: encrypt(password) },
      });
    }
    if (s.action === "retireInventory") {
      const r = await tx.inventoryServer.updateMany({
        where: { id: s.id, state: "AVAILABLE" },
        data: { state: "RETIRED", secret: "" },
      });
      if (!r.count)
        throw new HttpError(409, "Only unassigned servers may be retired");
    }
    if (s.action === "userPlan") {
      const instance = await tx.instance.findUniqueOrThrow({
        where: { id: s.id },
        include: { plan: true },
      });
      if (instance.status !== "ACTIVE")
        throw new HttpError(409, "Only active instances can change plans");
      const plan = await tx.plan.findUniqueOrThrow({ where: { id: s.planId } });
      if (
        osFamily(instance.os ?? instance.plan.os) !== osFamily(plan.os) ||
        (instance.countryCode ?? instance.plan.countryCode) !== plan.countryCode
      )
        throw new HttpError(
          409,
          "Changing OS/location requires replacement delivery",
        );
      if (instance.planId !== plan.id) {
        const reserved = await tx.plan.updateMany({
          where: { id: plan.id, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        });
        if (!reserved.count)
          throw new HttpError(409, "Target plan is out of stock");
        await tx.plan.update({
          where: { id: instance.planId },
          data: { stock: { increment: 1 } },
        });
      }
      await tx.instance.update({
        where: { id: s.id },
        data: {
          planId: plan.id,
          cpu: plan.cpu,
          ram: plan.ram,
          disk: plan.disk,
          expiresAt: new Date(s.expiresAt),
        },
      });
    }
    if (s.action === "job") {
      const job = await tx.job.findUniqueOrThrow({
        where: { id: s.id },
        include: { instance: true },
      });
      if (job.state !== "MANUAL_PENDING")
        throw new HttpError(409, "Task is no longer pending");
      await tx.job.update({ where: { id: s.id }, data: { state: "DONE" } });
      await tx.instance.update({
        where: { id: job.instanceId },
        data:
          job.action === "TERMINATE"
            ? { status: "TERMINATED", secret: null }
            : { status: "ACTIVE" },
      });
      if (job.action === "TERMINATE") {
        await tx.plan.update({
          where: { id: job.instance.planId },
          data: { stock: { increment: 1 } },
        });
        if (job.instance.inventoryId)
          await tx.inventoryServer.update({
            where: { id: job.instance.inventoryId },
            data: { state: "RETIRED", secret: "" },
          });
      }
    }
    if (s.action === "retry")
      await tx.job.updateMany({
        where: { id: s.id, state: "FAILED" },
        data: { state: "PENDING", attempts: 0, runAt: new Date() },
      });
    await tx.audit.create({
      data: {
        actorId: user.id,
        action: `ADMIN_${s.action}`,
        targetId:
          "id" in s ? (s.id ?? "new") : "name" in s ? s.name : "configuration",
      },
    });
  });
  return json({ ok: true });
});
