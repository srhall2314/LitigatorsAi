"use client"

import { AccessLevel } from "../types"

interface AccessIndicatorProps {
  accessLevel: AccessLevel
  className?: string
}

export function AccessIndicator({ accessLevel, className = "" }: AccessIndicatorProps) {
  if (!accessLevel) return null

  const badges = {
    owner: { label: "Owner", color: "bg-blue-100 text-blue-800" },
    route: { label: "Routed", color: "bg-purple-100 text-purple-800" },
    edit: { label: "Edit Access", color: "bg-green-100 text-green-800" },
    view: { label: "View Only", color: "bg-gray-100 text-gray-800" },
  }

  const badge = badges[accessLevel]
  if (!badge) return null

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color} ${className}`}
    >
      {badge.label}
    </span>
  )
}

