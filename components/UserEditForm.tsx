"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { buttonStyles, inputStyles, labelStyles, alertStyles, cn } from "@/lib/styles"

interface User {
  id: string
  name: string | null
  email: string
  role: string
  image: string | null
}

export function UserEditForm({ user }: { user: User }) {
  const router = useRouter()
  const [name, setName] = useState(user.name || "")
  const [role, setRole] = useState(user.role)
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, role, password }),
      })

      if (!res.ok) {
        throw new Error("Failed to update user")
      }

      setMessage({ type: "success", text: "User updated successfully" })
      setPassword("") // Clear password field
      router.refresh()
    } catch (error) {
      setMessage({ type: "error", text: "Failed to update user" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="email"
          className={labelStyles.base}
        >
          Email
        </label>
        <input
          type="email"
          id="email"
          value={user.email}
          disabled
          className={cn(inputStyles.base, "bg-gray-50 text-gray-500")}
        />
        <p className="mt-1 text-sm text-gray-500">Email cannot be changed</p>
      </div>

      <div>
        <label
          htmlFor="name"
          className={labelStyles.base}
        >
          Name
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputStyles.base}
        />
      </div>

      <div>
        <label
          htmlFor="role"
          className={labelStyles.base}
        >
          Role
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={inputStyles.base}
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="password"
          className={labelStyles.base}
        >
          New Password
        </label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputStyles.base}
          placeholder="Leave blank to keep current password"
          minLength={6}
        />
        <p className="mt-1 text-sm text-gray-500">Leave blank to keep current password. Minimum 6 characters if changing.</p>
      </div>

      {message && (
        <div className={message.type === "success" ? alertStyles.success : alertStyles.error}>
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className={buttonStyles.primary}
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  )
}

