import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { UserEditForm } from "@/components/UserEditForm"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"

export default async function UserEditPage({
  params,
}: {
  params: { id: string }
}) {
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

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      accounts: true,
      sessions: true,
    },
  })

  if (!user) {
    redirect("/admin")
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
            <h1 className="text-3xl font-bold text-black">Edit User</h1>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <UserEditForm user={user} />
          </div>

          <div className="mt-6 bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-black">Account Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-black">
                  Connected Accounts
                </label>
                <div className="mt-2 space-y-2">
                  {user.accounts.length > 0 ? (
                    user.accounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded"
                      >
                        <div>
                          <span className="font-medium text-black">{account.provider}</span>
                          <span className="text-black ml-2">
                            ({account.type})
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-black">No connected accounts</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-black">
                  Active Sessions
                </label>
                <p className="mt-2 text-black">
                  {user.sessions.length} active session(s)
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

