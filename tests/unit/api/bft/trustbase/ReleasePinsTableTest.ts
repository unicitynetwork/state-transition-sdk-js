import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { RELEASE_PINS, VerifiedReleasePin } from '../../../../../src/api/bft/trustbase/ReleasePin.js';
import { UnknownNetworkError } from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseSession } from '../../../../../src/api/bft/trustbase/TrustBaseSession.js';
import { MemoryTrustBaseStore } from '../../../../../src/api/bft/trustbase/TrustBaseStore.js';
import { NetworkId } from '../../../../../src/api/NetworkId.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

interface IManifestNetwork {
  bundle: string;
  bundleSha256: string;
  genesisEntryId: string;
  genesisEpoch: string;
  name: string;
  networkId: number;
  pinnedEntryId: string;
  pinnedEpoch: string;
}

const ROOT = resolve(__dirname, '../../../../..');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'release-pins/manifest.json'), 'utf8')) as {
  networks: IManifestNetwork[];
  source: { commit: string; pullRequest: number; repository: string };
  version: number;
};

describe('the release table (mainnet and testnet2)', () => {
  it('has exactly the networks of the manifest: mainnet 1 and testnet2 4, in that order, and no row for network 2', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.networks.map((n) => [n.name, n.networkId])).toEqual([
      ['mainnet', 1],
      ['testnet2', 4],
    ]);
    expect(RELEASE_PINS.map((pin) => pin.networkId.id)).toEqual([1, 4]);
    expect(RELEASE_PINS.some((pin) => pin.networkId.id === 2)).toBe(false);
  });

  it.each(manifest.networks.map((n) => [n.name, n] as const))(
    '%s: the row is the manifest and the committed bundle file, byte for byte',
    (_name, entry) => {
      const file = new Uint8Array(readFileSync(resolve(ROOT, 'release-pins', entry.bundle)));
      const pin = RELEASE_PINS.find((row) => row.networkId.id === entry.networkId);
      expect(pin).toBeDefined();
      expect(HexConverter.encode(pin?.embeddedBundle ?? new Uint8Array())).toBe(HexConverter.encode(file));
      expect(createHash('sha256').update(file).digest('hex')).toBe(entry.bundleSha256);
      expect(HexConverter.encode(pin?.bundleSha256 ?? new Uint8Array())).toBe(entry.bundleSha256);
      expect(HexConverter.encode(pin?.genesisEntryId ?? new Uint8Array())).toBe(entry.genesisEntryId);
      expect(HexConverter.encode(pin?.pinnedEntryId ?? new Uint8Array())).toBe(entry.pinnedEntryId);
      expect(pin?.genesisEpoch.toString()).toBe(entry.genesisEpoch);
      expect(pin?.pinnedEpoch.toString()).toBe(entry.pinnedEpoch);
    },
  );

  it('names its source, which is a full commit of unicity-ids#11', () => {
    expect(manifest.source).toEqual({
      commit: '513dc4fcf01ee802a97d59a5bc4e50ba64786d45',
      pullRequest: 11,
      repository: 'unicitynetwork/unicity-ids',
    });
  });

  it.each(RELEASE_PINS.map((pin) => [pin.networkId.id, pin] as const))(
    'network %s: the embedded history verifies strictly and opens as a public session',
    async (_id, pin) => {
      await expect(VerifiedReleasePin.verify(pin)).resolves.toBeDefined();
      const { session } = await TrustBaseSession.openPublic(pin.networkId, new MemoryTrustBaseStore());
      expect(session.tip?.epoch).toBe(pin.pinnedEpoch);
    },
  );

  it('refuses a network without a row, and the network of the old testnet 2 is one of them', async () => {
    await expect(TrustBaseSession.openPublic(NetworkId.fromId(2), new MemoryTrustBaseStore())).rejects.toBeInstanceOf(
      UnknownNetworkError,
    );
    await expect(TrustBaseSession.openPublic(NetworkId.LOCAL, new MemoryTrustBaseStore())).rejects.toBeInstanceOf(
      UnknownNetworkError,
    );
  });

  it('the two rows are of different histories', () => {
    expect(HexConverter.encode(RELEASE_PINS[0].genesisEntryId)).not.toBe(
      HexConverter.encode(RELEASE_PINS[1].genesisEntryId),
    );
  });
});
