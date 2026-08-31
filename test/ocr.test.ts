import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStatsText, totalStats } from "../src/ocr.js";

describe("parseStatsText", () => {
  it("extracts NBA 2K player rows with teammate grades and stat columns", () => {
    const text = `
PLAYER            GRD PTS REB AST STL BLK FLS TO FGM FGA 3PM 3PA
JT5_Era           A+  42  3   14  2   0   1   4  16  24  8   13
UNC Splash        A   28  5   7   1   1   2   2  10  15  6   9
Big Boardz        B+  12  18  3   0   4   3   1  5   7   0   0
`;

    const parsed = parseStatsText(text, 92);

    assert.equal(parsed.playerLines.length, 3);
    assert.deepEqual(parsed.playerLines[0], {
      playerName: "JT5_Era",
      teammateGrade: "A+",
      points: 42,
      rebounds: 3,
      assists: 14,
      steals: 2,
      blocks: 0,
      turnovers: 4
    });
  });

  it("handles stat rows without foul columns", () => {
    const parsed = parseStatsText("Point Guard 31 2 12 3 0 5\nCenter 10 21 4 1 5 2");

    assert.equal(parsed.playerLines.length, 2);
    assert.equal(parsed.playerLines[0]?.turnovers, 5);
    assert.equal(parsed.playerLines[1]?.blocks, 5);
  });

  it("totals parsed player lines", () => {
    const parsed = parseStatsText("Guard A 25 1 10 2 0 2\nLock B+ 15 4 2 3 1 1");
    const totals = totalStats(parsed.playerLines);

    assert.equal(totals.points, 40);
    assert.equal(totals.rebounds, 5);
    assert.equal(totals.assists, 12);
    assert.equal(totals.steals, 5);
    assert.equal(totals.blocks, 1);
    assert.equal(totals.turnovers, 3);
  });

  it("handles highlighted-row OCR artifacts from NBA 2K screenshots", () => {
    const parsed = parseStatsText(". @ 0GSoortsGamer A [J] 17 1 0 7 1 2 01 0 00 4");

    assert.equal(parsed.playerLines.length, 1);
    assert.equal(parsed.playerLines[0]?.points, 0);
    assert.equal(parsed.playerLines[0]?.rebounds, 17);
    assert.equal(parsed.playerLines[0]?.assists, 1);
    assert.equal(parsed.playerLines[0]?.blocks, 7);
    assert.equal(parsed.playerLines[0]?.turnovers, 2);
  });
});
