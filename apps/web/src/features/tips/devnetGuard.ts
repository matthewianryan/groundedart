export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export type GenesisHashProvider = {
  getGenesisHash: () => Promise<string>;
};

export async function validateDevnet(provider: GenesisHashProvider): Promise<
  | { ok: true }
  | {
      ok: false;
      genesisHash: string;
    }
> {
  const genesisHash = await provider.getGenesisHash();
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    return { ok: false, genesisHash };
  }
  return { ok: true };
}

