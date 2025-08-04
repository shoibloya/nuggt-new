"use client";

import { useEffect, useMemo, useState } from "react";
import { ref as dbRef, onValue, set, child } from "firebase/database";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, CheckCircle, Clock, Pencil } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { outlines } from "@/lib/outline";          /* ← NEW */

const COMPANY_NAME = "Cloudsine"; 

/* outlines from outline.ts → convert to seed-compatible items          */
const seedPosts = outlines.map((o, idx) => ({
  id: idx + 9,   // unique numeric id
  title: o.articleTitle,
  excerpt: "Blog outline",
  imageUrl: "/outline.png",             // as requested
  date: o.date,
  readTime: "N/A",
  url: `/${o.slug}`,
  status: "pending",
}));

type BlogCore = (typeof seedPosts)[number];
type BlogPost = BlogCore & { key: string };

export function BlogSection() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  /* ---------- fetch live list & seed missing ---------- */
  useEffect(() => {
    const listRef = dbRef(db, `blogUploadsNew/${COMPANY_NAME}`);

    const unsub = onValue(listRef, (snap) => {
      const raw = snap.val() ?? {};
      const loaded: BlogPost[] = Object.entries(raw).map(([key, val]) => ({
        key,
        ...(val as BlogCore),
      }));
      setPosts(loaded);

      /* seed once */
      seedPosts.forEach((p) => {
        if (!loaded.some((l) => l.id === p.id)) {
          set(
            child(listRef, String(p.id)),
            { ...p, date: String(p.date) }   // guarantee it’s a plain string
          );
        }
      });
    });

    return () => unsub();
  }, []);

  /* ---------- splits ---------- */
  const { published, pending } = useMemo(() => {
    const orderPosts = (arr: BlogPost[]) => [
      ...arr.filter((p) => p.imageUrl !== "/outline.png"),
      ...arr
        .filter((p) => p.imageUrl === "/outline.png")
        .sort((a, b) => a.id - b.id),
    ];

    return {
      published: orderPosts(posts.filter((p) => p.status === "published")),
      pending: orderPosts(posts.filter((p) => p.status === "pending")),
    };
  }, [posts]);

  /* ---------- animations ---------- */
  const container = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  /* ---------- card ---------- */
  const BlogCard = ({ post }: { post: BlogPost }) => (
    <motion.div variants={item}>
      <Card className="relative h-full overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
        <div className="aspect-video overflow-hidden">
          <img
            src={post.imageUrl || "/placeholder.svg"}
            alt={post.title}
            className="h-full w-full object-contain transition-transform duration-300 hover:scale-105"
          />
        </div>

        <Link
          href={`/blog-upload/${post.key}`}
          className="absolute top-2 right-2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-primary"
        >
          <Pencil className="h-4 w-4" />
        </Link>

        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge
              variant={post.status === "published" ? "default" : "outline"}
              className="rounded-full"
            >
              {post.status === "published" ? (
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Published
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pending
                </span>
              )}
            </Badge>

            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{post.date}</span>
            </div>
            <span>•</span>
            <span>{post.readTime}</span>
          </div>

          <h3 className="mb-2 line-clamp-2 font-semibold">{post.title}</h3>
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {post.excerpt}
          </p>
        </CardContent>

        <CardFooter className="p-4 pt-0">
          <Button variant="link" className="px-0 text-primary" asChild>
            <a
              href={post.url}
              className="flex items-center gap-1"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read more <ArrowRight className="ml-1 h-3 w-3" />
            </a>
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );

  /* ---------- render ---------- */
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      className="w-full"
    >
      <Tabs defaultValue="pending">
        <Card className="border bg-card/50 shadow-md backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/15 via-primary/10 to-transparent p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Blogs</h2>
                <p className="mt-1 text-muted-foreground">List of Blogs</p>
              </div>
              <TabsList className="bg-background/80 backdrop-blur-sm">
                <TabsTrigger value="published">Published</TabsTrigger>
                <TabsTrigger value="pending">Pending Approval</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            <TabsContent value="published" className="mt-0">
              {published.length ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {published.map((p) => (
                    <BlogCard key={p.key} post={p} />
                  ))}
                </div>
              ) : (
                <Empty state="published" />
              )}
            </TabsContent>

            <TabsContent value="pending" className="mt-0">
              {pending.length ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {pending.map((p) => (
                    <BlogCard key={p.key} post={p} />
                  ))}
                </div>
              ) : (
                <Empty state="pending" />
              )}
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </motion.div>
  );
}

/* ---------- empty state ---------- */
function Empty({ state }: { state: "published" | "pending" }) {
  const Icon = state === "published" ? CheckCircle : Clock;
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/20 bg-muted/10 p-10 text-center">
      <Icon className="mb-2 h-10 w-10 text-muted-foreground/60" />
      <h3 className="mb-2 text-lg font-medium">
        {state === "published" ? "No published blogs" : "No pending blogs"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {state === "published"
          ? "Your published blogs will appear here."
          : "Blogs waiting for approval will appear here."}
      </p>
    </div>
  );
}