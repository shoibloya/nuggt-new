// app/api/create-user/route.ts
/* 
import { NextResponse } from "next/server";
import { rtdb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  const { adminKey, username, password } = await req.json();

  if (adminKey !== process.env.ADMIN_KEY) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Missing username/password" }, { status: 400 });
  }

  await rtdb.ref(`auth/users/${username}`).set({ password });
  return NextResponse.json({ ok: true });
}
*/