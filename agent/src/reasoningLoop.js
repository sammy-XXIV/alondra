import { getRoutes, effectiveCostPct, routeBridgeName } from "./lifi.js";
import { btl, BTL_MODEL } from "./btlClient.js";

const MAX_USD_PER_TX = Number(process.env.MAX_USD_PER_TX ?? 1000);

function buildRouteSummaries(routes) {
  return routes
    .map((route, i) => ({ i, route, cost: effectiveCostPct(route) }))
    .filter((r) => r.cost !== null)
    .map(({ i, route, cost }) => ({
      index: i,
      bridge: routeBridgeName(route),
      effectiveCostPct: Number(cost.toFixed(3)),
      outputUSD: Number(parseFloat(route.toAmountUSD).toFixed(4)),
      gasCostUSD: route.gasCostUSD ?? null,
      executionDurationSec: route.steps?.[0]?.estimate?.executionDuration ?? null,
    }));
}

function buildPrompt(intent, summaries) {
  const median = [...summaries].sort((a, b) => a.effectiveCostPct - b.effectiveCostPct)[Math.floor(summaries.length / 2)]?.effectiveCostPct;
  return `You are a bridge-routing agent. Your ONLY goal is to find the route with the genuinely lowest real-world slippage/cost for this trade, not just the lowest number on paper.

Trade: bridge ${intent.fromAmount} of ${intent.tokenSymbol} from chain ${intent.fromChainId} to chain ${intent.toChainId}.

Candidate routes (effectiveCostPct = total value lost end-to-end, i.e. the real slippage+fees):
${JSON.stringify(summaries, null, 2)}

Median effective cost across candidates: ${median}%

Some quotes are junk artifacts of thin liquidity for this trade size (e.g. a route quoting 10x the median cost is almost certainly a bad/unreliable quote, not a real option). Reason step by step:
1. Identify and exclude any routes that look like liquidity/pricing artifacts.
2. Among the remaining genuinely viable routes, pick the one with the lowest real effective cost.
3. Note any reliability concerns (e.g. very long execution time) even for the winning route.

Respond with ONLY a JSON object, no other text:
{
  "excludedIndexes": [array of route indexes you excluded as junk, with why in "reasoning"],
  "chosenIndex": <index of the winning route>,
  "reasoning": "<your step-by-step reasoning as a short paragraph>"
}`;
}

function parseDecision(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Could not parse agent decision from: ${text}`);
  return JSON.parse(match[0]);
}

/**
 * Runs the full perceive -> reason -> decide loop for one bridge intent.
 * Does NOT sign or send anything -- that's a separate, explicit step.
 */
export async function decideBestRoute(intent, { onStep } = {}) {
  const trail = { intent, timestamp: new Date().toISOString(), steps: [] };
  const emit = (s) => {
    trail.steps.push(s);
    onStep?.(s);
  };

  const routes = await getRoutes(intent);
  emit({ step: "fetch_routes", count: routes.length });

  if (routes.length === 0) {
    trail.decision = { execute: false, reason: "No viable routes found." };
    onStep?.({ step: "decision", ...trail.decision });
    return trail;
  }

  const fromAmountUSD = parseFloat(routes[0].fromAmountUSD);
  if (fromAmountUSD > MAX_USD_PER_TX) {
    emit({ step: "cap_check", fromAmountUSD, MAX_USD_PER_TX, passed: false });
    trail.decision = {
      execute: false,
      reason: `Trade value $${fromAmountUSD} exceeds the hard $${MAX_USD_PER_TX} cap. Refusing before any route reasoning.`,
    };
    onStep?.({ step: "decision", ...trail.decision });
    return trail;
  }
  emit({ step: "cap_check", fromAmountUSD, MAX_USD_PER_TX, passed: true });

  const summaries = buildRouteSummaries(routes);
  emit({ step: "summarize_routes", summaries });

  const prompt = buildPrompt(intent, summaries);
  const completion = await btl.chat.completions.create({
    model: BTL_MODEL,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = completion.choices[0].message.content;
  emit({ step: "llm_reasoning_raw", raw });

  const parsed = parseDecision(raw);
  emit({ step: "llm_decision", ...parsed });

  const chosen = routes[parsed.chosenIndex];
  if (!chosen) {
    trail.decision = { execute: false, reason: "Agent's chosen index did not map to a valid route." };
    onStep?.({ step: "decision", ...trail.decision });
    return trail;
  }

  trail.decision = {
    execute: true,
    chosenRoute: {
      bridge: routeBridgeName(chosen),
      effectiveCostPct: effectiveCostPct(chosen),
      route: chosen,
    },
    reasoning: parsed.reasoning,
  };
  onStep?.({
    step: "decision",
    execute: true,
    bridge: trail.decision.chosenRoute.bridge,
    effectiveCostPct: trail.decision.chosenRoute.effectiveCostPct,
    reasoning: parsed.reasoning,
  });
  return trail;
}
