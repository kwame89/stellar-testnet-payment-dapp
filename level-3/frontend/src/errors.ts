/**
 * Maps a raw error (from a wallet signing flow or a contract call) to a
 * human-readable message. Kept as a pure function of (error, context) —
 * no DOM, no globals — specifically so it's unit-testable without mocking
 * the wallet kit or the Stellar SDK.
 */

export interface PollContractErrorMap {
  [code: number]: string;
}

// Poll contract's #[contracterror] PollError enum (see
// ../../contracts/poll/src/lib.rs) — kept in sync manually since the
// frontend has no generated bindings from the contract's spec.
export const POLL_ERROR_MESSAGES: PollContractErrorMap = {
  1: "That option no longer exists.",
  2: "This wallet address has already voted in this poll.",
};

function isUserRejection(message: string): boolean {
  return /reject|declin|denied|cancel/i.test(message);
}

function extractContractErrorCode(message: string): number | null {
  const match = message.match(/Error\(Contract,\s*#(\d+)\)/);
  return match ? Number(match[1]) : null;
}

export function classifyContractError(
  err: unknown,
  opts: { walletAddress?: string | null; errorMessages?: PollContractErrorMap } = {}
): string {
  const message = String((err as { message?: unknown })?.message ?? err ?? "");
  const errorMessages = opts.errorMessages ?? POLL_ERROR_MESSAGES;

  if (isUserRejection(message)) {
    return "You cancelled the signing request in your wallet — nothing was submitted.";
  }

  const code = extractContractErrorCode(message);
  if (code !== null && errorMessages[code]) {
    return errorMessages[code];
  }

  if (/account.*not.*found|resource missing|not found/i.test(message)) {
    const addr = opts.walletAddress;
    const friendbotLink = addr
      ? ` Fund it with <a href="https://friendbot.stellar.org?addr=${addr}" target="_blank" rel="noopener noreferrer">Friendbot</a>, then try again.`
      : "";
    return `This account isn't funded on Testnet yet.${friendbotLink}`;
  }

  if (/insufficient_balance|insufficient balance/i.test(message)) {
    return "Insufficient XLM balance to cover the network fee for this transaction.";
  }

  return message || "Something went wrong. Check the console for details.";
}
