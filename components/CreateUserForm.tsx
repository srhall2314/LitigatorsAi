"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { buttonStyles, inputStyles, labelStyles, alertStyles, cn } from "@/lib/styles"

export function CreateUserForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("user")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, name, password, role }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to create user")
      }

      setMessage({ type: "success", text: "User created successfully!" })
      
      // Reset form
      setEmail("")
      setName("")
      setPassword("")
      setRole("user")
      
      // Redirect to admin page after 2 seconds
      setTimeout(() => {
        router.push("/admin")
      }, 2000)
    } catch (error) {
      setMessage({ 
        type: "error", 
        text: error instanceof Error ? error.message : "Failed to create user" 
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="email"
          className={labelStyles.required}
        >
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          id="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputStyles.base}
          placeholder="user@example.com"
        />
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
          placeholder="User Name"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className={labelStyles.required}
        >
          Password <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          id="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputStyles.base}
          placeholder="Enter password"
          minLength={6}
        />
        <p className="mt-1 text-sm text-gray-500">Minimum 6 characters</p>
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

      {message && (
        <div className={message.type === "success" ? alertStyles.success : alertStyles.error}>
          {message.text}
        </div>
      )}

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className={buttonStyles.secondary}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className={buttonStyles.primary}
        >
          {loading ? "Creating..." : "Create User"}
        </button>
      </div>
    </form>
  )
}

