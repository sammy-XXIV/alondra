import { Interface } from "ethers";
import { getStepTransaction } from "./lifi.js";

const NATIVE = "0x0000000000000000000000000000000000000000";
const erc20Iface = new Interface(["function approve(address spender, uint256 amount) returns (bool)"]);

/**
 * Builds the transaction(s) the CONNECTED WALLET needs to sign to actually
 * execute the agent-chosen route -- one tx for native tokens, an approve +
 * the bridge call for ERC-20s (standard everywhere, not specific to us).
 * No custody, no deposit, no agent-held keys involved.
 */
export async function buildSignableTransactions(route) {
  const step = route.steps[0];
  const txData = await getStepTransaction(step);
  const tx = txData.transactionRequest;
  const chainId = step.action.fromChainId;
  const txs = [];

  const isErc20 = step.action.fromToken.address.toLowerCase() !== NATIVE;
  if (isErc20) {
    const approvalTarget = txData.estimate.approvalAddress;
    const approveData = erc20Iface.encodeFunctionData("approve", [approvalTarget, step.action.fromAmount]);
    txs.push({ label: "Approve", to: step.action.fromToken.address, data: approveData, value: "0x0", chainId });
  }
  txs.push({ label: "Bridge", to: tx.to, data: tx.data, value: tx.value ?? "0x0", chainId });
  return txs;
}
