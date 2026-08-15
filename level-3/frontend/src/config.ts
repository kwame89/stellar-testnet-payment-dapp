import { Networks } from "@stellar/stellar-sdk";

function requireEnv(name: string): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in your deployed contract IDs.`
    );
  }
  return value;
}

export const FACTORY_CONTRACT_ID = requireEnv("VITE_FACTORY_CONTRACT_ID");
export const REWARDS_CONTRACT_ID = requireEnv("VITE_REWARDS_CONTRACT_ID");

export const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const EVENT_POLL_INTERVAL_MS = 5000;
export const EVENT_LOOKBACK_LEDGERS = 17280; // ~1 day at ~5s/ledger
