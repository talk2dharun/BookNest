// Prisma 7 reads the database URL from this file, not from schema.prisma.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://booknest:booknest@localhost:5432/booknest",
  },
});
