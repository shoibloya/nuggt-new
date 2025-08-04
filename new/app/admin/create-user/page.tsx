"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY!; // demo-grade

export default function CreateUserPage() {
  const [key, setKey] = useState("");
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (key !== ADMIN_KEY) {
      setMsg("Unauthorized: invalid admin key.");
      return;
    }

    if (!username || !password) {
      setMsg("Username and password are required.");
      return;
    }

    setLoading(true);
    try {
      // Store credentials
      await set(ref(db, `auth/users/${username}`), { password });

      // Initialize analytics data for this user (URL only for now)
      await set(ref(db, `analyticsDashaboard/${username}`), {
        websiteUrl: websiteUrl || "",
      });

      setMsg("User created with analytics setup.");
      setU("");
      setP("");
      setWebsiteUrl("");
    } catch {
      setMsg("Failed to create user.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create User</CardTitle>
          <CardDescription>Only you should have the admin key.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminKey">Admin key</Label>
              <Input id="adminKey" value={key} onChange={(e) => setKey(e.target.value)} placeholder="enter admin key" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(e) => setU(e.target.value)} placeholder="jane" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" value={password} onChange={(e) => setP(e.target.value)} placeholder="set a password" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="websiteUrl">Website URL</Label>
              <Input
                id="websiteUrl"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            {msg && <p className="text-sm">{msg}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create user"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            Writes to /auth/users/&lt;username&gt; and /analyticsDashaboard/&lt;username&gt;.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
