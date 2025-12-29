import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { HeavyAnalysisPage } from "../../components/HeavyAnalysisPage"
import { prisma } from "@/lib/prisma"

export default async function HeavyAnalysisPageRoute({
  params,
}: {
  params: { fileId: string }
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
            <h1 className="text-4xl font-normal text-black mb-4">
              Heavy Model Analysis
            </h1>
            <p className="text-black text-lg">
              Run comprehensive citation analysis using Claude Sonnet
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <HeavyAnalysisPage fileId={params.fileId} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

