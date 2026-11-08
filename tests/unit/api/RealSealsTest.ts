import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TrustBaseBundle } from '../../../src/api/bft/trustbase/TrustBaseBundle.js';
import { TrustBaseHistory } from '../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { UnicityCertificateVerifier } from '../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { NonInclusionProof } from '../../../src/api/NonInclusionProof.js';
import { verifyNonInclusion } from '../../../src/api/NonInclusionVerification.js';
import { StateId } from '../../../src/api/StateId.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

/**
 * A real seal of each existing network verifies through the V2 bundle that describes its live authority (owner §44/§46). The fixtures are
 * those of sdk-rust (dev2/utb-real-seal, 9e92ae2): per network the unicity-ids genesis as a one-entry bundle, and the answer of the network's
 * public gateway (no key) to `get_non_inclusion_proof.v1` for a random state id, which carries a unicity certificate signed by the live
 * validators. See tests/fixtures/real-seals/README.md.
 */
const DIR = join(process.cwd(), 'tests/fixtures/real-seals');
const LIMITS = { maxBytes: 1 << 20, maxEntries: 16 };

const TESTNET2_ID = '4b49eb2bb0729051b89a48668fd6ef1fda284aad2e10b7d5f23aad4b5faef37f';
const MAINNET_ID = '0b6f8143e19e2a585be3534e8f1062f36c3b9621e506158f10abfbc9a56f4e4c';

const verifier = new UnicityCertificateVerifier(
  new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
);

function read(name: string): string {
  return readFileSync(join(DIR, name), 'utf8').trim();
}

async function historyOf(network: string, entryId: string): Promise<TrustBaseHistory> {
  const bundle = await TrustBaseBundle.decode(
    new Uint8Array(readFileSync(join(DIR, `unicity-trustbase.${network}.cbor`))),
    LIMITS,
  );
  return TrustBaseHistory.fromBundle(bundle, HexConverter.decode(entryId));
}

function proofOf(
  network: string,
  wire: Uint8Array = HexConverter.decode(read(`${network}.non-inclusion.hex`)),
): NonInclusionProof {
  const stateId = StateId.fromCBOR(
    CborSerializer.encodeByteString(HexConverter.decode(read(`${network}.stateid.hex`))),
  );
  return NonInclusionProof.decode(stateId, wire);
}

/** Verify with the shard the gateway answered for pinned, as an application does for a sharded network. */
function verify(proof: NonInclusionProof, history: TrustBaseHistory): ReturnType<typeof verifyNonInclusion> {
  return verifyNonInclusion(
    proof,
    { trustBase: history, unicityCertificateVerifier: verifier },
    { shard: proof.unicityCertificate.shardTreeCertificate.shard },
  );
}

describe('real seals of the existing networks verify through the V2 bundle', () => {
  it.each([
    ['testnet2', TESTNET2_ID, 4],
    ['mainnet', MAINNET_ID, 1],
  ])('%s', async (network, entryId, networkId) => {
    const history = await historyOf(network, entryId);
    expect(history.networkId?.id).toBe(networkId);

    const result = await verify(proofOf(network), history);

    expect(result.verdict).toBe('absent_at_snapshot');
    expect(result.snapshot?.networkId).toBe(networkId);
    expect(result.snapshot?.rootEpoch).toBe(1n);
  });

  describe('controls', () => {
    it('another network’s bundle does not verify the seal', async () => {
      const result = await verify(proofOf('testnet2'), await historyOf('mainnet', MAINNET_ID));
      expect(result.verdict).toBe('authority_rejected');
    });

    it('damaged signatures: none or one damaged (three of four valid) still verifies; three or all four damaged do not reach the quorum', async () => {
      const history = await historyOf('testnet2', TESTNET2_ID);
      const raw = HexConverter.decode(read('testnet2.non-inclusion.hex'));
      const signatures = Array.from(proofOf('testnet2').unicityCertificate.unicitySeal.witnesses?.values() ?? []);
      expect(signatures.length).toBeGreaterThanOrEqual(4);

      const damaged = async (count: number): Promise<string> => {
        const bad = new Uint8Array(raw);
        for (const signature of signatures.slice(0, count)) {
          const at = indexOf(bad, signature);
          expect(at).toBeGreaterThanOrEqual(0);
          bad[at + 10] ^= 1;
        }
        return (await verify(proofOf('testnet2', bad), history)).verdict;
      };

      expect(await damaged(0)).toBe('absent_at_snapshot');
      // three of four valid is the quorum
      expect(await damaged(1)).toBe('absent_at_snapshot');
      expect(await damaged(signatures.length)).toBe('authority_rejected');
      expect(await damaged(signatures.length - 1)).toBe('authority_rejected');
    });
  });
});

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}
