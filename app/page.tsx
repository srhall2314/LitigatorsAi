export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8">Welcome to LitAI</h1>
        <p className="text-lg mb-4">
          Next.js + Neon + Prisma + Vercel Blob Storage
        </p>
        <div className="mt-8 space-y-2">
          <p>✅ Next.js configured</p>
          <p>✅ Prisma configured</p>
          <p>✅ Neon database ready</p>
          <p>✅ Auth tables ready</p>
          <p>✅ Vercel Blob Storage ready</p>
        </div>
      </div>
    </main>
  );
}

