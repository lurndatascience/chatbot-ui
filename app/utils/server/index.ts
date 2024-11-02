import {
  ParsedEvent,
  ReconnectInterval,
  createParser
} from "eventsource-parser"

export class OpenAIError extends Error {
  type: string
  param: string
  code: string

  constructor(message: string, type: string, param: string, code: string) {
    super(message)
    this.name = "OpenAIError"
    this.type = type
    this.param = param
    this.code = code
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const OpenAIStream = async (res: Response) => {
  const stream = new ReadableStream({
    async start(controller) {
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === "event") {
          console.log("Event Type", event.type)
          const data = event.data
          const json = JSON.parse(data)
          console.log("Event Data", data)
          if (json.res === "DONE") {
            controller.close()
            return
          }
          try {
            const text = json.tok
            const queue = encoder.encode(text)
            controller.enqueue(queue)
          } catch (e) {
            controller.error(e)
          }
        }
      }

      const parser = createParser(onParse)

      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk))
      }
    }
  })
  return stream
}
