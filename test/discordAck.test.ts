import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISCORD_DEFERRED_CHANNEL_MESSAGE, EPHEMERAL_FLAG, deferredEphemeralResponse } from "../src/discordAck.js";

describe("deferredEphemeralResponse", () => {
  it("acks a slash command as an ephemeral thinking state", () => {
    assert.deepEqual(deferredEphemeralResponse(), {
      type: DISCORD_DEFERRED_CHANNEL_MESSAGE,
      data: { flags: EPHEMERAL_FLAG }
    });
  });
});
