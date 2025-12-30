import { NextRequest, NextResponse } from "next/server"
import { requireAuth, handleApiError } from "@/lib/api-helpers"
import { getSharedWithMeFiles } from "@/lib/file-access-helpers"

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const { user } = authResult

    // Get permission filter from query params
    const { searchParams } = new URL(request.url)
    const permissionFilter = searchParams.get('permission')

    // Get files shared with current user
    const files = await getSharedWithMeFiles(user.id, permissionFilter)

    return NextResponse.json(files)
  } catch (error) {
    return handleApiError(error, 'GetSharedFiles')
  }
}

