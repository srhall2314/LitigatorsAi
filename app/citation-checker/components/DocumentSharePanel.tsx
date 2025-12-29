"use client"

import { useState, useEffect } from "react"
import { DocumentShare, AccessLevel } from "../types"

interface DocumentSharePanelProps {
  fileId: string
  accessLevel: AccessLevel
  onShareChange?: () => void
}

export function DocumentSharePanel({
  fileId,
  accessLevel,
  onShareChange,
}: DocumentSharePanelProps) {
  const [shares, setShares] = useState<DocumentShare[]>([])
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [email, setEmail] = useState("")
  const [permission, setPermission] = useState<"view" | "edit" | "route">("view")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadShares()
  }, [fileId])

  const loadShares = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/citation-checker/files/${fileId}/share`)
      if (!response.ok) throw new Error("Failed to load shares")
      const data = await response.json()
      setShares(data)
    } catch (err) {
      console.error("Error loading shares:", err)
      setError(err instanceof Error ? err.message : "Failed to load shares")
    } finally {
      setLoading(false)
    }
  }

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    try {
      setSharing(true)
      setError(null)
      const response = await fetch(`/api/citation-checker/files/${fileId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWithEmail: email, permission }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to share document")
      }

      setEmail("")
      setPermission("view")
      await loadShares()
      onShareChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share document")
    } finally {
      setSharing(false)
    }
  }

  const handleRevoke = async (shareId: string) => {
    if (!confirm("Are you sure you want to revoke this share?")) return

    try {
      const response = await fetch(
        `/api/citation-checker/files/${fileId}/share?shareId=${shareId}`,
        { method: "DELETE" }
      )

      if (!response.ok) throw new Error("Failed to revoke share")

      await loadShares()
      onShareChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke share")
    }
  }

  // Only show if user has route permission or is owner
  if (accessLevel !== "owner" && accessLevel !== "route") {
    return null
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Share Document</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleShare} className="mb-6">
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as "view" | "edit" | "route")}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="view">View</option>
            <option value="edit">Edit</option>
            <option value="route">Route</option>
          </select>
          <button
            type="submit"
            disabled={sharing}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sharing ? "Sharing..." : "Share"}
          </button>
        </div>
      </form>

      <div>
        <h4 className="font-medium mb-2">Shared With</h4>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : shares.length === 0 ? (
          <p className="text-gray-500 text-sm">No shares yet</p>
        ) : (
          <ul className="space-y-2">
            {shares.map((share) => (
              <li
                key={share.id}
                className="flex items-center justify-between p-2 bg-gray-50 rounded"
              >
                <div>
                  <div className="font-medium">
                    {share.sharedWith?.name || share.sharedWith?.email}
                  </div>
                  <div className="text-sm text-gray-600">
                    {share.permission} access
                    {share.routedFromId && " • Routed"}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(share.id)}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

