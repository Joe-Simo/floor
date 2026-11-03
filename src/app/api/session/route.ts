import { NextResponse } from "next/server";
import { z } from "zod";
import { groupIdFor, isRoomCode } from "@/lib/ids";
import { createGroup, GROUP_EXISTS, GROUP_MISSING, issueToken, joinGroup, nexconnConfig, NexconnError } from "@/lib/nexconn-server";

export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().refine(isRoomCode, "bad room code"),
  userId: z.string().regex(/^u-[a-z0-9]{3,40}$/),
  name: z.string().trim().max(40).default(""),
  host: z.boolean().default(false),
  title: z.string().trim().max(80).optional(),
});

const hits = new Map<string, { n: number; reset: number }>();
function limited(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n++;
  return h.n > max;
}

/** Hands the browser what it needs to join a room: demo mode, or a Nexconn App Key plus a user token. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ error: "Too many joins from here. Try again in a minute." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That room link does not look right." }, { status: 400 });
  const { code, userId, name, host, title } = parsed.data;

  const cfg = nexconnConfig();
  if (!cfg) return NextResponse.json({ mode: "local" as const });

  const groupId = groupIdFor(code);
  try {
    const token = await issueToken(cfg, userId, name || "Guest");
    let hostId: string | undefined;
    if (host) {
      try {
        await createGroup(cfg, groupId, title || `Floor ${code}`, userId);
        hostId = userId;
      } catch (e) {
        // Host came back (reload, second device): the channel is already there, so just join it.
        if (!(e instanceof NexconnError && (e.code === GROUP_EXISTS || e.status === 409))) throw e;
        hostId = await joinGroup(cfg, groupId, userId);
      }
    } else {
      hostId = await joinGroup(cfg, groupId, userId);
    }
    // hostId is the channel owner. Clients accept catch-up snapshots only from that user.
    return NextResponse.json({ mode: "nexconn" as const, appKey: cfg.appKey, area: cfg.area, token, groupId, userId, hostId });
  } catch (e) {
    if (e instanceof NexconnError && e.code === GROUP_MISSING) {
      return NextResponse.json({ error: "This room is not open yet. Check the code with the host, or wait for them to open it." }, { status: 404 });
    }
    const detail = e instanceof NexconnError ? `${e.path} ${e.status} ${e.code ?? ""}`.trim() : "unexpected";
    console.error("session failed", detail);
    return NextResponse.json({ error: "Could not reach the chat service. Try again in a moment.", detail }, { status: 502 });
  }
}
