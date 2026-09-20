import assert from "node:assert/strict";
import { createServer } from "node:net";
import { describe, it } from "node:test";
import { startHealthServer } from "../src/health.js";

describe("startHealthServer", () => {
  it("fails Railway health checks until Discord is ready", async () => {
    const port = await unusedPort();
    const server = startHealthServer(String(port), () => ({ discordReady: false, lastError: "still logging in" }));
    assert(server);

    try {
      await onceListening(server);
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: "starting", discordReady: false, lastError: "still logging in" });
    } finally {
      await closeServer(server);
    }
  });

  it("passes Railway health checks after Discord is ready", async () => {
    const port = await unusedPort();
    const server = startHealthServer(String(port), () => ({ discordReady: true }));
    assert(server);

    try {
      await onceListening(server);
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok", discordReady: true });
    } finally {
      await closeServer(server);
    }
  });
});

function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (!address || typeof address === "string") {
          reject(new Error("Could not allocate a test port."));
          return;
        }

        resolve(address.port);
      });
    });
    probe.on("error", reject);
  });
}

function onceListening(server: { listening: boolean; once(event: "listening", listener: () => void): void }): Promise<void> {
  if (server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    server.once("listening", resolve);
  });
}

function closeServer(server: { close(callback?: (error?: Error) => void): void }): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
