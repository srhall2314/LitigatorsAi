"use client"

import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { buttonStyles } from "@/lib/styles"

export function Header() {
  const { data: session } = useSession()

  return (
    <header className="w-full border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div>
            <Link href="/" className="text-black text-xl font-normal">
              LitigatorsAI
            </Link>
          </div>
          <nav className="flex items-center space-x-4">
            {session?.user ? (
              <>
                <Link
                  href="/citation-checker"
                  className={buttonStyles.link}
                >
                  Files
                </Link>
                <Link
                  href="/citation-checker/cases"
                  className={buttonStyles.link}
                >
                  Cases
                </Link>
                {session.user.role === "admin" && (
                  <Link
                    href="/admin"
                    className={buttonStyles.link}
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href="/dashboard"
                  className={buttonStyles.link}
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => signOut()}
                  className={buttonStyles.link}
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/auth/signin"
                className={buttonStyles.link}
              >
                Login
              </Link>
            )}
          </nav>
        </div>
      </div>
      <div className="bg-white text-red-600 text-xs text-center py-1 px-4">
        BETA System: Data may not be secure; data loss may occur.
      </div>
    </header>
  )
}

