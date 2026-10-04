import { Prisma } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "./security";
export async function body(req: Request) {
  const text = await req.text();
  if (Buffer.byteLength(text) > 16384)
    throw new HttpError(413, "Request too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function route(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof z.ZodError)
        return json(
          { error: "Invalid input", fields: e.flatten().fieldErrors },
          400,
        );
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        return json({ error: "Record already exists; refresh and retry" }, 409);
      console.error(
        JSON.stringify({
          event: "request_failed",
          type: e instanceof Error ? e.name : "Unknown",
        }),
      );
      return json({ error: "Request failed. Please try again." }, 500);
    }
  };
}
