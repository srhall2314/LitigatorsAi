import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET: Fetch all prompts for the current user
export async function GET(request: NextRequest) {
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

    const prompts = await prisma.savedPrompt.findMany({
      where: { userId: user.id },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'asc' }
      ],
    })

    // Serialize Date objects for JSON response
    return NextResponse.json({
      prompts: prompts.map(prompt => ({
        id: prompt.id,
        name: prompt.name,
        prompt: prompt.prompt,
        isDefault: prompt.isDefault,
        createdAt: prompt.createdAt.toISOString(),
        updatedAt: prompt.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error("Error fetching prompts:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch prompts",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

// POST: Create a new prompt
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { name, prompt, isDefault } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 }
      )
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "prompt is required and must be a non-empty string" },
        { status: 400 }
      )
    }

    // Create the prompt
    const savedPrompt = await prisma.savedPrompt.create({
      data: {
        userId: user.id,
        name: name.trim(),
        prompt: prompt.trim(),
        isDefault: isDefault === true,
      },
    })

    return NextResponse.json({
      id: savedPrompt.id,
      name: savedPrompt.name,
      prompt: savedPrompt.prompt,
      isDefault: savedPrompt.isDefault,
      createdAt: savedPrompt.createdAt.toISOString(),
      updatedAt: savedPrompt.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("Error creating prompt:", error)
    return NextResponse.json(
      { 
        error: "Failed to create prompt",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

// PUT: Update an existing prompt
export async function PUT(request: NextRequest) {
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

    const body = await request.json()
    const { id, name, prompt, isDefault } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      )
    }

    // Verify the prompt belongs to the user
    const existingPrompt = await prisma.savedPrompt.findUnique({
      where: { id },
    })

    if (!existingPrompt) {
      return NextResponse.json(
        { error: "Prompt not found" },
        { status: 404 }
      )
    }

    if (existingPrompt.userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized: You can only update your own prompts" },
        { status: 403 }
      )
    }

    // Build update data
    const updateData: {
      name?: string
      prompt?: string
      isDefault?: boolean
    } = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { error: "name must be a non-empty string" },
          { status: 400 }
        )
      }
      updateData.name = name.trim()
    }

    if (prompt !== undefined) {
      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        return NextResponse.json(
          { error: "prompt must be a non-empty string" },
          { status: 400 }
        )
      }
      updateData.prompt = prompt.trim()
    }

    if (isDefault !== undefined) {
      updateData.isDefault = isDefault === true
    }

    // Update the prompt
    const updatedPrompt = await prisma.savedPrompt.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      id: updatedPrompt.id,
      name: updatedPrompt.name,
      prompt: updatedPrompt.prompt,
      isDefault: updatedPrompt.isDefault,
      createdAt: updatedPrompt.createdAt.toISOString(),
      updatedAt: updatedPrompt.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("Error updating prompt:", error)
    return NextResponse.json(
      { 
        error: "Failed to update prompt",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

// DELETE: Delete a prompt
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      )
    }

    // Verify the prompt belongs to the user
    const existingPrompt = await prisma.savedPrompt.findUnique({
      where: { id },
    })

    if (!existingPrompt) {
      return NextResponse.json(
        { error: "Prompt not found" },
        { status: 404 }
      )
    }

    if (existingPrompt.userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized: You can only delete your own prompts" },
        { status: 403 }
      )
    }

    // Delete the prompt
    await prisma.savedPrompt.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting prompt:", error)
    return NextResponse.json(
      { 
        error: "Failed to delete prompt",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

