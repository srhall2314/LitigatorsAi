"use client"

import { useState, useEffect } from "react"
import { AccessLevel } from "../types"

interface DocumentRouterProps {
  fileId: string
  checkId: string | null
  accessLevel: AccessLevel
  onRoute?: () => void
}

interface RoutingHistory {
  id: string
  sharedWith: { id: string; name: string | null; email: string }
  routedFrom: { id: string; name: string | null; email: string } | null
  routedAt: string
}

export function DocumentRouter({
  fileId,
  checkId,
  accessLevel,
  onRoute,
}: DocumentRouterProps) {
  const [routing, setRouting] = useState(false)
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [history, setHistory] = useState<RoutingHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadRoutingHistory()
  }, [fileId])

  const loadRoutingHistory = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/citation-checker/files/${fileId}/route`)
      if (!response.ok) throw new Error("Failed to load routing history")
      const data = await response.json()
      setHistory(data)
    } catch (err) {
      console.error("Error loading routing history:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleRoute = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    try {
      setRouting(true)
      setError(null)
      const response = await fetch(`/api/citation-checker/files/${fileId}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeToEmail: email, message: message || undefined }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to route document")
      }

      setEmail("")
      setMessage("")
      await loadRoutingHistory()
      onRoute?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to route document")
    } finally {
      setRouting(false)
    }
  }

  // Only show if user has route permission or is owner
  if (accessLevel !== "owner" && accessLevel !== "route") {
    return null
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Route Document</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleRoute} className="mb-6">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Route To
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a note about this routing..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={routing}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {routing ? "Routing..." : "Route Document"}
          </button>
        </div>
      </form>

      {history.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Routing History</h4>
          <ul className="space-y-2">
            {history.map((item) => (
              <li key={item.id} className="p-2 bg-gray-50 rounded text-sm">
                <div className="font-medium">
                  Routed to {item.sharedWith.name || item.sharedWith.email}
                </div>
                {item.routedFrom && (
                  <div className="text-gray-600">
                    From {item.routedFrom.name || item.routedFrom.email}
                  </div>
                )}
                <div className="text-gray-500 text-xs mt-1">
                  {new Date(item.routedAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

