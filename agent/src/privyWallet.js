const PRIVY_BASE = "https://api.privy.io/v1";

function authHeaders() {
  const auth = Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString("base64");
  return {
    Authorization: `Basic ${auth}`,
    "privy-app-id": process.env.PRIVY_APP_ID,
    "Content-Type": "application/json",
  };
}

/** Ask the agent's Privy-held EVM wallet to sign and broadcast a transaction.
 *  Privy's policy engine (native value cap) is evaluated server-side before this succeeds. */
export async function sendEvmTransaction({ walletId, chainId, to, data, value }) {
  const transaction = { data, value: value ?? "0x0" };
  if (to) transaction.to = to; // omit entirely for contract-creation txs

  const res = await fetch(`${PRIVY_BASE}/wallets/${walletId}/rpc`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      method: "eth_sendTransaction",
      caip2: `eip155:${chainId}`,
      chain_type: "ethereum",
      params: { transaction },
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Privy sendTransaction failed (status ${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}
