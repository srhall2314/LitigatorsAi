import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { CitationsReportPage } from "../../components/CitationsReportPage"
import { StepProgress } from "../../components/StepProgress"

export default async function CitationsReportPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ fileId: string }>
  searchParams: Promise<{ checkId?: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect("/auth/signin")
  }

  const { fileId } = await params
  const { checkId } = await searchParams

  // Check if document is finalized - redirect if not
  if (checkId) {
    const check = await prisma.citationCheck.findUnique({
      where: { id: checkId },
    })

    if (check && check.status !== "finalized" && check.status !== "report_generated") {
      redirect(`/citation-checker/${fileId}/finalize-document${checkId ? `?checkId=${checkId}` : ''}`)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-normal text-black mb-4">
              Document Workflow
            </h1>
            <p className="text-black text-lg">
              View your citation validation report
            </p>
          </div>

          <StepProgress 
            currentStep="citations-report" 
            completedSteps={new Set(["upload", "validate-citations", "document-review", "finalize-document"])}
            fileId={fileId}
          />

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-black mb-2">
                Step 5: Citations Report
              </h2>
              <p className="text-black text-gray-600">
                View the final citation validation report with manual review decisions
              </p>
            </div>
            <CitationsReportPage fileId={fileId} checkId={checkId} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

