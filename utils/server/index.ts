import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';

export class OpenAIError extends Error {
  type: string;
  param: string;
  code: string;

  constructor(message: string, type: string, param: string, code: string) {
    super(message);
    this.name = 'OpenAIError';
    this.type = type;
    this.param = param;
    this.code = code;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function OpenAIStream(res: Response): Promise<ReadableStream<Uint8Array>> {
  const stream = new ReadableStream({
    async start(controller) {
      // Define the parsing function
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          console.log("Event data" , event.data);
          const data = event.data;
          const json = JSON.parse(data);
          try {
            if ('status' in json && json.status === '[DONE]') {
                controller.close();
                return;
            }
            const text = json.tok;
            const queue = encoder.encode(text);
            controller.enqueue(queue);
          } catch (e) {
            controller.error(new OpenAIError('Failed to parse JSON', 'ParsingError', '', 'JSON_PARSE_ERROR'));
          }
        }
      };

      const parser = createParser(onParse);

      // Stream data from the response body
      try {
        for await (const chunk of res.body as any) {
          parser.feed(decoder.decode(chunk));
        }
      } catch (error) {
        controller.error(new OpenAIError('Error in stream processing', 'StreamError', '', 'STREAM_ERROR'));
      }
    },
  });

  return stream;
}
