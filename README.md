# LitAI

A Next.js application with Neon database, Prisma ORM, NextAuth, and Vercel Blob Storage.

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Prisma** - Database ORM
- **Neon** - Serverless Postgres database
- **NextAuth** - Authentication
- **Vercel Blob Storage** - File storage

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

Fill in your environment variables:
- `DATABASE_URL` - Your Neon database connection string
- `DIRECT_URL` - Your Neon direct connection string (for migrations)
- `NEXTAUTH_SECRET` - Generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` - Your app URL (http://localhost:3000 for local dev)
- `BLOB_READ_WRITE_TOKEN` - Your Vercel Blob Storage token
- Auth provider credentials (optional)

3. Set up the database:
```bash
# Generate Prisma Client
npm run db:generate

# Push schema to database
npm run db:push

# Or run migrations
npm run db:migrate
```

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your app.

## Database

The Prisma schema includes tables for NextAuth:
- `User` - User accounts
- `Account` - OAuth provider accounts
- `Session` - User sessions
- `VerificationToken` - Email verification tokens

## Authentication

NextAuth is configured with Prisma adapter. You can add providers in `lib/auth.ts`.

## Blob Storage

Vercel Blob Storage is configured. Use the helper functions in `lib/blob.ts`:
- `uploadBlob()` - Upload files
- `listBlobs()` - List files
- `getBlob()` - Get file metadata
- `deleteBlob()` - Delete files

Example API endpoint: `/api/upload`

## Deployment

This project is configured for Vercel deployment. Make sure to:

1. **Add environment variables in Vercel dashboard:**
   - `DATABASE_URL` - Your Neon database connection string
   - `NEXTAUTH_SECRET` - Your NextAuth secret
   - `NEXTAUTH_URL` - Your production URL (e.g., https://your-app.vercel.app)
   - `BLOB_READ_WRITE_TOKEN` - Your Vercel Blob Storage token
   - `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` - Set to "1" to avoid Prisma checksum errors during build

2. **Run database migrations:**
   ```bash
   npm run db:push
   ```
   Or use Prisma migrations for production.

3. **Build process:**
   - The `postinstall` script automatically runs `prisma generate` after npm install
   - The `build` script runs `prisma generate && next build`
   - Vercel build command includes the checksum ignore flag

