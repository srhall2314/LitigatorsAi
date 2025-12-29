import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { TestRunResultsPage } from "../../../../components/TestRunResultsPage"
import { prisma } from "@/lib/prisma"

export default async function TestRunResultsPageRoute({
  params,
}: {
  params: { fileId: string; testRunId: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect("/auth/signin")
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (user?.role !== "admin") {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-normal text-black mb-2">
              Multi-Run Test Results
            </h1>
            <p className="text-black text-lg">
              Compare validation results across multiple runs to assess consistency and reliability
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <TestRunResultsPage fileId={params.fileId} testRunId={params.testRunId} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

