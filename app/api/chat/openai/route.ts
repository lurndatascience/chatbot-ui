import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { StreamingTextResponse } from "ai"
import { ServerRuntime } from "next"
import { createClient } from "@/lib/supabase/middleware"
import { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export const runtime: ServerRuntime = "edge"

export async function POST(request: NextRequest) {
  const json = await request.json()
  const { chatSettings, messages } = json as {
    chatSettings: ChatSettings
    messages: any[]
  }

  const { supabase, response } = createClient(request)

  const session = await supabase.auth.getSession()
  const { data: homeWorkspace, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("user_id", session.data.session?.user.id)
    .eq("is_home", true)
    .single()

  if (!homeWorkspace) {
    throw new Error(error?.message)
  }
  console.log("homeWorkspace", homeWorkspace, homeWorkspace.id)

  console.log("chat_completions", {
    chatSettings,
    messages,
    homeWorkspaceId: homeWorkspace.id
  })
  const profile = await getServerProfile()
  try {
    const response = await fetch(
      `${process.env.BACKEND_URL}/chat_completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ chatSettings, messages, homeWorkspace }) // Convert the data to JSON format
      }
    )

    if (!response.ok) {
      throw new Error("Network response was not ok")
    }

    const responseData = await response.json() // Parse the JSON response
    console.log("Success:", responseData)
    const output = responseData.res
    return new NextResponse(output, { status: 200 }) //new StreamingTextResponse(responseData)
  } catch (error) {
    console.error("Error:", error)
  }
}
