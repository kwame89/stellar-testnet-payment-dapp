import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { SOROBAN_RPC_URL, EVENT_LOOKBACK_LEDGERS } from "./config";

const server = new rpc.Server(SOROBAN_RPC_URL);

export interface ActivityEvent {
  kind: "poll_created" | "vote_cast" | "unknown";
  contractId: string;
  topics: unknown[];
  value: unknown;
  closedAt: string;
}

let cursor: string | null = null;

// The #[contractevent] macro's default topic is the struct name in
// snake_case (see poll/lib.rs's VoteCast, factory/lib.rs's PollCreated) —
// matched case-insensitively against a couple of plausible forms so a
// wire-format detail doesn't silently break the activity feed.
function classify(firstTopic: unknown): ActivityEvent["kind"] {
  const s = String(firstTopic ?? "").toLowerCase();
  if (s.includes("poll") && s.includes("creat")) return "poll_created";
  if (s.includes("vote")) return "vote_cast";
  return "unknown";
}

/** Polls Soroban RPC's getEvents for the given contract IDs since the last
 * call, returning any new events found. Safe to call on an interval — never
 * throws, since a transient RPC hiccup shouldn't take down the poll loop. */
export async function pollNewEvents(contractIds: string[]): Promise<ActivityEvent[]> {
  if (contractIds.length === 0) return [];

  try {
    const request = cursor
      ? { filters: [{ type: "contract" as const, contractIds }], cursor, limit: 50 }
      : {
          filters: [{ type: "contract" as const, contractIds }],
          startLedger: Math.max(1, (await server.getLatestLedger()).sequence - EVENT_LOOKBACK_LEDGERS),
          limit: 50,
        };

    const response = await server.getEvents(request);
    cursor = response.cursor;

    return response.events.map((event) => {
      const topics = event.topic.map((t) => scValToNative(t));
      return {
        kind: classify(topics[0]),
        contractId: event.contractId?.toString() ?? "",
        topics,
        value: scValToNative(event.value),
        closedAt: event.ledgerClosedAt,
      };
    });
  } catch (err) {
    console.warn("pollNewEvents failed (will retry)", err);
    return [];
  }
}

export function resetEventCursor(): void {
  cursor = null;
}
