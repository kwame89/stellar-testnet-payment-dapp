// Stellar Testnet Payment dApp
// No build step: Freighter + Stellar SDK are loaded straight from esm.sh (CDN ES modules).

import freighterApi from "https://esm.sh/@stellar/freighter-api@3?bundle";
import StellarSdk from "https://esm.sh/@stellar/stellar-sdk@13?bundle";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const HorizonServer = StellarSdk.Horizon?.Server ?? StellarSdk.Server;
const server = new HorizonServer(HORIZON_URL);

const els = {
  connectBtn: document.getElementById("connect-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  walletDisconnected: document.getElementById("wallet-disconnected"),
  walletConnected: document.getElementById("wallet-connected"),
  walletAddress: document.getElementById("wallet-address"),

  balanceValue: document.getElementById("balance-value"),
  balanceNote: document.getElementById("balance-note"),
  refreshBalanceBtn: document.getElementById("refresh-balance-btn"),

  sendForm: document.getElementById("send-form"),
  destinationInput: document.getElementById("destination"),
  amountInput: document.getElementById("amount"),
  sendBtn: document.getElementById("send-btn"),

  statusIdle: document.getElementById("status-idle"),
  statusPending: document.getElementById("status-pending"),
  statusSuccess: document.getElementById("status-success"),
  statusError: document.getElementById("status-error"),
  successHash: document.getElementById("success-hash"),
  successLink: document.getElementById("success-link"),
  errorMessage: document.getElementById("error-message"),
};

let connectedAddress = null;

function truncateAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function setWalletConnectedUI(address) {
  connectedAddress = address;
  els.walletDisconnected.classList.add("hidden");
  els.walletConnected.classList.remove("hidden");
  els.walletAddress.textContent = `${address} (${truncateAddress(address)})`;
  els.refreshBalanceBtn.disabled = false;
  els.sendBtn.disabled = false;
}

function setWalletDisconnectedUI() {
  connectedAddress = null;
  els.walletDisconnected.classList.remove("hidden");
  els.walletConnected.classList.add("hidden");
  els.walletAddress.textContent = "—";
  els.refreshBalanceBtn.disabled = true;
  els.sendBtn.disabled = true;
  els.balanceValue.textContent = "—";
  setBalanceNote("");
  showStatus("idle");
}

function setBalanceNote(message) {
  if (!message) {
    els.balanceNote.classList.add("hidden");
    els.balanceNote.textContent = "";
    return;
  }
  els.balanceNote.innerHTML = message;
  els.balanceNote.classList.remove("hidden");
}

function showStatus(state, data = {}) {
  els.statusIdle.classList.add("hidden");
  els.statusPending.classList.add("hidden");
  els.statusSuccess.classList.add("hidden");
  els.statusError.classList.add("hidden");

  if (state === "idle") {
    els.statusIdle.classList.remove("hidden");
  } else if (state === "pending") {
    els.statusPending.classList.remove("hidden");
  } else if (state === "success") {
    els.successHash.textContent = data.hash;
    els.successLink.href = `https://stellar.expert/explorer/testnet/tx/${data.hash}`;
    els.statusSuccess.classList.remove("hidden");
  } else if (state === "error") {
    els.errorMessage.textContent = data.message || "Unknown error.";
    els.statusError.classList.remove("hidden");
  }
}

async function connectWallet() {
  try {
    const connectionCheck = await freighterApi.isConnected();
    if (connectionCheck?.error || !connectionCheck?.isConnected) {
      alert("Freighter extension not found. Please install it and refresh the page.");
      return;
    }

    const accessResult = await freighterApi.requestAccess();
    if (accessResult?.error) {
      alert(`Could not connect to Freighter: ${accessResult.error}`);
      return;
    }
    const address = accessResult.address;

    const networkResult = await freighterApi.getNetwork();
    if (networkResult?.network && networkResult.network !== "TESTNET") {
      alert(
        `Freighter is set to ${networkResult.network}. Please switch Freighter to Testnet and reconnect.`
      );
      return;
    }

    setWalletConnectedUI(address);
    await fetchBalance();
  } catch (err) {
    console.error("connectWallet failed", err);
    alert(`Failed to connect wallet: ${err.message || err}`);
  }
}

function disconnectWallet() {
  // Freighter manages its own site permissions; there is no programmatic
  // "revoke" call. Disconnecting here just resets this app's local session.
  setWalletDisconnectedUI();
}

async function fetchBalance() {
  if (!connectedAddress) return;

  els.balanceValue.textContent = "Loading…";
  setBalanceNote("");

  try {
    const account = await server.loadAccount(connectedAddress);
    const nativeBalance = account.balances.find((b) => b.asset_type === "native");
    const amount = nativeBalance ? Number(nativeBalance.balance) : 0;
    els.balanceValue.textContent = `${amount.toLocaleString(undefined, {
      maximumFractionDigits: 7,
    })} XLM`;
  } catch (err) {
    if (err?.response?.status === 404) {
      els.balanceValue.textContent = "0 XLM";
      setBalanceNote(
        `Account not found on Testnet yet. Fund it with <a href="https://friendbot.stellar.org?addr=${connectedAddress}" target="_blank" rel="noopener noreferrer">Friendbot</a>.`
      );
    } else {
      console.error("fetchBalance failed", err);
      els.balanceValue.textContent = "Error";
      setBalanceNote("Could not fetch balance. Check the console for details.");
    }
  }
}

async function sendPayment(destination, amount) {
  if (!connectedAddress) return;

  if (!StellarSdk.StrKey.isValidEd25519PublicKey(destination)) {
    showStatus("error", { message: "That destination address doesn't look like a valid Stellar public key." });
    return;
  }
  if (!(Number(amount) > 0)) {
    showStatus("error", { message: "Amount must be greater than 0." });
    return;
  }

  showStatus("pending");
  els.sendBtn.disabled = true;

  try {
    const sourceAccount = await server.loadAccount(connectedAddress);

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination,
          asset: StellarSdk.Asset.native(),
          amount: String(amount),
        })
      )
      .setTimeout(180)
      .build();

    const unsignedXdr = transaction.toXDR();

    const signResult = await freighterApi.signTransaction(unsignedXdr, {
      networkPassphrase: NETWORK_PASSPHRASE,
      address: connectedAddress,
    });
    if (signResult?.error) {
      throw new Error(signResult.error);
    }
    const signedXdr = typeof signResult === "string" ? signResult : signResult.signedTxXdr;

    const signedTransaction = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
    const submitResult = await server.submitTransaction(signedTransaction);

    showStatus("success", { hash: submitResult.hash });
    els.sendForm.reset();
    await fetchBalance();
  } catch (err) {
    console.error("sendPayment failed", err);
    const resultCodes = err?.response?.data?.extras?.result_codes;
    const message = resultCodes
      ? `Transaction rejected: ${JSON.stringify(resultCodes)}`
      : err.message || "Transaction failed. Check the console for details.";
    showStatus("error", { message });
  } finally {
    els.sendBtn.disabled = false;
  }
}

els.connectBtn.addEventListener("click", connectWallet);
els.disconnectBtn.addEventListener("click", disconnectWallet);
els.refreshBalanceBtn.addEventListener("click", fetchBalance);
els.sendForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendPayment(els.destinationInput.value.trim(), els.amountInput.value);
});

// Try to restore a session if the site is already authorized in Freighter.
(async function init() {
  try {
    const connectionCheck = await freighterApi.isConnected();
    if (!connectionCheck?.isConnected) return;

    const allowedCheck = await freighterApi.isAllowed();
    if (!allowedCheck?.isAllowed) return;

    const addressResult = await freighterApi.getAddress();
    if (addressResult?.error || !addressResult?.address) return;

    setWalletConnectedUI(addressResult.address);
    await fetchBalance();
  } catch (err) {
    console.warn("Could not auto-restore wallet session", err);
  }
})();
