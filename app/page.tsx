import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="text-center">
        <h1 className="text-black text-4xl font-normal mb-8" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          LitigatorsAI Coming Soon
        </h1>
        <Link 
          href="/auth/signin" 
          className="text-black underline"
        >
          Login
        </Link>
      </div>
    </main>
  );
}

