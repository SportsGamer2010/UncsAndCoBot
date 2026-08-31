import Tesseract from "tesseract.js";
import type { ParsedStats, PlayerStatLine } from "./types.js";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

export function isSupportedImage(filename: string, contentType?: string | null): boolean {
  const lowerName = filename.toLowerCase();
  const hasImageExtension = IMAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
  return Boolean(contentType?.startsWith("image/")) || hasImageExtension;
}

export async function downloadImage(url: string, maxBytes: number): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Discord attachment download failed with status ${response.status}.`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`Image is larger than the configured ${Math.round(maxBytes / 1024 / 1024)} MB limit.`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > maxBytes) {
    throw new Error(`Image is larger than the configured ${Math.round(maxBytes / 1024 / 1024)} MB limit.`);
  }

  return body;
}

export async function extractStatsFromImage(image: Buffer, language: string): Promise<ParsedStats> {
  const result = await Tesseract.recognize(image, language, {
    logger: () => undefined
  });

  return parseStatsText(result.data.text, result.data.confidence);
}

export function parseStatsText(rawText: string, confidence?: number): ParsedStats {
  const playerLines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parsePlayerLine)
    .filter((line): line is PlayerStatLine => Boolean(line));

  return {
    playerLines: dedupePlayerLines(playerLines),
    rawText,
    confidence
  };
}

export function totalStats(playerLines: PlayerStatLine[]): PlayerStatLine {
  return playerLines.reduce<PlayerStatLine>(
    (totals, line) => ({
      playerName: "Team Totals",
      points: totals.points + line.points,
      rebounds: totals.rebounds + line.rebounds,
      assists: totals.assists + line.assists,
      steals: totals.steals + line.steals,
      blocks: totals.blocks + line.blocks,
      turnovers: totals.turnovers + line.turnovers
    }),
    {
      playerName: "Team Totals",
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0
    }
  );
}

function parsePlayerLine(line: string): PlayerStatLine | undefined {
  if (looksLikeHeader(line)) {
    return undefined;
  }

  const gradeMatch = line.match(/\b([ABCDF][+-]?)(?=\s|$)/i);
  const statsStart = gradeMatch?.index !== undefined ? gradeMatch.index + gradeMatch[0].length : findFirstStatIndex(line);
  if (statsStart < 0) {
    return undefined;
  }

  const playerName = cleanPlayerName(line.slice(0, statsStart - (gradeMatch?.[0].length ?? 0)));
  if (!playerName || playerName.length < 2) {
    return undefined;
  }

  const statText = normalizeOcrDigits(line.slice(statsStart));
  const numbers = [...statText.matchAll(/-?\d{1,3}/g)].map((match) => Number(match[0]));
  if (numbers.length < 5) {
    return undefined;
  }

  const [points, rebounds, assists, steals, blocks] = numbers;
  const turnovers = inferTurnovers(numbers);
  if (!isSaneStatLine({ points, rebounds, assists, steals, blocks, turnovers })) {
    return undefined;
  }

  return {
    playerName,
    teammateGrade: gradeMatch?.[1]?.toUpperCase(),
    points,
    rebounds,
    assists,
    steals,
    blocks,
    turnovers
  };
}

function looksLikeHeader(line: string): boolean {
  const upper = line.toUpperCase();
  return upper.includes("PTS") && upper.includes("REB") && upper.includes("AST");
}

function findFirstStatIndex(line: string): number {
  const match = line.match(/\s\d{1,3}\s+\d{1,2}\s+\d{1,2}/);
  return match?.index === undefined ? -1 : match.index + 1;
}

function cleanPlayerName(name: string): string {
  return name
    .replace(/[|()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[^A-Za-z0-9_@.-]+/, "")
    .replace(/[^A-Za-z0-9_@ .'-]+$/, "")
    .trim();
}

function normalizeOcrDigits(text: string): string {
  return text
    .replace(/[Oo](?=\d|\s|$)/g, "0")
    .replace(/[Il](?=\d|\s|$)/g, "1")
    .replace(/[Ss](?=\d|\s|$)/g, "5");
}

function inferTurnovers(numbers: number[]): number {
  if (numbers.length >= 7 && numbers[5] <= 8) {
    return numbers[6];
  }

  return numbers[5] ?? 0;
}

function isSaneStatLine(line: Omit<PlayerStatLine, "playerName" | "teammateGrade">): boolean {
  return (
    line.points >= 0 &&
    line.points <= 200 &&
    line.rebounds >= 0 &&
    line.rebounds <= 99 &&
    line.assists >= 0 &&
    line.assists <= 99 &&
    line.steals >= 0 &&
    line.steals <= 30 &&
    line.blocks >= 0 &&
    line.blocks <= 30 &&
    line.turnovers >= 0 &&
    line.turnovers <= 40
  );
}

function dedupePlayerLines(playerLines: PlayerStatLine[]): PlayerStatLine[] {
  const seen = new Set<string>();
  return playerLines.filter((line) => {
    const key = `${line.playerName.toLowerCase()}:${line.points}:${line.rebounds}:${line.assists}:${line.steals}:${line.blocks}:${line.turnovers}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
