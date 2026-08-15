import { Client, type AssembledTransaction } from "@stellar/stellar-sdk/contract";
import { FACTORY_CONTRACT_ID, REWARDS_CONTRACT_ID, NETWORK_PASSPHRASE, SOROBAN_RPC_URL } from "./config";
import { getConnectedAddress, signTransaction } from "./wallet";

// Generic contract.Client, typed per-contract via these method interfaces —
// there are no generated TS bindings for these contracts (that would need
// each contract's XDR spec exported from the deployed instance and run
// through a codegen step we don't have wired up), so the method shapes
// below are kept in sync with the Rust #[contractimpl] blocks by hand.

export interface FactoryMethods {
  create_poll(args: {
    creator: string;
    question: string;
    options: string[];
    rewards_contract: string;
  }): Promise<AssembledTransaction<string>>;
  list_polls(): Promise<AssembledTransaction<string[]>>;
}

export interface PollMethods {
  vote(args: { voter: string; option_index: number }): Promise<AssembledTransaction<number>>;
  get_question(): Promise<AssembledTransaction<string>>;
  get_options(): Promise<AssembledTransaction<string[]>>;
  get_results(): Promise<AssembledTransaction<number[]>>;
  has_voted(args: { voter: string }): Promise<AssembledTransaction<boolean>>;
}

export interface RewardsMethods {
  get_points(args: { voter: string }): Promise<AssembledTransaction<number>>;
}

type FactoryClient = Client & FactoryMethods;
type PollClient = Client & PollMethods;
type RewardsClient = Client & RewardsMethods;

const readOnlyClients = new Map<string, Promise<Client>>();
const writeClients = new Map<string, Promise<Client>>();

async function baseOptions(withSigner: boolean) {
  const address = withSigner ? await getConnectedAddress() : null;
  return {
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: SOROBAN_RPC_URL,
    ...(address ? { publicKey: address, signTransaction } : {}),
  };
}

async function getReadOnlyClient(contractId: string): Promise<Client> {
  if (!readOnlyClients.has(contractId)) {
    readOnlyClients.set(
      contractId,
      Client.from({ contractId, ...(await baseOptions(false)) })
    );
  }
  return readOnlyClients.get(contractId)!;
}

/** Not cached across wallet changes — always rebuilt so it picks up
 * whichever address is currently connected. */
async function getWriteClient(contractId: string): Promise<Client> {
  const client = Client.from({ contractId, ...(await baseOptions(true)) });
  writeClients.set(contractId, client);
  return client;
}

export async function factoryRead(): Promise<FactoryClient> {
  return (await getReadOnlyClient(FACTORY_CONTRACT_ID)) as FactoryClient;
}

export async function factoryWrite(): Promise<FactoryClient> {
  return (await getWriteClient(FACTORY_CONTRACT_ID)) as FactoryClient;
}

export async function pollRead(pollAddress: string): Promise<PollClient> {
  return (await getReadOnlyClient(pollAddress)) as PollClient;
}

export async function pollWrite(pollAddress: string): Promise<PollClient> {
  return (await getWriteClient(pollAddress)) as PollClient;
}

export async function rewardsRead(): Promise<RewardsClient> {
  return (await getReadOnlyClient(REWARDS_CONTRACT_ID)) as RewardsClient;
}
