// Stellar Live Poll dApp — Level 2 (Yellow Belt)
// No build step: everything is loaded as ES modules straight from esm.sh.

import { StellarWalletsKit } from "https://esm.sh/@creit.tech/stellar-wallets-kit@2.5.0/sdk?bundle";
import { FreighterModule } from "https://esm.sh/@creit.tech/stellar-wallets-kit@2.5.0/modules/freighter?bundle";
import { AlbedoModule } from "https://esm.sh/@creit.tech/stellar-wallets-kit@2.5.0/modules/albedo?bundle";
import { RabetModule } from "https://esm.sh/@creit.tech/stellar-wallets-kit@2.5.0/modules/rabet?bundle";
import { LobstrModule } from "https://esm.sh/@creit.tech/stellar-wallets-kit@2.5.0/modules/lobstr?bundle";
import { HanaModule } from "https://esm.sh/@creit.tech/stellar-wallets-kit@2.5.0/modules/hana?bundle";
import { Networks, scValToNative } from "https://esm.sh/@stellar/stellar-sdk@16?bundle";
import { rpc } from "https://esm.sh/@stellar/stellar-sdk@16?bundle";
import { Client, AssembledTransaction } from "https://esm.sh/@stellar/stellar-sdk@16/contract?bundle";

// esm.sh's ?bundle transform 500s on the kit's aggregate "modules/utils" helper
// (defaultModules()), so the wallet list is built explicitly here instead.
const WALLET_MODULES = [
  new FreighterModule(),
  new AlbedoModule(),
  new RabetModule(),
  new LobstrModule(),
  new HanaModule(),
];

// Deployed on Stellar Testnet — see level-2/README.md for the exact deploy commands.
const CONTRACT_ID = "CDDTAZUW6EHEPNZ7EMGYJAFYXOEA7NCPARB6QVST2Q7NPUMM6S54272R";
const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const EVENT_POLL_INTERVAL_MS = 5000;
const EVENT_LOOKBACK_LEDGERS = 17280; // ~1 day at ~5s/ledger

const server = new rpc.Server(SOROBAN_RPC_URL);

const els = {
  connectBtn: document.getElementById("connect-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  walletDisconnected: document.getElementById("wallet-disconnected"),
  walletConnected: document.getElementById("wallet-connected"),
  walletAddress: document.getElementById("wallet-address"),
  walletNote: document.getElementById("wallet-note"),

  pollQuestion: document.getElementById("poll-question"),
  pollOptions: document.getElementById("poll-options"),
  pollNote: document.getElementById("poll-note"),

  statusIdle: document.getElementById("status-idle"),
  statusPending: document.getElementById("status-pending"),
  statusSuccess: document.getElementById("status-success"),
  statusError: document.getElementById("status-error"),
  successHash: document.getElementById("success-hash"),
  successLink: document.getElementById("success-link"),
  errorMessage: document.getElementById("error-message"),

  activityEmpty: document.getElementById("activity-empty"),
  activityFeed: document.getElementById("activity-feed"),
};

let connectedAddress = null;
let readOnlyClient = null;
let writeClient = null;
let eventsCursor = null;
let pollTimer = null;

function truncateAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function setWalletNote(message) {
  if (!message) {
    els.walletNote.classList.add("hidden");
    els.walletNote.textContent = "";
    return;
  }
  els.walletNote.textContent = message;
  els.walletNote.classList.remove("hidden");
}

function setPollNote(message) {
  if (!message) {
    els.pollNote.classList.add("hidden");
    els.pollNote.textContent = "";
    return;
  }
  els.pollNote.innerHTML = message;
  els.pollNote.classList.remove("hidden");
}

function setWalletConnectedUI(address) {
  connectedAddress = address;
  writeClient = null; // rebuilt lazily with the new signer
  setWalletNote("");
  els.walletDisconnected.classList.add("hidden");
  els.walletConnected.classList.remove("hidden");
  els.walletAddress.textContent = `${address} (${truncateAddress(address)})`;
}

function setWalletDisconnectedUI() {
  connectedAddress = null;
  writeClient = null;
  els.walletDisconnected.classList.remove("hidden");
  els.walletConnected.classList.add("hidden");
  els.walletAddress.textContent = "—";
  showStatus("idle");
  renderPoll();
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
    els.successHash.textContent = data.hash || "—";
    els.successLink.href = `https://stellar.expert/explorer/testnet/tx/${data.hash}`;
    els.statusSuccess.classList.remove("hidden");
  } else if (state === "error") {
    els.errorMessage.textContent = data.message || "Unknown error.";
    els.statusError.classList.remove("hidden");
  }
}

