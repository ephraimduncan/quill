import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

function getDbUrl(): string {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL environment variable is required");
  }
  return url;
}

function getAuthToken(): string | undefined {
  return process.env.TURSO_AUTH_TOKEN;
}

const client = createClient({
  url: getDbUrl(),
  authToken: getAuthToken(),
});

export const db = drizzle(client, { schema });

export * from "./schema";
