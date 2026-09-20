import http from "node:http";
import {
  DISCORD_APPLICATION_COMMAND,
  DISCORD_PING,
  DISCORD_PONG,
  deferredEphemeralResponse,
  verifyDiscordSignature
} from "./discordAck.js";

export interface HealthState {
  discordReady: boolean;
  lastError?: string;
  publicKey?: string;
}

export function startHealthServer(
  port = process.env.PORT,
  getState: () => HealthState = () => ({ discordReady: false })
): http.Server | undefined {
  if (!port) {
    return undefined;
  }

  const server = http.createServer((request, response) => {
    void handleRequest(request, response, getState);
  });

  server.listen(Number(port), "0.0.0.0", () => {
    console.log(`Health server listening on 0.0.0.0:${port}`);
  });

  server.on("error", (error) => {
    console.error("Health server failed:", error);
  });

  return server;
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  getState: () => HealthState
): Promise<void> {
  const path = request.url?.split("?")[0] ?? "/";

  if (request.method === "GET" && (path === "/health" || path === "/")) {
    const state = getState();
    const ready = state.discordReady;
    response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: ready ? "ok" : "starting", discordReady: ready, lastError: state.lastError }));
    return;
  }

  if (request.method === "POST" && (path === "/" || path === "/interactions")) {
    const handled = await handleDiscordHttp(request, response, getState);
    if (handled) {
      return;
    }
  }

  response.writeHead(404);
  response.end();
}

async function handleDiscordHttp(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  getState: () => HealthState
): Promise<boolean> {
  const signature = headerValue(request, "x-signature-ed25519");
  const timestamp = headerValue(request, "x-signature-timestamp");
  if (!signature || !timestamp) {
    return false;
  }

  const body = await readBody(request);
  const publicKey = getState().publicKey;
  if (!publicKey) {
    console.warn("Received a Discord HTTP interaction before the application public key was loaded.");
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "public key not ready" }));
    return true;
  }

  const valid = await verifyDiscordSignature(publicKey, signature, timestamp, body);
  if (!valid) {
    console.warn("Rejected Discord HTTP interaction with an invalid signature.");
    response.writeHead(401);
    response.end("invalid request signature");
    return true;
  }

  const payload = JSON.parse(body) as { type?: number; data?: { name?: string } };
  if (payload.type === DISCORD_PING) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ type: DISCORD_PONG }));
    return true;
  }

  if (payload.type === DISCORD_APPLICATION_COMMAND) {
    console.log(`HTTP-acked /${payload.data?.name ?? "unknown"} so Discord does not time out the submit.`);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(deferredEphemeralResponse()));
    return true;
  }

  return false;
}

function headerValue(request: http.IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
