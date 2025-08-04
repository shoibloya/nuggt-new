// app/api/login/route.ts
/*
import { NextResponse } from "next/server";
import { rtdb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });
  }

  const snap = await rtdb.ref(`auth/users/${username}/password`).get();
  const stored = snap.val();

  if (!stored || stored !== password) {
    return NextResponse.json({ ok: false, error: "Invalid username/password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  // store username in an httpOnly cookie (demo; plaintext)
  res.cookies.set("session", username, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
*/