// ---------------------------------------------------------------------------
// Wallet connection (StellarWalletsKit — multi-wallet: Freighter, xBull,
// Albedo, Rabet, Lobstr, Hana, and more, picked from one modal).
// ---------------------------------------------------------------------------

StellarWalletsKit.init({
  modules: WALLET_MODULES,
  network: NETWORK_PASSPHRASE,
});

async function connectWallet() {
  try {
    const { address } = await StellarWalletsKit.authModal();
    setWalletConnectedUI(address);
    await renderPoll();
  } catch (err) {
    console.error("connectWallet failed", err);
    if (err && err.code === -1) {
      // User closed the wallet-selection modal without picking one — not an error worth alarming over.
      return;
    }
    setWalletNote(
      `Could not connect a wallet: ${err?.message || err}. Make sure the extension is installed and unlocked, then try again.`
    );
  }
}

function disconnectWallet() {
  StellarWalletsKit.disconnect();
  setWalletDisconnectedUI();
}

// ---------------------------------------------------------------------------
// Contract clients (read-only for anonymous polling, signer-bound once a
// wallet is connected).
// ---------------------------------------------------------------------------

async function getReadOnlyClient() {
  if (!readOnlyClient) {
    readOnlyClient = await Client.from({
      contractId: CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: SOROBAN_RPC_URL,
    });
  }
  return readOnlyClient;
}

async function getWriteClient() {
  if (!writeClient) {
    writeClient = await Client.from({
      contractId: CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: SOROBAN_RPC_URL,
      publicKey: connectedAddress,
      signTransaction: (xdr, opts) => StellarWalletsKit.signTransaction(xdr, opts),
    });
  }
  return writeClient;
}

// ---------------------------------------------------------------------------
// Poll rendering (reads are simulate-only — no signing required).
// ---------------------------------------------------------------------------

async function renderPoll() {
  try {
    const client = await getReadOnlyClient();
    const [{ result: question }, { result: options }, { result: counts }] = await Promise.all([
      client.get_question(),
      client.get_options(),
      client.get_results(),
    ]);

    let hasVoted = false;
    if (connectedAddress) {
      const { result } = await client.has_voted({ voter: connectedAddress });
      hasVoted = result;
    }

    els.pollQuestion.textContent = question;
    const total = counts.reduce((sum, c) => sum + Number(c), 0);

    els.pollOptions.innerHTML = "";
    options.forEach((label, index) => {
      const count = Number(counts[index] ?? 0);
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;

      const row = document.createElement("div");
      row.className = "poll-option";

      const top = document.createElement("div");
      top.className = "poll-option-top";
      const labelEl = document.createElement("span");
      labelEl.className = "poll-option-label";
      labelEl.textContent = label;
      const stats = document.createElement("span");
      stats.className = "poll-option-stats";
      stats.textContent = `${count} vote${count === 1 ? "" : "s"} · ${pct}%`;
      top.appendChild(labelEl);
      top.appendChild(stats);

      const track = document.createElement("div");
      track.className = "poll-option-bar-track";
      const fill = document.createElement("div");
      fill.className = "poll-option-bar-fill";
      fill.style.width = `${pct}%`;
      track.appendChild(fill);

      row.appendChild(top);
      row.appendChild(track);

      if (connectedAddress) {
        if (hasVoted) {
          const badge = document.createElement("span");
          badge.className = "voted-badge";
          badge.textContent = "You've voted";
          row.appendChild(badge);
        } else {
          const btn = document.createElement("button");
          btn.className = "btn btn-primary vote-btn";
          btn.textContent = `Vote for "${label}"`;
          btn.addEventListener("click", () => castVote(index));
          row.appendChild(btn);
        }
      }

      els.pollOptions.appendChild(row);
    });

    if (!connectedAddress) {
      setPollNote("Connect a wallet above to cast a vote.");
    } else {
      setPollNote("");
    }
  } catch (err) {
    console.error("renderPoll failed", err);
    setPollNote("Could not load the poll from the contract. Check the console for details.");
  }
}

// ---------------------------------------------------------------------------
// Casting a vote (write call: simulate -> sign -> submit -> poll status).
// ---------------------------------------------------------------------------

