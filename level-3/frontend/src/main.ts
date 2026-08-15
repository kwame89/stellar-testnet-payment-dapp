import "./style.css";
import { connectWallet, disconnectWallet, getConnectedAddress } from "./wallet";
import { factoryRead, factoryWrite, pollRead, pollWrite, rewardsRead } from "./contracts";
import { classifyContractError } from "./errors";
import { pluralizePoints, pluralizeVotes, truncateAddress, votePercentages } from "./format";
import { pollNewEvents } from "./events";
import { EVENT_POLL_INTERVAL_MS, FACTORY_CONTRACT_ID, REWARDS_CONTRACT_ID } from "./config";

// ---------------------------------------------------------------------------
// Element lookups
// ---------------------------------------------------------------------------

function req<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el as T;
}

const els = {
  connectBtn: req<HTMLButtonElement>("connect-btn"),
  disconnectBtn: req<HTMLButtonElement>("disconnect-btn"),
  walletDisconnected: req<HTMLDivElement>("wallet-disconnected"),
  walletConnected: req<HTMLDivElement>("wallet-connected"),
  walletAddress: req<HTMLParagraphElement>("wallet-address"),
  walletPoints: req<HTMLParagraphElement>("wallet-points"),
  walletNote: req<HTMLParagraphElement>("wallet-note"),

  createPollForm: req<HTMLFormElement>("create-poll-form"),
  newQuestion: req<HTMLInputElement>("new-question"),
  newOptions: req<HTMLDivElement>("new-options"),
  addOptionBtn: req<HTMLButtonElement>("add-option-btn"),
  createPollBtn: req<HTMLButtonElement>("create-poll-btn"),
  createPollNote: req<HTMLParagraphElement>("create-poll-note"),

  statusIdle: req<HTMLDivElement>("status-idle"),
  statusPending: req<HTMLDivElement>("status-pending"),
  statusSuccess: req<HTMLDivElement>("status-success"),
  statusError: req<HTMLDivElement>("status-error"),
  successHash: req<HTMLParagraphElement>("success-hash"),
  successLink: req<HTMLAnchorElement>("success-link"),
  errorMessage: req<HTMLParagraphElement>("error-message"),

  pollsLoading: req<HTMLDivElement>("polls-loading"),
  pollsEmpty: req<HTMLDivElement>("polls-empty"),
  pollsList: req<HTMLDivElement>("polls-list"),

  activityEmpty: req<HTMLParagraphElement>("activity-empty"),
  activityFeed: req<HTMLUListElement>("activity-feed"),
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let connectedAddress: string | null = null;
let knownPollAddresses: string[] = [];

// ---------------------------------------------------------------------------
// Status box
// ---------------------------------------------------------------------------

function showStatus(state: "idle" | "pending" | "success" | "error", data: { hash?: string; message?: string } = {}) {
  els.statusIdle.classList.add("hidden");
  els.statusPending.classList.add("hidden");
  els.statusSuccess.classList.add("hidden");
  els.statusError.classList.add("hidden");

  if (state === "idle") {
    els.statusIdle.classList.remove("hidden");
  } else if (state === "pending") {
    els.statusPending.classList.remove("hidden");
  } else if (state === "success") {
    els.successHash.textContent = data.hash ?? "—";
    els.successLink.href = `https://stellar.expert/explorer/testnet/tx/${data.hash}`;
    els.statusSuccess.classList.remove("hidden");
  } else {
    els.errorMessage.innerHTML = data.message ?? "Unknown error.";
    els.statusError.classList.remove("hidden");
  }
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

function setWalletNote(message: string) {
  if (!message) {
    els.walletNote.classList.add("hidden");
    els.walletNote.textContent = "";
    return;
  }
  els.walletNote.textContent = message;
  els.walletNote.classList.remove("hidden");
}

async function refreshWalletPoints() {
  if (!connectedAddress) {
    els.walletPoints.textContent = "";
    return;
  }
  try {
    const rewards = await rewardsRead();
    const tx = await rewards.get_points({ voter: connectedAddress });
    els.walletPoints.textContent = `Reward points: ${pluralizePoints(Number(tx.result))}`;
  } catch (err) {
    console.warn("refreshWalletPoints failed", err);
  }
}

function setWalletConnectedUI(address: string) {
  connectedAddress = address;
  setWalletNote("");
  els.walletDisconnected.classList.add("hidden");
  els.walletConnected.classList.remove("hidden");
  els.walletAddress.textContent = `${address} (${truncateAddress(address)})`;
}

function setWalletDisconnectedUI() {
  connectedAddress = null;
  els.walletDisconnected.classList.remove("hidden");
  els.walletConnected.classList.add("hidden");
  els.walletAddress.textContent = "—";
  els.walletPoints.textContent = "";
}

async function handleConnect() {
  try {
    const address = await connectWallet();
    setWalletConnectedUI(address);
    await Promise.all([refreshWalletPoints(), renderPolls()]);
  } catch (err) {
    const message = String((err as { message?: unknown })?.message ?? err ?? "");
    if (/closed|cancel/i.test(message)) return; // user dismissed the wallet picker
    console.error("connectWallet failed", err);
    setWalletNote(`Could not connect a wallet: ${message}. Make sure the extension is installed and unlocked.`);
  }
}

async function handleDisconnect() {
  await disconnectWallet();
  setWalletDisconnectedUI();
  showStatus("idle");
  await renderPolls();
}

// ---------------------------------------------------------------------------
// Create poll form
// ---------------------------------------------------------------------------

function addOptionInput(value = "") {
  const row = document.createElement("div");
  row.className = "option-row";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = `Option ${els.newOptions.children.length + 1}`;
  input.maxLength = 80;
  input.value = value;
  input.required = true;
  input.className = "option-input";

  row.appendChild(input);

  if (els.newOptions.children.length >= 2) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-secondary option-remove";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => row.remove());
    row.appendChild(removeBtn);
  }

  els.newOptions.appendChild(row);
}

function setCreatePollNote(message: string) {
  if (!message) {
    els.createPollNote.classList.add("hidden");
    els.createPollNote.textContent = "";
    return;
  }
  els.createPollNote.textContent = message;
  els.createPollNote.classList.remove("hidden");
}

async function handleCreatePoll(event: SubmitEvent) {
  event.preventDefault();
  if (!connectedAddress) {
    setCreatePollNote("Connect a wallet first.");
    return;
  }

  const question = els.newQuestion.value.trim();
  const options = Array.from(els.newOptions.querySelectorAll<HTMLInputElement>(".option-input"))
    .map((input) => input.value.trim())
    .filter(Boolean);

  if (options.length < 2) {
    setCreatePollNote("Add at least two options.");
    return;
  }

  setCreatePollNote("");
  els.createPollBtn.disabled = true;
  showStatus("pending");

  try {
    const factory = await factoryWrite();
    const tx = await factory.create_poll({
      creator: connectedAddress,
      question,
      options,
      rewards_contract: REWARDS_CONTRACT_ID,
    });
    const sentTx = await tx.signAndSend();
    const hash = (sentTx as { sendTransactionResponse?: { hash?: string } }).sendTransactionResponse?.hash;

    showStatus("success", { hash });
    els.createPollForm.reset();
    els.newOptions.innerHTML = "";
    addOptionInput();
    addOptionInput();
    await renderPolls();
  } catch (err) {
    console.error("create_poll failed", err);
    showStatus("error", { message: classifyContractError(err, { walletAddress: connectedAddress }) });
  } finally {
    els.createPollBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Polls list
// ---------------------------------------------------------------------------

async function castVote(pollAddress: string, optionIndex: number) {
  if (!connectedAddress) return;
  showStatus("pending");

  try {
    const poll = await pollWrite(pollAddress);
    const tx = await poll.vote({ voter: connectedAddress, option_index: optionIndex });
    const sentTx = await tx.signAndSend();
    const hash = (sentTx as { sendTransactionResponse?: { hash?: string } }).sendTransactionResponse?.hash;

    showStatus("success", { hash });
    await Promise.all([renderPolls(), refreshWalletPoints()]);
  } catch (err) {
    console.error("vote failed", err);
    showStatus("error", { message: classifyContractError(err, { walletAddress: connectedAddress }) });
  }
}

async function renderPollCard(pollAddress: string): Promise<HTMLElement> {
  const card = document.createElement("div");
  card.className = "poll-card";

  try {
    const client = await pollRead(pollAddress);
    const [questionTx, optionsTx, resultsTx] = await Promise.all([
      client.get_question(),
      client.get_options(),
      client.get_results(),
    ]);
    const question = questionTx.result;
    const options = optionsTx.result;
    const counts = resultsTx.result.map(Number);
    const percentages = votePercentages(counts);

    let hasVoted = false;
    if (connectedAddress) {
      const hasVotedTx = await client.has_voted({ voter: connectedAddress });
      hasVoted = hasVotedTx.result;
    }

    const heading = document.createElement("p");
    heading.className = "poll-question";
    heading.textContent = question;
    card.appendChild(heading);

    const idLine = document.createElement("p");
    idLine.className = "muted poll-address";
    idLine.textContent = truncateAddress(pollAddress);
    card.appendChild(idLine);

    options.forEach((label: string, index: number) => {
      const count = counts[index] ?? 0;
      const pct = percentages[index] ?? 0;

      const row = document.createElement("div");
      row.className = "poll-option";

      const top = document.createElement("div");
      top.className = "poll-option-top";
      const labelEl = document.createElement("span");
      labelEl.className = "poll-option-label";
      labelEl.textContent = label;
      const stats = document.createElement("span");
      stats.className = "poll-option-stats";
      stats.textContent = `${pluralizeVotes(count)} · ${pct}%`;
      top.append(labelEl, stats);

      const track = document.createElement("div");
      track.className = "poll-option-bar-track";
      const fill = document.createElement("div");
      fill.className = "poll-option-bar-fill";
      fill.style.width = `${pct}%`;
      track.appendChild(fill);

      row.append(top, track);

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
          btn.addEventListener("click", () => castVote(pollAddress, index));
          row.appendChild(btn);
        }
      }

      card.appendChild(row);
    });

    if (!connectedAddress) {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = "Connect a wallet to vote.";
      card.appendChild(note);
    }
  } catch (err) {
    console.error(`Failed to load poll ${pollAddress}`, err);
    card.innerHTML = `<p class="error-message">Could not load this poll.</p>`;
  }

  return card;
}

async function renderPolls() {
  try {
    const factory = await factoryRead();
    const tx = await factory.list_polls();
    knownPollAddresses = tx.result;

    els.pollsLoading.classList.add("hidden");

    if (knownPollAddresses.length === 0) {
      els.pollsEmpty.classList.remove("hidden");
      els.pollsList.innerHTML = "";
      return;
    }
    els.pollsEmpty.classList.add("hidden");

    // Newest first.
    const ordered = [...knownPollAddresses].reverse();
    const cards = await Promise.all(ordered.map(renderPollCard));
    els.pollsList.innerHTML = "";
    cards.forEach((card) => els.pollsList.appendChild(card));
  } catch (err) {
    console.error("renderPolls failed", err);
    els.pollsLoading.textContent = "Could not load polls from the contract. Check the console for details.";
  }
}

// ---------------------------------------------------------------------------
// Live activity feed
// ---------------------------------------------------------------------------

function addActivityEntry(text: string, closedAt: string) {
  els.activityEmpty.classList.add("hidden");

  const item = document.createElement("li");
  const desc = document.createElement("span");
  desc.textContent = text;
  const time = document.createElement("span");
  time.className = "activity-time";
  time.textContent = new Date(closedAt).toLocaleTimeString();
  item.append(desc, time);
  els.activityFeed.prepend(item);

  while (els.activityFeed.children.length > 20) {
    els.activityFeed.removeChild(els.activityFeed.lastChild as ChildNode);
  }
}

async function pollActivity() {
  const contractIds = [FACTORY_CONTRACT_ID, ...knownPollAddresses];
  const events = await pollNewEvents(contractIds);
  if (events.length === 0) return;

  let sawChange = false;
  for (const event of events) {
    if (event.kind === "poll_created") {
      addActivityEntry("A new poll was created", event.closedAt);
      sawChange = true;
    } else if (event.kind === "vote_cast") {
      const voter = typeof event.topics[1] === "string" ? truncateAddress(event.topics[1]) : "Someone";
      addActivityEntry(`${voter} voted`, event.closedAt);
      sawChange = true;
    }
  }

  if (sawChange) {
    await Promise.all([renderPolls(), refreshWalletPoints()]);
  }
}

function startActivityPolling() {
  pollActivity();
  setInterval(pollActivity, EVENT_POLL_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

els.connectBtn.addEventListener("click", handleConnect);
els.disconnectBtn.addEventListener("click", handleDisconnect);
els.createPollForm.addEventListener("submit", handleCreatePoll);
els.addOptionBtn.addEventListener("click", () => addOptionInput());

(async function init() {
  addOptionInput();
  addOptionInput();

  await renderPolls();
  startActivityPolling();

  const address = await getConnectedAddress();
  if (address) {
    setWalletConnectedUI(address);
    await Promise.all([refreshWalletPoints(), renderPolls()]);
  }
})();
