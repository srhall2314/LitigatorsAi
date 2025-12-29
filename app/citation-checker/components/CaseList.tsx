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
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null)

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

  const handleDeleteClick = (caseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenActionMenuId(null)
    setConfirmDeleteId(caseId)
  }

  const handleDeleteConfirm = async (caseId: string) => {
    setDeletingCaseId(caseId)
    try {
      const res = await fetch(`/api/citation-checker/cases/${caseId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        await loadCases()
        setConfirmDeleteId(null)
      } else {
        const errorData = await res.json()
        alert(`Failed to delete case: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error deleting case:", error)
      alert("Failed to delete case. Please try again.")
    } finally {
      setDeletingCaseId(null)
    }
  }

  const handleDeleteCancel = () => {
    setConfirmDeleteId(null)
  }

  const handleCaseClick = (caseId: string) => {
    router.push(`/citation-checker/cases/${caseId}`)
  }

  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) return null
    
    const statusConfig: Record<string, { label: string; color: string }> = {
      active: { label: "Active", color: "bg-green-100 text-green-800 border border-green-200" },
      closed: { label: "Closed", color: "bg-gray-100 text-gray-800 border border-gray-200" },
      archived: { label: "Archived", color: "bg-yellow-100 text-yellow-800 border border-yellow-200" },
    }
    
    const config = statusConfig[status] || { label: status, color: "bg-gray-100 text-gray-800 border border-gray-200" }
    return (
      <span className={`px-2.5 py-1 text-xs font-semibold rounded-md ${config.color}`}>
        {config.label}
      </span>
    )
  }

  // Close action menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenActionMenuId(null)
    }
    if (openActionMenuId) {
      document.addEventListener("click", handleClickOutside)
      return () => document.removeEventListener("click", handleClickOutside)
    }
  }, [openActionMenuId])

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
        <div className="space-y-2">
          {cases.map((case_) => {
            const isActionMenuOpen = openActionMenuId === case_.id
            const isConfirmingDelete = confirmDeleteId === case_.id
            
            return (
              <div
                key={case_.id}
                onClick={() => handleCaseClick(case_.id)}
                className="p-4 border border-gray-200 rounded-md transition-all cursor-pointer bg-white hover:border-gray-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Case Name Row */}
                    <div className="flex items-center gap-3 mb-2">
                      <div 
                        className="font-medium text-black truncate flex-1 min-w-0 cursor-pointer hover:text-indigo-600 hover:underline"
                        title={case_.name}
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/citation-checker/cases/${case_.id}`)
                        }}
                      >
                        {case_.name}
                      </div>
                      {getStatusBadge(case_.status)}
                    </div>
                    
                    {/* Description */}
                    {case_.description && (
                      <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                        {case_.description}
                      </div>
                    )}
                    
                    {/* Metadata Row */}
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      <span className="text-xs text-gray-500">
                        {case_._count?.documents || 0} document{case_._count?.documents !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-500">
                        {case_._count?.members || 0} member{case_._count?.members !== 1 ? 's' : ''}
                      </span>
                      {case_.owner && (
                        <>
                          <span className="text-xs text-gray-500">•</span>
                          <span className="text-xs text-gray-500">
                            Owner: {case_.owner.name || case_.owner.email}
                          </span>
                        </>
                      )}
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-500">
                        {new Date(case_.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  {/* Action Menu */}
                  <div className="relative flex-shrink-0">
                    {isConfirmingDelete ? (
                      <div 
                        className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md p-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-xs text-red-700 font-medium">Delete?</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteConfirm(case_.id)
                          }}
                          disabled={deletingCaseId === case_.id}
                          className="px-2 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                          {deletingCaseId === case_.id ? "Deleting..." : "Yes"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteCancel()
                          }}
                          disabled={deletingCaseId === case_.id}
                          className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs font-medium hover:bg-gray-300 disabled:opacity-50"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenActionMenuId(isActionMenuOpen ? null : case_.id)
                          }}
                          className={`p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                            isActionMenuOpen
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800 border border-gray-200"
                          }`}
                          title="Actions"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </button>
                        
                        {isActionMenuOpen && (
                          <div 
                            className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="py-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenActionMenuId(null)
                                  handleDeleteClick(case_.id, e)
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
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