function classifyVoteError(err) {
  const message = String(err?.message || err || "");

  if (err instanceof AssembledTransaction.Errors.UserRejected || /reject|declin|denied|cancel/i.test(message)) {
    return "You cancelled the signing request in your wallet — no vote was cast.";
  }

  const contractErrorMatch = message.match(/Error\(Contract,\s*#(\d+)\)/);
  if (contractErrorMatch) {
    const code = Number(contractErrorMatch[1]);
    if (code === 4) return "This wallet address has already voted in this poll.";
    if (code === 3) return "That option no longer exists.";
    if (code === 2) return "The poll contract hasn't been initialized yet.";
    if (code === 1) return "The poll has already been initialized.";
  }

  if (/account.*not.*found|resource missing|not found/i.test(message)) {
    return `This account isn't funded on Testnet yet. Fund it with <a href="https://friendbot.stellar.org?addr=${connectedAddress}" target="_blank" rel="noopener noreferrer">Friendbot</a>, then try again.`;
  }

  if (/insufficient_balance|insufficient balance/i.test(message)) {
    return "Insufficient XLM balance to cover the network fee for this transaction.";
  }

  return message || "Vote failed. Check the console for details.";
}

async function castVote(optionIndex) {
  if (!connectedAddress) return;

  showStatus("pending");

  try {
    const client = await getWriteClient();
    const tx = await client.vote({ voter: connectedAddress, option_index: optionIndex });
    const sentTx = await tx.signAndSend();
    const hash = sentTx.sendTransactionResponse?.hash;

    showStatus("success", { hash });
    await renderPoll();
  } catch (err) {
    console.error("castVote failed", err);
    showStatus("error", { message: classifyVoteError(err) });
  }
}

// ---------------------------------------------------------------------------
// Live event feed + state sync — polls Soroban RPC's getEvents for this
// contract and refreshes results whenever a new vote lands.
// ---------------------------------------------------------------------------

function addActivityEntry({ voter, optionLabel, closedAt }) {
  els.activityEmpty.classList.add("hidden");

  const item = document.createElement("li");
  const desc = document.createElement("span");
  desc.textContent = `${truncateAddress(voter)} voted for "${optionLabel}"`;
  const time = document.createElement("span");
  time.className = "activity-time";
  time.textContent = new Date(closedAt).toLocaleTimeString();
  item.appendChild(desc);
  item.appendChild(time);
  els.activityFeed.prepend(item);

  while (els.activityFeed.children.length > 20) {
    els.activityFeed.removeChild(els.activityFeed.lastChild);
  }
}

async function pollEvents() {
  try {
    const client = await getReadOnlyClient();
    const { result: options } = await client.get_options();

    const request = eventsCursor
      ? { filters: [{ type: "contract", contractIds: [CONTRACT_ID] }], cursor: eventsCursor, limit: 20 }
      : {
          filters: [{ type: "contract", contractIds: [CONTRACT_ID] }],
          startLedger: Math.max(1, (await server.getLatestLedger()).sequence - EVENT_LOOKBACK_LEDGERS),
          limit: 20,
        };

    const response = await server.getEvents(request);
    eventsCursor = response.cursor;

    let sawVote = false;
    for (const event of response.events) {
      const topics = event.topic.map((t) => scValToNative(t));
      if (topics[0] !== "vote") continue;
      const voter = topics[1];
      const [optionIndex] = scValToNative(event.value);
      addActivityEntry({
        voter,
        optionLabel: options[optionIndex] ?? `Option ${optionIndex}`,
        closedAt: event.ledgerClosedAt,
      });
      sawVote = true;
    }

    if (sawVote) {
      await renderPoll();
    }
  } catch (err) {
    console.warn("pollEvents failed (will retry)", err);
  }
}

function startEventPolling() {
  pollEvents();
  pollTimer = setInterval(pollEvents, EVENT_POLL_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Wire up + restore a previous session if the site is already authorized.
// ---------------------------------------------------------------------------

els.connectBtn.addEventListener("click", connectWallet);
els.disconnectBtn.addEventListener("click", disconnectWallet);

(async function init() {
  await renderPoll();
  startEventPolling();

  try {
    const { address } = await StellarWalletsKit.getAddress();
    if (address) {
      setWalletConnectedUI(address);
      await renderPoll();
    }
  } catch {
    // No wallet connected yet — normal on first visit.
  }
})();
