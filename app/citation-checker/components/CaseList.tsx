"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Case } from "../types"

export function CaseList() {
  const router = useRouter()
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "owned" | "member">("all")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newCaseName, setNewCaseName] = useState("")
  const [newCaseDescription, setNewCaseDescription] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadCases()
  }, [filter, statusFilter])

  const loadCases = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filter !== "all") {
        params.append("filter", filter)
      }
      if (statusFilter) {
        params.append("status", statusFilter)
      }
      
      const url = `/api/citation-checker/cases${params.toString() ? `?${params.toString()}` : ''}`
      const res = await fetch(url)
      
      if (res.ok) {
        const data = await res.json()
        setCases(data)
      } else {
        console.error("Failed to load cases:", res.status)
      }
    } catch (error) {
      console.error("Error loading cases:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newCaseName.trim()) {
      alert("Case name is required")
      return
    }

    setCreating(true)
    try {
      const res = await fetch("/api/citation-checker/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newCaseName.trim(),
          description: newCaseDescription.trim() || null,
          status: "active",
        }),
      })

      if (res.ok) {
        setNewCaseName("")
        setNewCaseDescription("")
        setShowCreateModal(false)
        await loadCases()
      } else {
        const errorData = await res.json()
        alert(`Failed to create case: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error creating case:", error)
      alert("Failed to create case. Please try again.")
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (caseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Are you sure you want to delete this case? Documents will be unassigned from the case.")) {
      return
    }

    try {
      const res = await fetch(`/api/citation-checker/cases/${caseId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        await loadCases()
      } else {
        const errorData = await res.json()
        alert(`Failed to delete case: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error deleting case:", error)
      alert("Failed to delete case. Please try again.")
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading cases...</p>
  }

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Filters */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Cases</option>
          <option value="owned">My Cases</option>
          <option value="member">Member Cases</option>
        </select>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="archived">Archived</option>
        </select>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-sm font-medium"
        >
          Create Case
        </button>
      </div>

      {/* Case List */}
      {cases.length === 0 ? (
        <p className="text-gray-500">No cases found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cases.map((case_) => (
            <div
              key={case_.id}
              onClick={() => router.push(`/citation-checker/cases/${case_.id}`)}
              className="p-6 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all cursor-pointer bg-white"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-black flex-1">
                  {case_.name}
                </h3>
                {case_.status && (
                  <span className={`px-2 py-1 text-xs font-semibold rounded-md ${
                    case_.status === "active" ? "bg-green-100 text-green-800" :
                    case_.status === "closed" ? "bg-gray-100 text-gray-800" :
                    "bg-yellow-100 text-yellow-800"
                  }`}>
                    {case_.status}
                  </span>
                )}
              </div>
              
              {case_.description && (
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {case_.description}
                </p>
              )}
              
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">📄</span>
                  <span>{case_._count?.documents || 0} document{case_._count?.documents !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">👥</span>
                  <span>{case_._count?.members || 0} member{case_._count?.members !== 1 ? 's' : ''}</span>
                </div>
                {case_.owner && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">👤</span>
                    <span>Owner: {case_.owner.name || case_.owner.email}</span>
                  </div>
                )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                <button
                  onClick={(e) => handleDelete(case_.id, e)}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-xs font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Case Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Create New Case</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewCaseName("")
                  setNewCaseDescription("")
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Case Name *
                </label>
                <input
                  type="text"
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                  placeholder="Enter case name"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={newCaseDescription}
                  onChange={(e) => setNewCaseDescription(e.target.value)}
                  rows={3}
                  placeholder="Enter case description"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    setNewCaseName("")
                    setNewCaseDescription("")
                  }}
                  disabled={creating}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newCaseName.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

