import { describe, expect, it } from "vitest";
import { pluralizePoints, pluralizeVotes, truncateAddress, votePercentages } from "../src/format";

describe("truncateAddress", () => {
  it("truncates a long Stellar address to head…tail", () => {
    expect(truncateAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ234567")).toBe("GABCDE…234567");
  });

  it("leaves short strings untouched", () => {
    expect(truncateAddress("short")).toBe("short");
  });
});

describe("votePercentages", () => {
  it("computes rounded percentages that reflect the vote split", () => {
    expect(votePercentages([1, 1, 2])).toEqual([25, 25, 50]);
  });

  it("returns all zeros when there are no votes yet, without dividing by zero", () => {
    expect(votePercentages([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("handles a single option with all the votes", () => {
    expect(votePercentages([5])).toEqual([100]);
  });
});

describe("pluralizeVotes", () => {
  it("uses singular for exactly one", () => {
    expect(pluralizeVotes(1)).toBe("1 vote");
  });

  it("uses plural for zero and for more than one", () => {
    expect(pluralizeVotes(0)).toBe("0 votes");
    expect(pluralizeVotes(3)).toBe("3 votes");
  });
});

describe("pluralizePoints", () => {
  it("uses singular for exactly one", () => {
    expect(pluralizePoints(1)).toBe("1 point");
  });

  it("uses plural otherwise", () => {
    expect(pluralizePoints(0)).toBe("0 points");
    expect(pluralizePoints(2)).toBe("2 points");
  });
});
