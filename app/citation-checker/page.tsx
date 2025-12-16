import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { UploadPage } from "./components/UploadPage"

export default async function CitationCheckerPage() {
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

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-black mb-2">
                Step 1: Upload File or Create Document
              </h2>
              <p className="text-black text-gray-600">
                Upload an existing document or create a new one with AI
              </p>
            </div>
            
            {/* Option Selector */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <a
                href="/citation-checker/create-document"
                className="p-6 border-2 border-indigo-300 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-black">Create with AI</h3>
                </div>
                <p className="text-sm text-gray-600">
                  Use AI to generate a new legal document with proper citation formatting
                </p>
              </a>
              
              <div className="p-6 border-2 border-gray-200 rounded-lg bg-gray-50">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-black">Upload File</h3>
                </div>
                <p className="text-sm text-gray-600">
                  Upload an existing Word document (.doc or .docx) to check citations
                </p>
              </div>
            </div>

            <UploadPage />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
