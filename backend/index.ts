import { Hono } from "hono";
import { OpenAI } from "openai";

const app = new Hono();

app.get("/", (c) => c.text("Hello Hono.js"));

app.get("/openai/chat/", async (c) => {
  const { message } = c.req.query();
  if (!message) {
    return c.json({ error: "message is required" }, 400);
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: message }],
  });
  return c.json(completion.choices[0].message.content);
});

export default {
  port: 3000,
  fetch: app.fetch,
};