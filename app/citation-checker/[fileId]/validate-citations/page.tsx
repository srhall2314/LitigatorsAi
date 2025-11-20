import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { ValidateCitationsPage } from "../../components/ValidateCitationsPage"
import { StepProgress } from "../../components/StepProgress"

export default async function ValidateCitationsPageRoute({
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
              Citation Checker Workflow
            </h1>
            <p className="text-black text-lg">
              Step-by-step citation validation process
            </p>
          </div>

          <StepProgress 
            currentStep="validate-citations" 
            completedSteps={new Set(["upload", "generate-json", "identify-citations"])}
            fileId={params.fileId}
          />

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-black mb-2">
                Step 4: Validate Citations
              </h2>
              <p className="text-black text-gray-600">
                Verify citation accuracy and completeness
              </p>
            </div>
            <ValidateCitationsPage fileId={params.fileId} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

