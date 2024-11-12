import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { createClient } from "@supabase/supabase-js"
import axios from "axios"

export async function POST(request: Request) {
  const json = await request.json()
  const { userInput, fileIds, embeddingsProvider, sourceCount } = json as {
    userInput: string
    fileIds: string[]
    embeddingsProvider: "openai" // Assuming you might have more options later
    sourceCount: number
  }

  const embeddingConfig = {
    azureDeployment: "text-embedding-ada-002",
    model: "text-embedding-ada-002",
    azureEndpoint: process.env.AZURE_ENDPOINT,
    apiVersion: "2023-05-15"
  }

  const uniqueFileIds = [...new Set(fileIds)]

  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()

    // Retrieve the API key for authorization
    const apiKey = process.env.AZURE_API_KEY || process.env.OPENAI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ message: "API key is missing" }), {
        status: 500
      })
    }

    // Perform the embedding request with the configured endpoint and headers
    const response = await axios.post(
      `${embeddingConfig.azureEndpoint}/openai/deployments/${embeddingConfig.azureDeployment}/embeddings?api-version=${embeddingConfig.apiVersion}`,
      {
        model: embeddingConfig.model,
        input: userInput
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey
        }
      }
    )

    // Extract embeddings
    const embeddings = response.data?.data || []
    if (!embeddings.length) {
      return new Response(
        JSON.stringify({ message: "No embeddings returned." }),
        { status: 400 }
      )
    }

    const openaiEmbedding = embeddings[0].embedding

    // Call the Supabase RPC function to find the most similar file items
    const { data: openaiFileItems, error: openaiError } =
      await supabaseAdmin.rpc("match_file_items_openai", {
        query_embedding: openaiEmbedding as any,
        match_count: sourceCount,
        file_ids: uniqueFileIds
      })

    if (openaiError) {
      throw openaiError
    }

    const mostSimilarChunks =
      openaiFileItems?.sort((a, b) => b.similarity - a.similarity) || []

    return new Response(JSON.stringify({ results: mostSimilarChunks }), {
      status: 200
    })
  } catch (error: any) {
    console.error("Error in retrieval/matching process:", error.stack)
    const errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
