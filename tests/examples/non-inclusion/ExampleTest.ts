import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TrustBaseHistory } from '../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { UnicityCertificateVerifier } from '../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { NonInclusionProof } from '../../../src/api/NonInclusionProof.js';
import { verifyNonInclusion } from '../../../src/api/NonInclusionVerification.js';
import { StateId } from '../../../src/api/StateId.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { loadAuthorityHistory } from '../../utils/TrustBaseHistoryFixture.js';

const ROOT = join(process.cwd(), 'tests/fixtures/non-inclusion/v2');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

/**
 * The policy example of the API reference (unicity-token-protocol-spec.md, 12.4), run after verification with a checkpoint obtained independently of the proof and of
 * the server response. Absence holds at the returned snapshot only.
 */
describe('non-inclusion example (API reference)', () => {
  const golden = JSON.parse(read('cases/historical-snapshot-absent.json')) as { query: string; wrapper: string };
  let trustedContext: { trustBase: TrustBaseHistory; unicityCertificateVerifier: UnicityCertificateVerifier };
  beforeAll(async () => {
    trustedContext = {
      trustBase: await loadAuthorityHistory(join(ROOT, 'authority/trust-base.json')),
      unicityCertificateVerifier: new UnicityCertificateVerifier(
        new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
      ),
    };
  });
  const proof = NonInclusionProof.decode(
    StateId.fromCBOR(CborSerializer.encodeByteString(HexConverter.decode(golden.query))),
    HexConverter.decode(golden.wrapper),
  );

  async function check(checkpoint: { networkId: number; requiredRootRound: bigint }): Promise<void> {
    const r = await verifyNonInclusion(proof, trustedContext);
    if (r.verdict !== 'absent_at_snapshot') throw new Error('No verified absence');
    if (r.snapshot.networkId !== checkpoint.networkId || r.snapshot.rootRound < checkpoint.requiredRootRound) {
      throw new Error('Snapshot does not meet application policy');
    }
    // Absence at r.snapshot only; any spend/finality decision needs its own policy.
  }

  it('accepts a snapshot that meets the application policy', async () => {
    await expect(check({ networkId: 2, requiredRootRound: 16n })).resolves.toBeUndefined();
  });

  it('refuses a snapshot older than the requirement, and a snapshot of another network', async () => {
    await expect(check({ networkId: 2, requiredRootRound: 17n })).rejects.toThrow('does not meet application policy');
    await expect(check({ networkId: 1, requiredRootRound: 1n })).rejects.toThrow('does not meet application policy');
  });
});
