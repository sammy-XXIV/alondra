import { JsonRpcProvider, Contract, formatUnits } from "ethers";

const NATIVE = "0x0000000000000000000000000000000000000000";

const TW = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";

export const CHAINS = {
  1: { name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", nativeSymbol: "ETH", logoURI: `${TW}/ethereum/info/logo.png` },
  42161: { name: "Arbitrum", rpc: "https://arb1.arbitrum.io/rpc", nativeSymbol: "ETH", logoURI: `${TW}/ethereum/info/logo.png` },
  8453: { name: "Base", rpc: "https://mainnet.base.org", nativeSymbol: "ETH", logoURI: `${TW}/ethereum/info/logo.png` },
  10: { name: "Optimism", rpc: "https://mainnet.optimism.io", nativeSymbol: "ETH", logoURI: `${TW}/ethereum/info/logo.png` },
  56: { name: "BNB Chain", rpc: "https://bsc-rpc.publicnode.com", nativeSymbol: "BNB", logoURI: `${TW}/binance/info/logo.png` },
  137: { name: "Polygon", rpc: "https://polygon-bor-rpc.publicnode.com", nativeSymbol: "POL", logoURI: `${TW}/polygon/info/logo.png` },
};

const ERC20_BY_CHAIN = {
  1: [{ symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, logoURI: `${TW}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png` }],
  42161: [{ symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, logoURI: `${TW}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png` }],
  8453: [{ symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, logoURI: `${TW}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png` }],
  10: [{ symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6, logoURI: `${TW}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png` }],
  56: [{ symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, logoURI: `${TW}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png` }],
  137: [{ symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, logoURI: `${TW}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png` }],
};

const erc20Abi = ["function balanceOf(address) view returns (uint256)"];

/** Full set of tokens we know how to route, native + USDC, on every supported chain. */
export function allKnownTokens() {
  const out = {};
  for (const [chainIdStr, chain] of Object.entries(CHAINS)) {
    const chainId = Number(chainIdStr);
    out[`${chainId}-${chain.nativeSymbol}`] = {
      chainId, chainName: chain.name, symbol: chain.nativeSymbol, address: NATIVE, decimals: 18, logoURI: chain.logoURI,
    };
    for (const t of ERC20_BY_CHAIN[chainId] || []) {
      out[`${chainId}-${t.symbol}`] = {
        chainId, chainName: chain.name, symbol: t.symbol, address: t.address, decimals: t.decimals, logoURI: t.logoURI,
      };
    }
  }
  return out;
}

/** Live balance of one specific token (any address, not just the hardcoded list) for a wallet. */
export async function getTokenBalance(chainId, tokenAddress, decimals, walletAddress) {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`);
  const provider = new JsonRpcProvider(chain.rpc, chainId, { staticNetwork: true });
  const raw = tokenAddress.toLowerCase() === NATIVE
    ? await provider.getBalance(walletAddress)
    : await new Contract(tokenAddress, erc20Abi, provider).balanceOf(walletAddress);
  return formatUnits(raw, decimals);
}

/** Which of those tokens does this wallet actually hold (balance > 0), on-chain, right now. */
export async function detectHeldTokens(address) {
  const known = allKnownTokens();
  const checks = Object.entries(known).map(async ([key, t]) => {
    const chain = CHAINS[t.chainId];
    const provider = new JsonRpcProvider(chain.rpc, t.chainId, { staticNetwork: true });
    try {
      let raw;
      if (t.address === NATIVE) {
        raw = await provider.getBalance(address);
      } else {
        raw = await new Contract(t.address, erc20Abi, provider).balanceOf(address);
      }
      if (raw > 0n) return { key, ...t, balance: formatUnits(raw, t.decimals) };
    } catch {
      // unreachable RPC or bad call -- just omit this token, don't fail the whole scan
    }
    return null;
  });
  const settled = await Promise.all(checks);
  return Object.fromEntries(settled.filter(Boolean).map((t) => [t.key, t]));
}
