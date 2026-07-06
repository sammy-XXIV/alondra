import "dotenv/config";

const auth = Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString("base64");

// Backstop cap on native SOL transfers: 2 SOL (~$1500-2000 buffer depending on
// price). The precise $1000-any-token cap is enforced in app code using live
// USD prices before a tx is ever built, same as the EVM wallet.
const MAX_LAMPORTS = "2000000000"; // 2 SOL

const res = await fetch("https://api.privy.io/v1/policies", {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "privy-app-id": process.env.PRIVY_APP_ID,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    version: "1.0",
    name: "Guardian Vault Solana native value cap",
    chain_type: "solana",
    rules: [
      {
        name: "Allow under cap",
        method: "signAndSendTransaction",
        action: "ALLOW",
        conditions: [
          {
            field_source: "solana_system_program_instruction",
            field: "Transfer.lamports",
            operator: "lte",
            value: MAX_LAMPORTS,
          },
        ],
      },
      {
        name: "Deny over cap",
        method: "signAndSendTransaction",
        action: "DENY",
        conditions: [
          {
            field_source: "solana_system_program_instruction",
            field: "Transfer.lamports",
            operator: "gt",
            value: MAX_LAMPORTS,
          },
        ],
      },
    ],
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));
