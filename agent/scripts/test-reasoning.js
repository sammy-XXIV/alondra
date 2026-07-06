import "dotenv/config";
import { decideBestRoute } from "../src/reasoningLoop.js";

const trail = await decideBestRoute({
  fromChainId: 1,
  toChainId: 42161,
  fromTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum
  toTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC on Arbitrum
  fromAmount: "1000000", // 1 USDC (6 decimals)
  fromAddress: process.env.AGENT_WALLET_ADDRESS,
  tokenSymbol: "USDC",
});

console.log(JSON.stringify(trail, null, 2));
