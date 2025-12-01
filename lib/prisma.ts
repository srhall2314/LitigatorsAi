import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Ensure prisma is properly initialized
if (!prisma) {
  throw new Error('Prisma Client failed to initialize')
}

// Handle connection errors gracefully
prisma.$connect().catch((error) => {
  console.error('[Prisma] Connection error:', error)
  // Don't throw - let individual queries handle reconnection
})

// Handle disconnection
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

