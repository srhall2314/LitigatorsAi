"use client"

import { useState, useEffect } from "react"
import { CaseMember } from "../types"

interface CaseMemberManagementProps {
  caseId: string
  onUpdate: () => void
}

export function CaseMemberManagement({ caseId, onUpdate }: CaseMemberManagementProps) {
  const [members, setMembers] = useState<CaseMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  const [memberRole, setMemberRole] = useState("member")
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    loadMembers()
  }, [caseId])

  const loadMembers = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/citation-checker/cases/${caseId}/members`)
      
      if (res.ok) {
        const data = await res.json()
        setMembers(data)
      }
    } catch (error) {
      console.error("Error loading members:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddMember = async () => {
    if (!userEmail.trim()) {
      alert("Please enter a user email")
      return
    }

    setAdding(true)
    try {
      // First, find user by email
      const userRes = await fetch(`/api/citation-checker/users/lookup?email=${encodeURIComponent(userEmail.trim())}`)
      let userId: string | null = null

      if (userRes.ok) {
        const user = await userRes.json()
        userId = user.id
      } else {
        const errorData = await userRes.json().catch(() => ({}))
        alert(`User not found: ${errorData.error || 'Please check the email address.'}`)
        return
      }

      if (!userId) {
        alert("User not found. Please check the email address.")
        return
      }

      const res = await fetch(`/api/citation-checker/cases/${caseId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          role: memberRole,
        }),
      })

      if (res.ok) {
        setUserEmail("")
        setMemberRole("member")
        setShowAddModal(false)
        await loadMembers()
        onUpdate()
      } else {
        const errorData = await res.json()
        alert(`Failed to add member: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error adding member:", error)
      alert("Failed to add member. Please try again.")
    } finally {
      setAdding(false)
    }
  }

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/citation-checker/cases/${caseId}/members/${memberId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: newRole,
        }),
      })

      if (res.ok) {
        await loadMembers()
        onUpdate()
      } else {
        const errorData = await res.json()
        alert(`Failed to update member role: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error updating member role:", error)
      alert("Failed to update member role. Please try again.")
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) {
      return
    }

    try {
      const res = await fetch(`/api/citation-checker/cases/${caseId}/members/${memberId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        await loadMembers()
        onUpdate()
      } else {
        const errorData = await res.json()
        alert(`Failed to remove member: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error("Error removing member:", error)
      alert("Failed to remove member. Please try again.")
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading members...</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
        >
          Add Member
        </button>
      </div>

      {members.length === 0 ? (
        <p className="text-gray-500">No members assigned to this case.</p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="p-4 border border-gray-200 rounded-md bg-white flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="font-medium text-black">
                  {member.user?.name || member.user?.email || "Unknown User"}
                </div>
                <div className="text-sm text-gray-600">
                  Role: {member.role}
                </div>
                {member.addedBy && (
                  <div className="text-xs text-gray-500">
                    Added by {member.addedBy.name || member.addedBy.email}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="owner">Owner</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                  <option value="member">Member</option>
                </select>
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-xs"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add Member</h3>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setUserEmail("")
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User Email
                </label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="owner">Owner</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                  <option value="member">Member</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setUserEmail("")
                  }}
                  disabled={adding}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMember}
                  disabled={adding || !userEmail.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {adding ? "Adding..." : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

