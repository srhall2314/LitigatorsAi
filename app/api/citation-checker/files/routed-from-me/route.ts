import { NextRequest, NextResponse } from "next/server"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { getRoutedFromMeFiles } from "@/lib/file-access-helpers"

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Get files routed from current user (where routedFromId matches user.id)
    const files = await getRoutedFromMeFiles(user.id)

    return NextResponse.json(files)
  } catch (error) {
    return handleApiError(error, 'GetRoutedFromMeFiles')
  }
}

