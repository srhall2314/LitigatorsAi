"use client"

import Link from "next/link"
import { useSession, signOut } from "next-auth/react"

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
                  className="text-black hover:underline"
                >
                  Files
                </Link>
                <Link
                  href="/citation-checker/cases"
                  className="text-black hover:underline"
                >
                  Cases
                </Link>
                {session.user.role === "admin" && (
                  <Link
                    href="/admin"
                    className="text-black hover:underline"
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href="/dashboard"
                  className="text-black hover:underline"
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => signOut()}
                  className="text-black hover:underline"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/auth/signin"
                className="text-black hover:underline"
              >
                Login
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}

