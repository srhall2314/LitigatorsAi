import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { prisma } from "@/lib/prisma"

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect("/auth/signin")
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (!user) {
    redirect("/auth/signin")
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-normal text-black mb-4">
              Welcome, {user.name || user.email}
            </h1>
            <p className="text-black text-lg">
              You are successfully logged in to LitigatorsAI
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-black mb-2">
                Your Account
              </h2>
              <p className="text-black">
                Email: {user.email}
              </p>
              <p className="text-black">
                Role: <span className="capitalize">{user.role}</span>
              </p>
            </div>

            {user.role === "admin" && (
              <div className="border border-gray-200 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-black mb-2">
                  Admin Access
                </h2>
                <p className="text-black mb-4">
                  You have administrative privileges
                </p>
                <a
                  href="/admin"
                  className="text-black underline hover:no-underline"
                >
                  Go to Admin Dashboard →
                </a>
              </div>
            )}

            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-black mb-2">
                Citation Checker Workflow
              </h2>
              <p className="text-black mb-4">
                Verify and validate citations in your documents
              </p>
              <a
                href="/citation-checker"
                className="text-black underline hover:no-underline inline-block"
              >
                Open Citation Checker →
              </a>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-black mb-2">
                Citation Analysis
              </h2>
              <p className="text-black mb-4">
                View statistics and insights on citation validation
              </p>
              <a
                href="/citation-checker/analysis"
                className="text-black underline hover:no-underline inline-block"
              >
                View Analysis →
              </a>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-black mb-2">
                AI Prompts Reference
              </h2>
              <p className="text-black mb-4">
                View the current prompts used by each validation agent
              </p>
              <a
                href="/dashboard/prompts"
                className="text-black underline hover:no-underline inline-block"
              >
                View Prompts →
              </a>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-black mb-2">
                Quick Actions
              </h2>
              <ul className="space-y-2 text-black">
                <li>
                  <a href="/" className="underline hover:no-underline">
                    Home
                  </a>
                </li>
                <li>
                  <a href="/citation-checker" className="underline hover:no-underline">
                    Citation Checker
                  </a>
                </li>
                {user.role === "admin" && (
                  <li>
                    <a href="/admin" className="underline hover:no-underline">
                      Admin Dashboard
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

