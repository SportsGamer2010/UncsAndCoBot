import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getConfig } from "../src/config.js";

describe("getConfig", () => {
  it("ignores empty optional Railway variables", () => {
    const config = getConfig({
      DISCORD_TOKEN: "test-token",
      DISCORD_GUILD_ID: "",
      MAX_IMAGE_BYTES: "",
      RECORDS_PER_MODE: "",
      PORT: "8080",
      RAILWAY_ENVIRONMENT: "production"
    });

    assert.equal(config.DISCORD_TOKEN, "test-token");
    assert.equal(config.DISCORD_GUILD_ID, undefined);
    assert.equal(config.MAX_IMAGE_BYTES, 12 * 1024 * 1024);
    assert.equal(config.RECORDS_PER_MODE, 10);
  });
});
