import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { HeavyAnalysisResultsPage } from "@/app/citation-checker/components/HeavyAnalysisResultsPage"

export default async function HeavyAnalysisResultsPageRoute({
  params,
}: {
  params: { fileId: string; runId: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect("/auth/signin")
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-normal text-black mb-4">
              Heavy Analysis Results
            </h1>
            <p className="text-black text-lg">
              Multi-run comparison and consistency analysis
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <HeavyAnalysisResultsPage fileId={params.fileId} runId={params.runId} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

