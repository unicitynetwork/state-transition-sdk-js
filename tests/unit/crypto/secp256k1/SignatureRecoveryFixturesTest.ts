import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RootTrustBase } from '../../../../src/api/bft/RootTrustBase.js';
import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { VerifiedSealCache } from '../../../../src/api/bft/verification/VerifiedSealCache.js';
import { NetworkId } from '../../../../src/api/NetworkId.js';
import { DataHash } from '../../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../../src/crypto/hash/HashAlgorithm.js';
import { Secp256k1SignatureVerifier } from '../../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { Signature } from '../../../../src/crypto/secp256k1/Signature.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';

interface IFixture {
  primitive: {
    messageHashSha256: string;
    publicKeyCompressed: string;
    vectors: { accept: boolean; name: string; signature: string }[];
  };
  recovery: { accept: boolean; digest: string; name: string; publicKeyCompressed: string; signature: string }[];
  seal: {
    cases: { accept: boolean; name: string; sealCbor: string }[];
    epoch: number;
    networkId: number;
    nodes: { id: string; publicKeyCompressed: string; stake: number }[];
    quorumThreshold: number;
  };
}

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/signature-recovery/v1/vectors.json'), 'utf8'),
) as IFixture;

describe('shared O3 signature recovery fixtures', () => {
  const verifier = new Secp256k1SignatureVerifier();

  describe('primitive vectors', () => {
    const hash = new DataHash(HashAlgorithm.SHA256, HexConverter.decode(fixture.primitive.messageHashSha256));
    const publicKey = HexConverter.decode(fixture.primitive.publicKeyCompressed);

    it.each(fixture.primitive.vectors.map((v) => [v.name, v] as const))('%s', async (_name, vector) => {
      let accepted = false;
      try {
        accepted = await verifier.verify(hash, Signature.decode(HexConverter.decode(vector.signature)), publicKey);
      } catch {
        // not a 65-byte signature with v in 0..3: rejected on decoding
      }
      expect(accepted).toBe(vector.accept);
    });
  });

  describe('recovery vectors', () => {
    it.each(fixture.recovery.map((v) => [v.name, v] as const))('%s', async (_name, vector) => {
      let accepted = false;
      try {
        accepted = await verifier.verify(
          new DataHash(HashAlgorithm.SHA256, HexConverter.decode(vector.digest)),
          Signature.decode(HexConverter.decode(vector.signature)),
          HexConverter.decode(vector.publicKeyCompressed),
        );
      } catch {
        // not a decodable signature: rejected
      }
      expect(accepted).toBe(vector.accept);
    });
  });

  describe('seal quorum cases', () => {
    const trustBase = RootTrustBase.fromJSON({
      changeRecordHash: null,
      epoch: String(fixture.seal.epoch),
      epochStartRound: '0',
      networkId: fixture.seal.networkId,
      previousEntryHash: null,
      quorumThreshold: String(fixture.seal.quorumThreshold),
      rootNodes: fixture.seal.nodes.map((n) => ({
        nodeId: n.id,
        sigKey: n.publicKeyCompressed,
        stake: String(n.stake),
      })),
      signatures: {},
      stateHash: '00',
      version: '1',
    });
    const rule = new UnicitySealQuorumSignaturesVerificationRule(verifier);

    it('uses the network of the corpus', () => {
      expect(trustBase.networkId.equals(NetworkId.fromId(fixture.seal.networkId))).toBe(true);
    });

    it.each(fixture.seal.cases.map((c) => [c.name, c] as const))('%s', async (_name, testCase) => {
      let accepted = false;
      try {
        const seal = UnicitySeal.fromCBOR(HexConverter.decode(testCase.sealCbor));
        accepted = (await rule.verify(trustBase, seal)).status === VerificationStatus.OK;
      } catch {
        // only malformed CBOR may fail here: a malformed witness is zero votes, not a decode failure
        throw new Error(`seal case ${testCase.name} must decode`);
      }
      expect(accepted).toBe(testCase.accept);
    });

    it('preserves every carried witness byte and keys the memo on them', async () => {
      const valid = fixture.seal.cases.find((c) => c.name === 'valid-all-four');
      const surplus = fixture.seal.cases.find((c) => c.name === 'one-v-out-of-range-quorum-met');
      expect(valid && surplus).toBeTruthy();
      const bytes = HexConverter.decode(surplus?.sealCbor ?? '');
      const seal = UnicitySeal.fromCBOR(bytes);

      // re-encoding is canonical and loses nothing, including the malformed witness
      expect(HexConverter.encode(seal.toCBOR())).toBe(surplus?.sealCbor);
      expect(Array.from(seal.witnesses?.values() ?? []).some((w) => w[64] > 3)).toBe(true);
      // the public map lists only well-formed signatures
      expect(seal.signatures?.size).toBe((seal.witnesses?.size ?? 0) - 1);

      // a memoizing rule must not carry the verdict over from the valid seal to this one or back
      const cached = new UnicitySealQuorumSignaturesVerificationRule(verifier, new VerifiedSealCache(8));
      const validSeal = UnicitySeal.fromCBOR(HexConverter.decode(valid?.sealCbor ?? ''));
      expect((await cached.verify(trustBase, validSeal)).status).toBe(VerificationStatus.OK);
      expect(HexConverter.encode(validSeal.toCBOR())).not.toBe(HexConverter.encode(seal.toCBOR()));
      expect((await cached.verify(trustBase, seal)).status).toBe(VerificationStatus.OK);
    });
  });
});
