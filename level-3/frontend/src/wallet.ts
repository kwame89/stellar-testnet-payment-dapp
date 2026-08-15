import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { RabetModule } from "@creit.tech/stellar-wallets-kit/modules/rabet";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { HanaModule } from "@creit.tech/stellar-wallets-kit/modules/hana";
import { NETWORK_PASSPHRASE } from "./config";

StellarWalletsKit.init({
  modules: [
    new FreighterModule(),
    new AlbedoModule(),
    new RabetModule(),
    new LobstrModule(),
    new HanaModule(),
  ],
  network: NETWORK_PASSPHRASE,
});

export async function connectWallet(): Promise<string> {
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

export async function getConnectedAddress(): Promise<string | null> {
  try {
    const { address } = await StellarWalletsKit.getAddress();
    return address || null;
  } catch {
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  await StellarWalletsKit.disconnect();
}

export const signTransaction = StellarWalletsKit.signTransaction;
