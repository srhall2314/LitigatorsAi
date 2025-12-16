import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { CreateDocumentPage } from "../components/CreateDocumentPage"

export default async function CreateDocumentPageRoute() {
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
              Create Document with AI
            </h1>
            <p className="text-black text-lg">
              Use AI to generate and edit your legal document
            </p>
          </div>
          <CreateDocumentPage />
        </div>
      </main>
      <Footer />
    </div>
  )
}

