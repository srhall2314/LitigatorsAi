"use client"

import { useState, useEffect } from "react"
import { Case } from "../types"

interface FileCaseAssignmentModalProps {
  fileId: string
  currentCaseId?: string | null
  onAssign: (caseId: string | null, legalDocumentType?: string, filedByOrganization?: string) => void
  onCancel: () => void
}

export function FileCaseAssignmentModal({ 
  fileId, 
  currentCaseId,
  onAssign, 
  onCancel 
}: FileCaseAssignmentModalProps) {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCaseId, setSelectedCaseId] = useState<string>(currentCaseId || "")
  const [legalDocumentType, setLegalDocumentType] = useState("")
  const [filedByOrganization, setFiledByOrganization] = useState("")
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    loadCases()
  }, [])

  const loadCases = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/citation-checker/cases")
      
      if (res.ok) {
        const data = await res.json()
        setCases(data)
      }
    } catch (error) {
      console.error("Error loading cases:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async () => {
    setAssigning(true)
    try {
      const caseIdToAssign = selectedCaseId === "" ? null : selectedCaseId
      
      const res = await fetch(`/api/citation-checker/files/${fileId}/assign-case`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caseId: caseIdToAssign,
          legalDocumentType: legalDocumentType.trim() || null,
          filedByOrganization: filedByOrganization.trim() || null,
        }),
      })

      if (res.ok) {
        onAssign(caseIdToAssign, legalDocumentType.trim() || undefined, filedByOrganization.trim() || undefined)
      } else {
        const errorData = await res.json()
        alert(`Failed to assign case: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error assigning case:", error)
      alert("Failed to assign case. Please try again.")
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Assign Document to Case</h3>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Case
            </label>
            {loading ? (
              <p className="text-gray-500">Loading cases...</p>
            ) : (
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Unassigned --</option>
                {cases.map((case_) => (
                  <option key={case_.id} value={case_.id}>
                    {case_.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Legal Document Type (optional)
            </label>
            <input
              type="text"
              value={legalDocumentType}
              onChange={(e) => setLegalDocumentType(e.target.value)}
              placeholder="e.g., motion, brief, memo, pleading"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filed By Organization (optional)
            </label>
            <input
              type="text"
              value={filedByOrganization}
              onChange={(e) => setFiledByOrganization(e.target.value)}
              placeholder="Organization name"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={onCancel}
              disabled={assigning}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={assigning}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {assigning ? "Assigning..." : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

