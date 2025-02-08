import { Hono } from "hono";
import { cors } from "hono/cors";
import { OpenAI } from "openai";

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
  const { model = DEFAULT_MODEL, message } = await c.req.json();
  if (!message) {
    return c.json({ error: "message is required" }, 400);
  }
  
  const stream = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: message }],
    stream: true,
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        // 最初にモデル情報を返却
        controller.enqueue(JSON.stringify({ type: 'model', data: model }) + '\n' );

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          controller.enqueue(JSON.stringify({ type: 'text', data: text }) + '\n');
        }
        controller.close();
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