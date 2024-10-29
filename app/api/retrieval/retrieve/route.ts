import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { createClient } from "@supabase/supabase-js"
import { DefaultAzureCredential } from "@azure/identity"
import axios from "axios"

export async function POST(request: Request) {
  const json = await request.json()
  const { userInput, fileIds, embeddingsProvider, sourceCount } = json as {
    userInput: string
    fileIds: string[]
    embeddingsProvider: "openai" // Assuming you might have more options later
    sourceCount: number
  }

  const credential = new DefaultAzureCredential()

  // Ensure the token is fetched properly
  let token
  try {
    token = await credential.getToken(
      "https://cognitiveservices.azure.com/.default"
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ message: "Failed to get Azure token." }),
      { status: 500 }
    )
  }

  const embeddingConfig = {
    azureDeployment: "text-embedding-ada-002",
    model: "text-embedding-ada-002",
    azureEndpoint: "http://localhost", // Make sure this is correct
    apiVersion: "2023-05-15",
    azureAdToken: token.token
  }

  const uniqueFileIds = [...new Set(fileIds)]

  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile() // Ensure this is handled properly (e.g., error handling)

    const response = await axios.post(
      `${embeddingConfig.azureEndpoint}/openai/deployments/${embeddingConfig.azureDeployment}/embeddings?api-version=${embeddingConfig.apiVersion}`,
      {
        model: embeddingConfig.model,
        input: userInput
      },
      {
        headers: {
          Authorization: `Bearer ${embeddingConfig.azureAdToken}`,
          "api-version": embeddingConfig.apiVersion
        }
      }
    )

    const embeddings = response.data?.data || [] // Check if data is valid
    console.log("OpenAI embeddings", embeddings)

    if (!embeddings.length) {
      return new Response(
        JSON.stringify({ message: "No embeddings returned." }),
        { status: 400 }
      )
    }

    const openaiEmbedding = embeddings[0].embedding // Use the first embedding directly

    // Call the Supabase function to match file items
    const { data: openaiFileItems, error: openaiError } =
      await supabaseAdmin.rpc("match_file_items_openai", {
        query_embedding: openaiEmbedding as any,
        match_count: sourceCount,
        file_ids: uniqueFileIds
      })

    if (openaiError) {
      throw openaiError // Rethrow Supabase errors
    }

    const mostSimilarChunks =
      openaiFileItems?.sort((a, b) => b.similarity - a.similarity) || []
    console.log(
      "mostSimilarChunks",
      mostSimilarChunks,
      "openaiFileItems",
      openaiFileItems,
      { data: openaiFileItems, error: openaiError }
    )
    return new Response(JSON.stringify({ results: mostSimilarChunks }), {
      status: 200
    })
  } catch (error: any) {
    const errorMessage = error.message || "An unexpected error occurred" // Improved error message handling
    const errorCode = error.status || 500 // Ensure proper error status code
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
