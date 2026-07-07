import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { decideBestRoute } from "./reasoningLoop.js";
import { buildSignableTransactions } from "./buildTx.js";
import { searchToken } from "./lifi.js";
import { allKnownTokens, getTokenBalance, CHAINS } from "./walletTokens.js";

const TOKENS = allKnownTokens();

/** Resolve a symbol or address on a chain to a full token record, falling back
 *  to a live LI.FI lookup for anything not in the hardcoded native+USDC list. */
async function resolveToken(chainId, symbolOrAddress) {
  const known = TOKENS[`${chainId}-${symbolOrAddress.toUpperCase()}`];
  if (known) return known;

  const found = await searchToken({ chainId, query: symbolOrAddress });
  if (!found) throw new Error(`No token matching "${symbolOrAddress}" on chain ${chainId}.`);
  return {
    chainId,
    chainName: CHAINS[chainId]?.name ?? String(chainId),
    symbol: found.symbol,
    address: found.address,
    decimals: found.decimals,
  };
}

function textResult(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

/** One fresh McpServer per request (stateless HTTP mode) -- required for a
 *  serverless deployment where no process outlives a single invocation. */
export function createMcpServer() {
  const server = new McpServer({ name: "alondra", version: "0.1.0" });

  server.registerTool(
    "find_best_bridge_route",
    {
      title: "Find the lowest-slippage bridge route",
      description:
        "Given a token bridge/swap intent, scouts live routes across 32 bridges and 6 chains (Ethereum, Arbitrum, Base, Optimism, BNB Chain, Polygon), reasons about which quotes are genuine vs. liquidity/pricing artifacts, and returns the best route. If a viable route is found within the $1000 hard cap, also returns ready-to-sign transaction calldata -- the caller's own wallet must sign and send it, Alondra never takes custody of funds.",
      inputSchema: {
        fromChainId: z.number().describe("Source chain ID, e.g. 8453 for Base"),
        fromToken: z.string().describe('Source token symbol (e.g. "USDC") or contract address'),
        toChainId: z.number().describe("Destination chain ID"),
        toToken: z.string().describe('Destination token symbol or contract address'),
        amount: z.string().describe('Human-readable amount to send, e.g. "100"'),
        fromAddress: z.string().describe("Wallet address the funds will be sent from"),
        toAddress: z.string().optional().describe("Recipient address; defaults to fromAddress"),
      },
    },
    async ({ fromChainId, fromToken, toChainId, toToken, amount, fromAddress, toAddress }) => {
      const from = await resolveToken(fromChainId, fromToken);
      const to = await resolveToken(toChainId, toToken);
      const fromAmount = String(Math.round(Number(amount) * 10 ** from.decimals));

      const trail = await decideBestRoute({
        fromChainId: from.chainId,
        toChainId: to.chainId,
        fromTokenAddress: from.address,
        toTokenAddress: to.address,
        fromAmount,
        fromAddress,
        toAddress: toAddress || fromAddress,
        tokenSymbol: from.symbol,
      });

      if (!trail.decision.execute) {
        return textResult({ execute: false, reason: trail.decision.reason });
      }

      const transactions = await buildSignableTransactions(trail.decision.chosenRoute.route);
      return textResult({
        execute: true,
        bridge: trail.decision.chosenRoute.bridge,
        effectiveCostPct: trail.decision.chosenRoute.effectiveCostPct,
        reasoning: trail.decision.reasoning,
        estimatedSeconds: trail.decision.chosenRoute.route.steps?.[0]?.estimate?.executionDuration ?? null,
        transactions,
      });
    },
  );

  server.registerTool(
    "search_token",
    {
      title: "Search for a token on a supported chain",
      description:
        "Resolves any token LI.FI knows about on a given chain by symbol, name, or address -- not just the common native+USDC tokens -- and optionally its live balance for a wallet.",
      inputSchema: {
        chainId: z.number().describe("Chain ID, e.g. 8453 for Base"),
        query: z.string().describe('Symbol, name, or contract address, e.g. "AERO"'),
        address: z.string().optional().describe("Wallet address to check the live balance for"),
      },
    },
    async ({ chainId, query, address }) => {
      const found = await searchToken({ chainId, query });
      if (!found) return textResult({ found: false, message: `No token matching "${query}" on chain ${chainId}.` });

      const result = {
        found: true,
        chainId,
        chainName: CHAINS[chainId]?.name ?? String(chainId),
        symbol: found.symbol,
        name: found.name,
        address: found.address,
        decimals: found.decimals,
        priceUSD: found.priceUSD,
      };
      if (address) {
        try {
          result.balance = await getTokenBalance(chainId, found.address, found.decimals, address);
        } catch {
          result.balance = null;
        }
      }
      return textResult(result);
    },
  );

  server.registerTool(
    "list_supported_chains",
    {
      title: "List chains and default tokens Alondra can route between",
      description: "Returns the chains Alondra supports and their native + USDC tokens as a starting point (search_token can resolve anything beyond this).",
      inputSchema: {},
    },
    async () => textResult({ chains: CHAINS, tokens: TOKENS }),
  );

  return server;
}
