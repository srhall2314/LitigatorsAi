import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { DocumentReviewPage } from "../../components/DocumentReviewPage"
import { StepProgress } from "../../components/StepProgress"

export default async function DocumentReviewPageRoute({
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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-normal text-black mb-4">
              Citation Checker Workflow
            </h1>
            <p className="text-black text-lg">
              Step-by-step citation validation process
            </p>
          </div>

          <StepProgress 
            currentStep="document-review" 
            completedSteps={new Set(["upload", "generate-json", "identify-citations", "validate-citations", "review-discrepancies", "citations-report", "full-analysis"])}
            fileId={fileId}
          />

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-black mb-2">
                Step 8: Document Review
              </h2>
              <p className="text-black text-gray-600">
                Review your document by paragraph with analysis indicators
              </p>
            </div>
            <DocumentReviewPage fileId={fileId} checkId={checkId} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

