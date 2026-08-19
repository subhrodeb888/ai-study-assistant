import type OpenAI from "openai";

export function createStringStreamResponse(
  text: string,
  headers?: Record<string, string>,
) {
  return new Response(text, {
    status: 200,

    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      ...headers,
    },
  });
}

export function createTextStreamResponse(
  stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
  options?: {
    onComplete?: (fullText: string) => Promise<void> | void;
    headers?: Record<string, string>;
  },
) {
  const encoder = new TextEncoder();

  let fullText = "";

  const readableStream = new ReadableStream({
    async start(controller) {
      let hadError = false;

      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            fullText += event.delta;

            controller.enqueue(encoder.encode(event.delta));
          }

          if (event.type === "response.completed") {
            controller.close();
          }
        }
      } catch (error) {
        hadError = true;

        console.error("OpenAI streaming error:", error);

        controller.error(error);
      }

      // Only persist when the stream succeeded and produced output.
      if (!hadError && fullText && options?.onComplete) {
        try {
          await options.onComplete(fullText);
        } catch (error) {
          console.error("Failed to persist stream output:", error);
        }
      }
    },
  });

  return new Response(readableStream, {
    status: 200,

    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...options?.headers,
    },
  });
}
