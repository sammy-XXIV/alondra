import "dotenv/config";

const auth = Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString("base64");

// Backstop cap on native value per tx: 0.5 ETH (~$1500-2000 depending on price,
// a conservative ceiling above the $1000 target). The precise $1000-any-token
// cap is enforced in app code using live USD prices before a tx is ever built.
const MAX_NATIVE_WEI = "500000000000000000"; // 0.5 ETH

const res = await fetch("https://api.privy.io/v1/policies", {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "privy-app-id": process.env.PRIVY_APP_ID,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    version: "1.0",
    name: "Guardian Vault native value cap",
    chain_type: "ethereum",
    rules: [
      {
        name: "Allow under cap",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [
          {
            field_source: "ethereum_transaction",
            field: "value",
            operator: "lte",
            value: MAX_NATIVE_WEI,
          },
        ],
      },
      {
        name: "Deny over cap",
        method: "eth_sendTransaction",
        action: "DENY",
        conditions: [
          {
            field_source: "ethereum_transaction",
            field: "value",
            operator: "gt",
            value: MAX_NATIVE_WEI,
          },
        ],
      },
    ],
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));
