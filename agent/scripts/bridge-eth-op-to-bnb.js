import "dotenv/config";
import { decideBestRoute } from "../src/reasoningLoop.js";
import { executeDecision } from "../src/executeRoute.js";

const NATIVE = "0x0000000000000000000000000000000000000000";

const intent = {
  fromChainId: 10,
  toChainId: 56,
  fromTokenAddress: NATIVE,
  toTokenAddress: NATIVE, // BNB on BNB Chain -- this is a cross-asset swap+bridge, not same-token
  fromAmount: "900000000000000", // 0.0009 ETH, leaving buffer for this tx's own Optimism gas
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
