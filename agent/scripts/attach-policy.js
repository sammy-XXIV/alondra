import "dotenv/config";

const auth = Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString("base64");

const res = await fetch(`https://api.privy.io/v1/wallets/${process.env.AGENT_WALLET_ID}`, {
  method: "PATCH",
  headers: {
    Authorization: `Basic ${auth}`,
    "privy-app-id": process.env.PRIVY_APP_ID,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ policy_ids: [process.env.SPEND_POLICY_ID] }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));
