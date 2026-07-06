import solc from "solc";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "contracts/BridgeVault.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: { "BridgeVault.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const fatal = output.errors.filter((e) => e.severity === "error");
  output.errors.forEach((e) => console.log(e.formattedMessage));
  if (fatal.length) process.exit(1);
}

const contract = output.contracts["BridgeVault.sol"]["BridgeVault"];
fs.writeFileSync(
  path.join(__dirname, "BridgeVault.compiled.json"),
  JSON.stringify({ abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object }, null, 2)
);
console.log("Compiled OK. Bytecode length:", contract.evm.bytecode.object.length / 2, "bytes");
