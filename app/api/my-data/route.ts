// app/api/my-data/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rtdb } from "@/lib/firebase-admin";

export async function GET() {
  const username = cookies().get("session")?.value;
  if (!username) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const snap = await rtdb.ref(`analyticsDashaboard/${username}`).get();
  return NextResponse.json({ ok: true, data: snap.val() ?? null });
}
