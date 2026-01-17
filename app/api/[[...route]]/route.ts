import { Hono } from "hono";
import { handle } from "hono/vercel";
import { eq, count, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, products, threads } from "@/lib/db";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const app = new Hono<{ Variables: Variables }>().basePath("/api");

app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }
  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/products", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userProducts = await db
    .select({
      id: products.id,
      name: products.name,
      url: products.url,
      createdAt: products.createdAt,
      newThreadCount: count(threads.id),
    })
    .from(products)
    .leftJoin(
      threads,
      and(
        eq(products.id, threads.productId),
        eq(threads.isNew, true),
        eq(threads.status, "active")
      )
    )
    .where(eq(products.userId, user.id))
    .groupBy(products.id);

  return c.json(userProducts);
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
