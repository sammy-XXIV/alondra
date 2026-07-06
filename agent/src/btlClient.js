import OpenAI from "openai";

export const btl = new OpenAI({
  apiKey: process.env.BTL_API_KEY,
  baseURL: process.env.BTL_BASE_URL,
});

export const BTL_MODEL = process.env.BTL_MODEL;
