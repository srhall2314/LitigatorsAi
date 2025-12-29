import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { prisma } from "@/lib/prisma"

export default async function TestRunLandingPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect("/auth/signin")
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (user?.role !== "admin") {
    redirect("/dashboard")
  }

  // Get all files with JSON generated
  const files = await prisma.fileUpload.findMany({
    where: {
      user: {
        email: session.user.email,
      },
      citationChecks: {
        some: {
          status: {
            not: "uploaded",
          },
        },
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      citationChecks: {
        where: {
          status: {
            not: "uploaded",
          },
        },
        orderBy: {
          version: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB"
    return (bytes / (1024 * 1024)).toFixed(2) + " MB"
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-normal text-black mb-4">
              Multi-Run Test
            </h1>
            <p className="text-black text-lg">
              Configure a multi-run test to assess validation consistency. Select a file to begin.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-8 bg-white">
            <h2 className="text-2xl font-semibold text-black mb-4">
              Select a File
            </h2>
            {files.length === 0 ? (
              <p className="text-gray-500">
                No files with JSON generated yet. Please upload a file and generate JSON first.
              </p>
            ) : (
              <div className="space-y-3">
                {files.map((file) => {
                  const hasJson = file.citationChecks.length > 0 && 
                    file.citationChecks[0].status !== "uploaded"
                  
                  return (
                    <div
                      key={file.id}
                      className="p-4 border border-gray-200 rounded-md hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-black">{file.originalName}</div>
                          <div className="text-sm text-gray-500">
                            {formatFileSize(file.fileSize)} • {new Date(file.createdAt).toLocaleDateString()}
                            {file.user && (
                              <span className="ml-2 text-gray-400">
                                by {file.user.name || file.user.email}
                              </span>
                            )}
                            {hasJson && (
                              <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                JSON Generated
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {hasJson ? (
                            <a
                              href={`/citation-checker/${file.id}/test-run/setup`}
                              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
                            >
                              Run Test
                            </a>
                          ) : (
                            <span className="px-4 py-2 bg-gray-300 text-gray-600 rounded-md text-sm cursor-not-allowed">
                              Generate JSON First
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

