import "dotenv/config";
import { decideBestRoute } from "../src/reasoningLoop.js";
import { executeDecision } from "../src/executeRoute.js";

const NATIVE = "0x0000000000000000000000000000000000000000";

const intent = {
  fromChainId: 42161,
  toChainId: 8453,
  fromTokenAddress: NATIVE,
  toTokenAddress: NATIVE,
  fromAmount: "1100000000000000", // 0.0011 ETH, leaving buffer for this tx's own Arbitrum gas
  fromAddress: process.env.AGENT_WALLET_ADDRESS,
  tokenSymbol: "ETH",
};

const trail = await decideBestRoute(intent, {
  onStep: (s) => console.log(JSON.stringify(s).slice(0, 400)),
});

console.log("DECISION:", JSON.stringify(trail.decision?.chosenRoute ? { bridge: trail.decision.chosenRoute.bridge, cost: trail.decision.chosenRoute.effectiveCostPct } : trail.decision, null, 2));

if (trail.decision?.execute) {
  await executeDecision(trail, { walletId: process.env.AGENT_WALLET_ID });
  console.log("EXECUTION:", JSON.stringify(trail.execution, null, 2));
} else {
  console.log("Not executing.");
}
