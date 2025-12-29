"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Case, FileUpload, CaseMember } from "../types"
import { CaseAssignmentModal } from "./CaseAssignmentModal"
import { CaseMemberManagement } from "./CaseMemberManagement"

export function CaseDetail({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [case_, setCase] = useState<Case | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAssignmentModal, setShowAssignmentModal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editStatus, setEditStatus] = useState("")

  useEffect(() => {
    loadCase()
  }, [caseId])

  const loadCase = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/citation-checker/cases/${caseId}`)
      
      if (res.ok) {
        const data = await res.json()
        setCase(data)
        setEditName(data.name)
        setEditDescription(data.description || "")
        setEditStatus(data.status || "active")
      } else {
        console.error("Failed to load case:", res.status)
      }
    } catch (error) {
      console.error("Error loading case:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!case_) return

    try {
      const res = await fetch(`/api/citation-checker/cases/${caseId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          status: editStatus,
        }),
      })

      if (res.ok) {
        await loadCase()
        setEditing(false)
      } else {
        const errorData = await res.json()
        alert(`Failed to update case: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error updating case:", error)
      alert("Failed to update case. Please try again.")
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading case...</p>
  }

  if (!case_) {
    return <p className="text-gray-500">Case not found.</p>
  }

  return (
    <div className="space-y-6">
      {/* Case Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Case Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false)
                      setEditName(case_.name)
                      setEditDescription(case_.description || "")
                      setEditStatus(case_.status || "active")
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-semibold text-black mb-2">
                  {case_.name}
                </h1>
                {case_.description && (
                  <p className="text-gray-600 mb-2">{case_.description}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>Status: <span className="font-medium">{case_.status || "active"}</span></span>
                  <span>•</span>
                  <span>{case_._count?.documents || 0} documents</span>
                  <span>•</span>
                  <span>{case_._count?.members || 0} members</span>
                </div>
              </>
            )}
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Documents Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-black">Documents</h2>
          <button
            onClick={() => setShowAssignmentModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
          >
            Assign Document
          </button>
        </div>
        
        {case_.documents && case_.documents.length > 0 ? (
          <div className="space-y-3">
            {case_.documents.map((doc: FileUpload) => (
              <div
                key={doc.id}
                onClick={() => router.push(`/citation-checker/${doc.id}/run-citation-checker`)}
                className="p-4 border border-gray-200 rounded-md hover:border-gray-300 cursor-pointer bg-white"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-black">{doc.originalName}</h3>
                    {doc.legalDocumentType && (
                      <p className="text-sm text-gray-600">Type: {doc.legalDocumentType}</p>
                    )}
                    {doc.filedByOrganization && (
                      <p className="text-sm text-gray-600">Filed by: {doc.filedByOrganization}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No documents assigned to this case.</p>
        )}
      </div>

      {/* Members Section */}
      <div>
        <h2 className="text-xl font-semibold text-black mb-4">Members</h2>
        <CaseMemberManagement caseId={caseId} onUpdate={loadCase} />
      </div>

      {/* Assignment Modal */}
      {showAssignmentModal && (
        <CaseAssignmentModal
          caseId={caseId}
          onAssign={async () => {
            await loadCase()
            setShowAssignmentModal(false)
          }}
          onCancel={() => setShowAssignmentModal(false)}
        />
      )}
    </div>
  )
}

