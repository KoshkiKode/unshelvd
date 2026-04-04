import { defineConfig } from "drizzle-kit";

// During CI compilation, DATABASE_URL might not be present.
// We provide a dummy URL merely so `drizzle-kit generate` doesn't throw,
// as `generate` only uses the schema typescript file to scaffold SQL.
const dbUrl = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost/dummy";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
