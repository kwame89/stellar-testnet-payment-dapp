import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { RabetModule } from "@creit.tech/stellar-wallets-kit/modules/rabet";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { HanaModule } from "@creit.tech/stellar-wallets-kit/modules/hana";
import { isConnected as freighterIsConnected } from "@stellar/freighter-api";
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

// The kit's own "is this wallet installed" check races each module's
// isAvailable() against a hard 1-second timeout every time the Connect
// modal opens (see @creit.tech/stellar-wallets-kit's refreshSupportedWallets) —
// on a cold click, Freighter's first response to the extension-messaging
// bridge can take longer than that, so an actually-installed wallet gets
// wrongly shown as "not installed" with an Install link instead of
// connecting. Firing a throwaway isConnected() call as soon as this module
// loads gets that first, slow round-trip out of the way before the user
// ever opens the modal, so the kit's own check is answered fast.
freighterIsConnected().catch(() => {
  // Ignore — this is purely a warm-up ping, not a real check.
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
