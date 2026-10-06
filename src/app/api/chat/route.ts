import { z } from "zod";
import { route, json, body } from "@/lib/http";
import { auth, origin, limit } from "@/lib/security";
import { db } from "@/lib/db";
import { chatUser, sendChat, chatInput } from "@/lib/chat";
export const GET = route(async (req) => {
  const { user } = await auth();
  await limit(`chat-read:${user.id}`, 120);
  const query = new URL(req.url).searchParams;
  if (user.role === "ADMIN" && !query.get("userId")) {
    const q = z
      .string()
      .max(100)
      .parse(query.get("q") ?? "");
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(query.get("page") ?? 0);
    const where = {
      user: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" as const } },
                { name: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
    };
    const [threads, count] = await Promise.all([
      db.conversation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: page * 30,
        take: 30,
        include: {
          user: { select: { id: true, email: true, name: true } },
          messages: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
      }),
      db.conversation.count({ where }),
    ]);
    return json({ threads, pages: Math.max(1, Math.ceil(count / 30)) });
  }
  const customer = await chatUser(user, query.get("userId") ?? undefined);
  const thread = await db.conversation.findUnique({
    where: { userId: customer.id },
  });
  if (!thread) return json({ thread: null, messages: [], hasMore: false });
  const before = query.get("before");
  const cursor = before
    ? await db.chatMessage.findFirst({
        where: { id: before, conversationId: thread.id },
      })
    : null;
  const messages = await db.chatMessage.findMany({
    where: {
      conversationId: thread.id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 51,
  });
  return json({
    thread,
    messages: messages.slice(0, 50).reverse(),
    hasMore: messages.length > 50,
  });
});
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth();
  const input = await body(req);
  if (input.action === "read") {
    await limit(`chat-read-mark:${user.id}`, 60);
    const s = z
      .object({ userId: z.string().optional(), messageId: z.string() })
      .parse(input);
    const target = await chatUser(user, s.userId);
    const message = await db.chatMessage.findFirst({
      where: { id: s.messageId, conversation: { userId: target.id } },
    });
    if (message)
      await db.conversation.update({
        where: { id: message.conversationId },
        data:
          user.role === "ADMIN"
            ? { adminReadAt: message.createdAt }
            : { userReadAt: message.createdAt },
      });
    return json({ ok: true });
  }
  await limit(`chat-send:${user.id}`, 20);
  return json(await sendChat(user, chatInput.parse(input)));
});
