import { describe, expect, it } from "vitest";
import { classifyContractError } from "../src/errors";

describe("classifyContractError", () => {
  it("recognizes a user-rejected signing request", () => {
    const err = new Error("User declined access");
    expect(classifyContractError(err)).toMatch(/cancelled the signing request/i);
  });

  it("decodes a known Poll contract error code", () => {
    const err = new Error("simulation failed: Error(Contract, #2)");
    expect(classifyContractError(err)).toBe("This wallet address has already voted in this poll.");
  });

  it("decodes a different known error code", () => {
    const err = new Error("simulation failed: Error(Contract, #1)");
    expect(classifyContractError(err)).toBe("That option no longer exists.");
  });

  it("falls back to the raw message for an unmapped contract error code", () => {
    const err = new Error("simulation failed: Error(Contract, #99)");
    expect(classifyContractError(err)).toBe("simulation failed: Error(Contract, #99)");
  });

  it("adds a Friendbot link for an unfunded account, when a wallet address is known", () => {
    const err = new Error("resource missing");
    const result = classifyContractError(err, { walletAddress: "GABC123" });
    expect(result).toContain("friendbot.stellar.org?addr=GABC123");
  });

  it("omits the Friendbot link when no wallet address is known", () => {
    const err = new Error("account not found");
    const result = classifyContractError(err);
    expect(result).not.toContain("friendbot.stellar.org");
    expect(result).toMatch(/isn't funded/i);
  });

  it("recognizes an insufficient balance error", () => {
    const err = new Error("tx failed: insufficient_balance");
    expect(classifyContractError(err)).toMatch(/insufficient xlm balance/i);
  });

  it("falls back to the raw message for anything unrecognized", () => {
    const err = new Error("some unexpected network error");
    expect(classifyContractError(err)).toBe("some unexpected network error");
  });

  it("handles a non-Error thrown value", () => {
    expect(classifyContractError("plain string failure")).toBe("plain string failure");
  });
});
