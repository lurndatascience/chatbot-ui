import {
  processCSV,
  processJSON,
  processMarkdown,
  processPdf,
  processTxt
} from "@/lib/retrieval/processing"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { FileItemChunk } from "@/types"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { DefaultAzureCredential } from "@azure/identity"
import axios from "axios"

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()
    const formData = await req.formData()

    const file_id = formData.get("file_id") as string
    const embeddingsProvider = formData.get("embeddingsProvider") as string

    const { data: fileMetadata, error: metadataError } = await supabaseAdmin
      .from("files")
      .select("*")
      .eq("id", file_id)
      .single()

    if (metadataError)
      throw new Error(
        `Failed to retrieve file metadata: ${metadataError.message}`
      )
    if (!fileMetadata) throw new Error("File not found")
    if (fileMetadata.user_id !== profile.user_id)
      throw new Error("Unauthorized")

    const { data: file, error: fileError } = await supabaseAdmin.storage
      .from("files")
      .download(fileMetadata.file_path)

    if (fileError)
      throw new Error(`Failed to retrieve file: ${fileError.message}`)

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const blob = new Blob([fileBuffer])
    const fileExtension = fileMetadata.name.split(".").pop()?.toLowerCase()

    let chunks: FileItemChunk[] = []
    switch (fileExtension) {
      case "csv":
        chunks = await processCSV(blob)
        break
      case "json":
        chunks = await processJSON(blob)
        break
      case "md":
        chunks = await processMarkdown(blob)
        break
      case "pdf":
        chunks = await processPdf(blob)
        break
      case "txt":
        chunks = await processTxt(blob)
        break
      default:
        return NextResponse.json(
          { message: "Unsupported file type" },
          { status: 400 }
        )
    }

    const credential = new DefaultAzureCredential()
    const token = await credential.getToken(
      "https://cognitiveservices.azure.com/.default"
    )

    const embeddingConfig = {
      azureDeployment: "text-embedding-ada-002",
      model: "text-embedding-ada-002",
      azureEndpoint: "http://localhost",
      apiVersion: "2023-05-15",
      azureAdToken: token.token
    }

    let embeddings = []
    if (embeddingsProvider === "openai") {
      try {
        const response = await axios.post(
          `${embeddingConfig.azureEndpoint}/openai/deployments/${embeddingConfig.azureDeployment}/embeddings?api-version=${embeddingConfig.apiVersion}`,
          {
            model: embeddingConfig.model,
            input: chunks.map(chunk => chunk.content)
          },
          {
            headers: {
              Authorization: `Bearer ${embeddingConfig.azureAdToken}`,
              "api-version": embeddingConfig.apiVersion
            }
          }
        )

        // Extract only the 'embedding' array from each item in response data
        embeddings = response.data?.data.map(item => item.embedding) || []
        console.log("Extracted embeddings", embeddings)
      } catch (error) {
        console.error("Error fetching Azure OpenAI embeddings:", error)
        throw new Error("Failed to retrieve embeddings")
      }
    }

    const fileItems = chunks.map((chunk, index) => ({
      file_id,
      user_id: profile.user_id,
      content: chunk.content,
      tokens: chunk.tokens,
      openai_embedding:
        embeddingsProvider === "openai" ? embeddings[index] || null : null
    }))
    console.log("fileItems", fileItems)

    const { data, error } = await supabaseAdmin
      .from("file_items")
      .upsert(fileItems)
    if (error) {
      console.error("Error upserting data:", error)
      throw new Error("Failed to upsert data into file_items table")
    } else {
      console.log("Data upserted successfully:", data)

      const totalTokens = fileItems.reduce((acc, item) => acc + item.tokens, 0)
      await supabaseAdmin
        .from("files")
        .update({ tokens: totalTokens })
        .eq("id", file_id)

      return NextResponse.json({ message: "Embed Successful" }, { status: 200 })
    }
  } catch (error: any) {
    console.error(`Error in retrieval/process: ${error.stack}`)
    const errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return NextResponse.json({ message: errorMessage }, { status: errorCode })
  }
}
