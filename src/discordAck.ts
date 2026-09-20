import { webcrypto } from "node:crypto";

export const DISCORD_PING = 1;
export const DISCORD_APPLICATION_COMMAND = 2;
export const DISCORD_AUTOCOMPLETE = 4;
export const DISCORD_PONG = 1;
export const DISCORD_DEFERRED_CHANNEL_MESSAGE = 5;
export const DISCORD_AUTOCOMPLETE_RESULT = 8;
export const EPHEMERAL_FLAG = 64;

export function deferredEphemeralResponse(): { type: number; data: { flags: number } } {
  return {
    type: DISCORD_DEFERRED_CHANNEL_MESSAGE,
    data: { flags: EPHEMERAL_FLAG }
  };
}

export async function acknowledgeCommand(interactionId: string, interactionToken: string): Promise<boolean> {
  const response = await fetch(`https://discord.com/api/v10/interactions/${interactionId}/${interactionToken}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deferredEphemeralResponse())
  });

  if (!response.ok && response.status !== 400) {
    const body = await response.text().catch(() => "");
    console.warn(`Immediate interaction ACK failed (${response.status}): ${body}`);
    return false;
  }

  return true;
}

export async function verifyDiscordSignature(publicKeyHex: string, signatureHex: string, timestamp: string, body: string): Promise<boolean> {
  try {
    const key = await webcrypto.subtle.importKey("raw", Buffer.from(publicKeyHex, "hex"), { name: "Ed25519" }, false, ["verify"]);
    return webcrypto.subtle.verify("Ed25519", key, Buffer.from(signatureHex, "hex"), Buffer.from(`${timestamp}${body}`));
  } catch (error) {
    console.warn("Discord signature verification failed:", error);
    return false;
  }
}

