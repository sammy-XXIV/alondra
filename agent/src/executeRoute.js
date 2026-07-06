import { getStepTransaction } from "./lifi.js";
import { sendEvmTransaction } from "./privyWallet.js";
import { vaultAddressForChain, encodeExecuteBridge, encodeErc20Approve } from "./vaultClient.js";

const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

/**
 * Signs and sends the chosen route's bridge transaction via BridgeVault, for a
 * specific user's specific deposited balance. The vault (not the agent's own
 * wallet) holds the funds -- the agent only ever gets to move the amount this
 * user actually deposited, enforced on-chain by the contract itself.
 *
 * `user` defaults to the agent's own wallet address, which is the self-test
 * path (agent deposits into the vault for itself, then bridges for itself) --
 * the same call works for any other depositor's address once a real deposit
 * flow feeds users in.
 */
export async function executeDecision(trail, { walletId, user }) {
  if (!trail.decision?.execute) {
    throw new Error("Refusing to execute: this trail's decision.execute is not true.");
  }

  const route = trail.decision.chosenRoute.route;
  const step = route.steps[0];
  const chainId = step.action.fromChainId;
  const token = step.action.fromToken.address.toLowerCase() === NATIVE_TOKEN ? NATIVE_TOKEN : step.action.fromToken.address;
  const amount = step.action.fromAmount;

  const txData = await getStepTransaction(step);
  const tx = txData.transactionRequest;

  // Rough reimbursement estimate for the gas the agent's wallet is about to
  // front by submitting the executeBridge call itself.
  const gasLimit = BigInt(tx.gasLimit ?? "0x30000");
  const gasPrice = BigInt(tx.gasPrice ?? tx.maxFeePerGas ?? "0x0");
  const gasReimbursement = (gasLimit * gasPrice).toString();
  const bridgeValue = BigInt(tx.value ?? "0x0").toString();

  const vaultAddress = vaultAddressForChain(chainId);
  const approvalTarget = txData.estimate.approvalAddress;

  const executeBridgeData = encodeExecuteBridge({
    user,
    token,
    amount,
    approvalTarget,
    callTarget: tx.to,
    callData: tx.data,
    bridgeValue,
    gasReimbursement,
    bridgeName: route.steps.map((s) => s.toolDetails.name).join(" + "),
  });

  const result = await sendEvmTransaction({
    walletId,
    chainId,
    to: vaultAddress,
    data: executeBridgeData,
    value: "0x0",
  });

  trail.execution = {
    chainId,
    vaultAddress,
    user,
    txs: [{ type: "vault_execute_bridge", hash: result.data.hash }],
  };
  return trail;
}

/** Self-test helper: agent deposits its own token balance into the vault so
 *  there's something for executeDecision to bridge on the agent's own behalf. */
export async function depositToVaultForSelf({ walletId, chainId, token, amount, agentAddress }) {
  const vaultAddress = vaultAddressForChain(chainId);
  const txs = [];

  if (token.toLowerCase() !== NATIVE_TOKEN) {
    const approveData = encodeErc20Approve(vaultAddress, amount);
    const approveResult = await sendEvmTransaction({ walletId, chainId, to: token, data: approveData, value: "0x0" });
    txs.push({ type: "approve", hash: approveResult.data.hash });

    const { vaultIface } = await import("./vaultClient.js");
    const depositData = vaultIface.encodeFunctionData("deposit", [token, amount]);
    const depositResult = await sendEvmTransaction({ walletId, chainId, to: vaultAddress, data: depositData, value: "0x0" });
    txs.push({ type: "deposit", hash: depositResult.data.hash });
  } else {
    const { vaultIface } = await import("./vaultClient.js");
    const depositData = vaultIface.encodeFunctionData("depositNative", []);
    const depositResult = await sendEvmTransaction({ walletId, chainId, to: vaultAddress, data: depositData, value: amount });
    txs.push({ type: "depositNative", hash: depositResult.data.hash });
  }

  return { user: agentAddress, txs };
}
