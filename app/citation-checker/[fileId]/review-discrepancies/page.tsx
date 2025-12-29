import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { ReviewDiscrepanciesPage } from "../../components/ReviewDiscrepanciesPage"
import { StepProgress } from "../../components/StepProgress"

export default async function ReviewDiscrepanciesPageRoute({
  params,
}: {
  params: { fileId: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect("/auth/signin")
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
              Review citation discrepancies
            </p>
          </div>

          <StepProgress 
            currentStep="review-discrepancies" 
            completedSteps={new Set(["upload", "validate-citations"])}
            fileId={params.fileId}
          />

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-black mb-2">
                Review Discrepancies
              </h2>
              <p className="text-black text-gray-600">
                Review and address any citation discrepancies (This step is now part of Document Review)
              </p>
            </div>
            <ReviewDiscrepanciesPage fileId={params.fileId} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

