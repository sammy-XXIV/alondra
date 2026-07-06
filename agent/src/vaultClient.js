import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Interface, JsonRpcProvider, Contract } from "ethers";
import { CHAINS } from "./walletTokens.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { abi } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../contract/BridgeVault.compiled.json"), "utf8")
);

export const vaultIface = new Interface(abi);

export function vaultAddressForChain(chainId) {
  const addr = process.env[`BRIDGE_VAULT_ADDRESS_${chainId}`];
  if (!addr) throw new Error(`No BridgeVault deployed on chain ${chainId} (set BRIDGE_VAULT_ADDRESS_${chainId})`);
  return addr;
}

export function encodeDeposit(token, amount) {
  return vaultIface.encodeFunctionData("deposit", [token, amount]);
}

export function encodeDepositNative() {
  return vaultIface.encodeFunctionData("depositNative", []);
}

export function encodeExecuteBridge({ user, token, amount, approvalTarget, callTarget, callData, bridgeValue, gasReimbursement, bridgeName }) {
  return vaultIface.encodeFunctionData("executeBridge", [
    user,
    token,
    amount,
    approvalTarget,
    callTarget,
    callData,
    bridgeValue,
    gasReimbursement,
    bridgeName,
  ]);
}

export function encodeErc20Approve(spender, amount) {
  const erc20Iface = new Interface(["function approve(address spender, uint256 amount) returns (bool)"]);
  return erc20Iface.encodeFunctionData("approve", [spender, amount]);
}
