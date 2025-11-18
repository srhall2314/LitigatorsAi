import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { CreateUserForm } from "@/components/CreateUserForm"

export default async function CreateUserPage() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    redirect("/auth/signin")
  }

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (currentUser?.role !== "admin") {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link
              href="/admin"
              className="text-black underline hover:no-underline mb-4 inline-block"
            >
              ← Back to admin
            </Link>
            <h1 className="text-3xl font-bold text-black">Create New User</h1>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <CreateUserForm />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

