import { describe, expect, it } from "vitest";
import { DEVNET_GENESIS_HASH, validateDevnet } from "./devnetGuard";

describe("validateDevnet", () => {
  it("accepts devnet genesis hash", async () => {
    const result = await validateDevnet({ getGenesisHash: async () => DEVNET_GENESIS_HASH });
    expect(result.ok).toBe(true);
  });

  it("rejects non-devnet genesis hash", async () => {
    const result = await validateDevnet({ getGenesisHash: async () => "not-devnet" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.genesisHash).toBe("not-devnet");
    }
  });
});

