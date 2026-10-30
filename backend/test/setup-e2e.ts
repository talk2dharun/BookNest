import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

config();

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error('DATABASE_URL_TEST is required for e2e tests');
}

process.env.DATABASE_URL = testUrl;

const adminUrl = testUrl.replace(/\/[^/]+$/, '/booknest');
const testDbName = new URL(testUrl).pathname.replace(/^\//, '');

async function ensureTestDatabase() {
  const adapter = new PrismaPg({ connectionString: adminUrl });
  const prisma = new PrismaClient({ adapter });
  try {
    const rows = await prisma.$queryRaw<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname = ${testDbName}
    `;
    if (rows.length === 0) {
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${testDbName}"`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await ensureTestDatabase();
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
});
