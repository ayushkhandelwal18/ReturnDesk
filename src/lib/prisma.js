import { PrismaClient } from '../generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis;
export const prisma = globalForPrisma.returnDeskPrisma ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL }),
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.returnDeskPrisma = prisma;
