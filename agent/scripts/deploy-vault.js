import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Interface } from "ethers";
import { sendEvmTransaction } from "../src/privyWallet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { abi, bytecode } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../contract/BridgeVault.compiled.json"), "utf8")
);

const iface = new Interface(abi);
const constructorArgs = iface.encodeDeploy([process.env.AGENT_WALLET_ADDRESS]);
const deployData = bytecode + constructorArgs.slice(2); // strip redundant 0x

const chainId = Number(process.argv[2] || 1); // default: Ethereum mainnet

const result = await sendEvmTransaction({
  walletId: process.env.AGENT_WALLET_ID,
  chainId,
  to: null,
  data: deployData,
  value: "0x0",
});

console.log("Deploy tx submitted:", JSON.stringify(result, null, 2));
