import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { CreateDocumentPage } from "../components/CreateDocumentPage"
import { StepProgress } from "../components/StepProgress"

export default async function CreateDocumentPageRoute({
  searchParams,
}: {
  searchParams: Promise<{ fileId?: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect("/auth/signin")
  }

  const { fileId } = await searchParams

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-normal text-black mb-4">
              Document Workflow
            </h1>
            <p className="text-black text-lg">
              Create, edit, and validate your legal documents
            </p>
          </div>

          <StepProgress 
            currentStep="upload" 
            completedSteps={new Set()}
            fileId={fileId || null}
          />

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-black mb-2">
                Step 1: Upload File or Create Document
              </h2>
              <p className="text-black text-gray-600">
                {fileId ? "Edit your document with AI" : "Use AI to generate and edit your legal document"}
              </p>
            </div>
            <CreateDocumentPage />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

