import { NextRequest, NextResponse } from "next/server"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { getRoutedToMeFiles } from "@/lib/file-access-helpers"

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Get files routed to current user (where assignedToId matches or share has routedFromId)
    const files = await getRoutedToMeFiles(user.id)

    return NextResponse.json(files)
  } catch (error) {
    return handleApiError(error, 'GetRoutedToMeFiles')
  }
}

