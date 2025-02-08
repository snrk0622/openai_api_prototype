import { Hono } from "hono";
import { cors } from "hono/cors";
import { OpenAI } from "openai";
import { encoding_for_model } from "tiktoken";

const DEFAULT_MODEL = "gpt-4o-mini";

const app = new Hono();

// CORSミドルウェアを追加
app.use('/*', cors({
  origin: ['http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length', 'X-Requested-With'],
  credentials: true,
  maxAge: 600,
}));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (c) => c.text("Hello Hono.js"));

app.get("/openai/chat/", async (c) => {
  const { message } = c.req.query();
  if (!message) {
    return c.json({ error: "message is required" }, 400);
  }
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: message }],
  });
  return c.json(completion.choices[0].message.content);
});

app.post("/openai/stream/", async (c) => {
  console.log("Started '/openai/stream/' request")

  const { model = DEFAULT_MODEL, messages } = await c.req.json();
  if (!messages) {
    return c.json({ error: "messages is required" }, 400);
  }
  
  const stream = await openai.chat.completions.create({
    model,
    messages,
    stream: true,
  });

  const encoder = encoding_for_model(model);
  let streamController: ReadableStreamDefaultController;

  // フロントエンドからの中断を検知
  c.req.raw.signal.addEventListener('abort', () => {
    stream.controller.abort();
    if (streamController) {
      streamController.close();
    }
    console.log("Stream aborted by client");
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        streamController = controller;

        const fullResponse = {
          model,
          message: '',
        }

        // 最初にモデル情報を返却
        const inputTokens = encoder.encode(messages.map(m => m.content).join('')).length;
        controller.enqueue(JSON.stringify({ type: 'model', data: model, tokens: inputTokens }) + '\n' );

        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            controller.enqueue(JSON.stringify({ type: 'text', data: text, tokens: encoder.encode(text).length }) + '\n');
            fullResponse.message += text;
          }
          console.log("Finished '/openai/stream/' request successfully with response: ", fullResponse)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            stream.controller.abort();
            console.log("Finished '/openai/stream/' request by abort")
          } else {
            console.error("Finished '/openai/stream/' request with error: ", error)
          }
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
});

export default {
  port: 3000,
  fetch: app.fetch,
};