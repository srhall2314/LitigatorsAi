import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const citationCheck = await prisma.citationCheck.findUnique({
      where: { id: params.id },
      include: {
        fileUpload: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    if (!citationCheck) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(citationCheck)
  } catch (error) {
    console.error("Error fetching citation check:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const citationCheck = await prisma.citationCheck.findUnique({
      where: { id: params.id },
    })

    if (!citationCheck) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const body = await request.json()
    const { status, jsonData } = body

    // jsonData is the complete JSON blob structure (format TBD by parser)
    // All citation data, validation results, etc. will be stored within jsonData
    const updated = await prisma.citationCheck.update({
      where: { id: params.id },
      data: {
        ...(status && { status }),
        ...(jsonData !== undefined && { jsonData: jsonData as any }), // Type will be defined when parser is built
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating citation check:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

