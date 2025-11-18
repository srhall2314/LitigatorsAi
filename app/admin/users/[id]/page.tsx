import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { UserEditForm } from "@/components/UserEditForm"

export default async function UserEditPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    redirect("/api/auth/signin")
  }

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (currentUser?.role !== "admin") {
    redirect("/")
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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link
            href="/admin"
            className="text-indigo-600 hover:text-indigo-900 mb-4 inline-block"
          >
            ← Back to admin
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Edit User</h1>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <UserEditForm user={user} />
        </div>

        <div className="mt-6 bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Account Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
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
                        <span className="font-medium">{account.provider}</span>
                        <span className="text-gray-500 ml-2">
                          ({account.type})
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">No connected accounts</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Active Sessions
              </label>
              <p className="mt-2 text-gray-500">
                {user.sessions.length} active session(s)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

