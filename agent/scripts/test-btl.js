import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.BTL_API_KEY,
  baseURL: process.env.BTL_BASE_URL,
});

const response = await client.chat.completions.create({
  model: process.env.BTL_MODEL,
  messages: [{ role: "user", content: "Say hello from my Runtime workspace." }],
});

console.log(response.choices[0].message.content);
