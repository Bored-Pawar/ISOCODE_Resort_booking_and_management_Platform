import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "@/lib/db";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");

const { db, client } = createDb(url, { max: 1 });
await migrate(db, { migrationsFolder: "./src/db/migrations" });
await client.end();
console.log("Migrations applied.");
