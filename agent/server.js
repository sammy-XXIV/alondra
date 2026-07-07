import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { decideBestRoute } from "./src/reasoningLoop.js";
import { buildSignableTransactions } from "./src/buildTx.js";
import { allKnownTokens, detectHeldTokens, getTokenBalance, CHAINS } from "./src/walletTokens.js";
import { searchToken } from "./src/lifi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(path.join(__dirname, "../ui")));
app.use(express.json());

const TOKENS = allKnownTokens();

// Full set of tokens we know how to route to (destination doesn't need an existing balance).
app.get("/api/tokens", (_req, res) => res.json(TOKENS));

// Only the tokens this wallet actually holds right now, with live balances --
// this is what should populate "From", since that's all it can actually bridge.
// Defaults to the agent's own wallet (self-test path) if no address is given.
app.get("/api/wallet-tokens", async (req, res) => {
  try {
    const address = req.query.address || process.env.AGENT_WALLET_ADDRESS;
    const held = await detectHeldTokens(address);
    res.json(held);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Resolve any token LI.FI knows about on a chain (not just the hardcoded list) --
// e.g. LMT on Base -- and, if a wallet address is given, its live balance there.
app.get("/api/token-search", async (req, res) => {
  try {
    const chainId = Number(req.query.chainId);
    const query = (req.query.query || "").trim();
    if (!chainId || !CHAINS[chainId]) throw new Error("Unknown or missing chainId.");
    if (!query) throw new Error("Missing search query.");

    const token = await searchToken({ chainId, query });
    if (!token) return res.status(404).json({ message: `No token matching "${query}" on ${CHAINS[chainId].name}.` });

    const result = {
      chainId,
      chainName: CHAINS[chainId].name,
      symbol: token.symbol,
      name: token.name,
      address: token.address,
      decimals: token.decimals,
      logoURI: token.logoURI,
      priceUSD: token.priceUSD,
    };

    if (req.query.address) {
      try {
        result.balance = await getTokenBalance(chainId, token.address, token.decimals, req.query.address);
      } catch {
        result.balance = null;
      }
    }

    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/run", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { fromKey, toKey, fromToken, toToken, amount, destination, sender } = req.query;
    // Known tokens are looked up by key; searched tokens (anything LI.FI resolves
    // that isn't in the hardcoded list) arrive as an explicit JSON blob instead,
    // since they were never registered server-side.
    const from = fromToken ? JSON.parse(fromToken) : TOKENS[fromKey];
    const to = toToken ? JSON.parse(toToken) : TOKENS[toKey];
    if (!from || !to) throw new Error("Unknown token selection.");
    if (!sender) throw new Error("Missing sender (connected wallet address).");

    // `sender` is whoever actually signs and sends the transaction (the
    // connected wallet) -- `destination` is just where the bridged funds
    // should land, which can be a different address entirely.
    const recipient = destination || sender;
    const fromAmount = String(Math.round(Number(amount) * 10 ** from.decimals));

    const intent = {
      fromChainId: from.chainId,
      toChainId: to.chainId,
      fromTokenAddress: from.address,
      toTokenAddress: to.address,
      fromAmount,
      fromAddress: sender,
      toAddress: recipient,
      tokenSymbol: from.symbol,
    };

    const trail = await decideBestRoute(intent, { onStep: (s) => send("step", s) });

    // Always prepare the signable transaction(s) once a route is chosen -- this
    // is just calldata assembly, no signing happens here. Whether it fires
    // automatically or waits for a manual confirm click is the frontend's call.
    if (trail.decision?.execute) {
      const txs = await buildSignableTransactions(trail.decision.chosenRoute.route);
      const estimatedSeconds = trail.decision.chosenRoute.route.steps?.[0]?.estimate?.executionDuration ?? null;
      send("step", { step: "ready_to_sign", txs, estimatedSeconds });
    }

    send("done", { trail });
  } catch (err) {
    send("error", { message: err.message });
  } finally {
    res.end();
  }
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3300;
  app.listen(PORT, () => console.log(`Guardian bridge agent server listening on http://localhost:${PORT}`));
}

export default app;
