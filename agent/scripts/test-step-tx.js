import "dotenv/config";
import { decideBestRoute } from "../src/reasoningLoop.js";
import { getStepTransaction } from "../src/lifi.js";

const trail = await decideBestRoute({
  fromChainId: 1,
  toChainId: 42161,
  fromTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  toTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  fromAmount: "1000000",
  fromAddress: process.env.AGENT_WALLET_ADDRESS,
  tokenSymbol: "USDC",
});

const step = trail.decision.chosenRoute.route.steps[0];
const txData = await getStepTransaction(step);

console.log("approvalAddress:", txData.estimate?.approvalAddress);
console.log("transactionRequest:", JSON.stringify(txData.transactionRequest, null, 2));
