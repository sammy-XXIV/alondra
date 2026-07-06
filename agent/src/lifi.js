const LIFI_BASE = "https://li.quest/v1";

function lifiHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (process.env.LIFI_API_KEY) headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  return headers;
}

/** Fetch every viable bridge route LI.FI can find for this trade.
 *  `fromAddress` must be whoever actually calls the bridge contract on-chain
 *  (the vault, once execution is vault-mediated) -- `toAddress` is who should
 *  actually receive the funds (the real end user), which can differ. */
export async function getRoutes({ fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromAmount, fromAddress, toAddress, slippage = 0.005 }) {
  const res = await fetch(`${LIFI_BASE}/advanced/routes`, {
    method: "POST",
    headers: lifiHeaders(),
    body: JSON.stringify({
      fromChainId,
      toChainId,
      fromTokenAddress,
      toTokenAddress,
      fromAmount,
      fromAddress: fromAddress.toLowerCase(),
      toAddress: (toAddress ?? fromAddress).toLowerCase(),
      options: { slippage },
    }),
  });
  if (!res.ok) {
    throw new Error(`LI.FI routes request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.routes ?? [];
}

/** Get the executable transaction (to/data/value) for the first step of a chosen route. */
export async function getStepTransaction(step) {
  const res = await fetch(`${LIFI_BASE}/advanced/stepTransaction`, {
    method: "POST",
    headers: lifiHeaders(),
    body: JSON.stringify(step),
  });
  if (!res.ok) {
    throw new Error(`LI.FI stepTransaction request failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Effective cost = how much value is lost end to end (fees + slippage + price impact). */
export function effectiveCostPct(route) {
  const fromUSD = parseFloat(route.fromAmountUSD);
  const toUSD = parseFloat(route.toAmountUSD);
  if (!fromUSD || !toUSD) return null;
  return ((fromUSD - toUSD) / fromUSD) * 100;
}

export function routeBridgeName(route) {
  return route.steps.map((s) => s.toolDetails.name).join(" + ");
}
