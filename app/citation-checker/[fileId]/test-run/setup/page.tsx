import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { TestRunSetupPage } from "../../../components/TestRunSetupPage"

export default async function TestRunSetupPageRoute({
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
              Test Run Setup
            </h1>
            <p className="text-black text-lg">
              Configure a multi-run test to assess validation consistency
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <TestRunSetupPage fileId={params.fileId} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

