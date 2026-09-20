import http from "node:http";

export interface HealthState {
  discordReady: boolean;
  lastError?: string;
}

export function startHealthServer(
  port = process.env.PORT,
  getState: () => HealthState = () => ({ discordReady: false })
): http.Server | undefined {
  if (!port) {
    return undefined;
  }

  const server = http.createServer((request, response) => {
    const path = request.url?.split("?")[0];
    if (request.method === "GET" && (path === "/health" || path === "/")) {
      const state = getState();
      const ready = state.discordReady;
      response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: ready ? "ok" : "starting", discordReady: ready, lastError: state.lastError }));
      return;
    }

    if (request.headers["x-signature-ed25519"] || request.headers["x-signature-timestamp"]) {
      console.warn(`Received a Discord HTTP interaction on ${request.method} ${path}. This bot uses the gateway, so clear any Interactions Endpoint URL in the Discord Developer Portal.`);
    }

    response.writeHead(404);
    response.end();
  });

  server.listen(Number(port), "0.0.0.0", () => {
    console.log(`Health server listening on 0.0.0.0:${port}`);
  });

  server.on("error", (error) => {
    console.error("Health server failed:", error);
  });

  return server;
}
