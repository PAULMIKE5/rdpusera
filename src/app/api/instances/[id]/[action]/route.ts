import { auth, origin, limit, HttpError, decrypt } from "@/lib/security";
import { route, json } from "@/lib/http";
import { db, atomic } from "@/lib/db";
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth();
  await limit(`action:${user.id}`, 20);
  const parts = new URL(req.url).pathname.split("/");
  const action = parts.pop()!;
  const id = parts.pop()!;
  return atomic(async (tx) => {
    const i = await tx.instance.findFirst({ where: { id, userId: user.id } });
    if (!i) throw new HttpError(404, "Instance not found");
    if (action === "credentials") {
      if (!i.secret || i.status !== "ACTIVE" || i.expiresAt <= new Date())
        throw new HttpError(409, "Credentials unavailable");
      await tx.audit.create({
        data: { actorId: user.id, action: "REVEAL_CREDENTIALS", targetId: id },
      });
      return json({
        ip: i.ip,
        port: i.port,
        username: i.username,
        password: decrypt(i.secret),
      });
    }
    if (!["restart", "terminate"].includes(action))
      throw new HttpError(404, "Unknown action");
    if (
      i.status !== "ACTIVE" ||
      (action === "restart" && i.expiresAt <= new Date())
    )
      throw new HttpError(409, "Instance is busy or inactive");
    await tx.instance.update({
      where: { id },
      data: { status: action === "restart" ? "RESTARTING" : "TERMINATING" },
    });
    await tx.job.create({
      data: {
        instanceId: id,
        state: i.controlMode === "MANUAL" ? "MANUAL_PENDING" : "PENDING",
        action: action === "restart" ? "RESTART" : "TERMINATE",
      },
    });
    await tx.audit.create({
      data: { actorId: user.id, action: action.toUpperCase(), targetId: id },
    });
    return json({ ok: true });
  });
});
export const GET = route(async (req) => {
  const { user } = await auth();
  const parts = new URL(req.url).pathname.split("/");
  if (parts.pop() !== "rdp") throw new HttpError(404, "Not found");
  const i = await db.instance.findFirst({
    where: { id: parts.pop(), userId: user.id },
    include: { plan: true },
  });
  if (
    !i?.ip ||
    i.status !== "ACTIVE" ||
    i.expiresAt <= new Date() ||
    !i.plan.os.startsWith("Windows")
  )
    throw new HttpError(409, "RDP unavailable");
  const clean = (v: string) => v.replace(/[\r\n]/g, "");
  return new Response(
    `full address:s:${i.ip.includes(":") ? `[${clean(i.ip)}]` : clean(i.ip)}:${i.port}\r\nusername:s:${clean(i.username ?? "Administrator")}\r\nprompt for credentials:i:1\r\nauthentication level:i:2\r\n`,
    {
      headers: {
        "Content-Type": "application/x-rdp",
        "Content-Disposition": 'attachment; filename="connection.rdp"',
        "Cache-Control": "no-store",
      },
    },
  );
});
