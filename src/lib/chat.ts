import { Prisma } from "@prisma/client";
import { db, atomic } from "./db";
import { HttpError } from "./security";
import { z } from "zod";
export const chatInput = z.object({
  userId: z.string().max(100).optional(),
  body: z.string().trim().min(1).max(4000),
  requestKey: z.string().uuid(),
});
export type ChatActor = { id: string; role: string };
export async function chatUser(actor: ChatActor, requested?: string) {
  if (actor.role !== "ADMIN" && requested && requested !== actor.id)
    throw new HttpError(403, "Access denied");
  const id = actor.role === "ADMIN" ? requested : actor.id;
  if (!id) throw new HttpError(400, "Select a customer");
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.deletedAt || user.disabled)
    throw new HttpError(404, "Customer unavailable");
  return user;
}
export async function systemMessage(
  tx: Prisma.TransactionClient,
  userId: string,
  body: string,
  requestKey: string,
) {
  const conversation = await tx.conversation.upsert({
    where: { userId },
    create: { userId },
    update: { updatedAt: new Date() },
  });
  return tx.chatMessage.create({
    data: {
      conversationId: conversation.id,
      senderId: "system",
      senderRole: "SYSTEM",
      body,
      requestKey,
    },
  });
}
export async function sendChat(
  actor: ChatActor,
  input: z.infer<typeof chatInput>,
) {
  const s = chatInput.parse(input);
  const user = await chatUser(actor, s.userId);
  return atomic(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (current.deletedAt || current.disabled)
      throw new HttpError(409, "Customer unavailable");
    const prior = await tx.chatMessage.findUnique({
      where: {
        senderId_requestKey: { senderId: actor.id, requestKey: s.requestKey },
      },
      include: { conversation: true },
    });
    if (prior) {
      if (prior.body !== s.body || prior.conversation.userId !== user.id)
        throw new HttpError(409, "Message key already used");
      return prior;
    }
    const conversation = await tx.conversation.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: { updatedAt: new Date() },
    });
    return tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: actor.id,
        senderRole: actor.role === "ADMIN" ? "ADMIN" : "USER",
        body: s.body,
        requestKey: s.requestKey,
      },
    });
  });
}
