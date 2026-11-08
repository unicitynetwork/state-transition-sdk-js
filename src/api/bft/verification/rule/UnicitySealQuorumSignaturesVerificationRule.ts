import { DataHash } from '../../../../crypto/hash/DataHash.js';
import { DataHasher } from '../../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../../crypto/hash/HashAlgorithm.js';
import { ISignatureVerifier } from '../../../../crypto/ISignatureVerifier.js';
import { Signature } from '../../../../crypto/secp256k1/Signature.js';
import { CborSerializer } from '../../../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../util/HexConverter.js';
import { VerificationResult } from '../../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../../verification/VerificationStatus.js';
import { RootTrustBaseV2 } from '../../trustbase/RootTrustBaseV2.js';
import { UnicitySeal } from '../../UnicitySeal.js';
import { VerifiedSealCache } from '../VerifiedSealCache.js';

/**
 * Rule to verify that the UnicitySeal contains valid quorum signatures.
 *
 * Signature verification dominates inclusion-proof verification, and every proof
 * certified in the same aggregator round carries the same seal, so the rule can
 * memoise verified seals in a caller-supplied {@link VerifiedSealCache}.
 */
export class UnicitySealQuorumSignaturesVerificationRule {
  /**
   * @param {ISignatureVerifier<Signature>} signatureVerifier Verifier for the root-node signatures.
   * @param {VerifiedSealCache} [cache] Memo for verified seals; omit to verify every seal afresh.
   */
  public constructor(
    private readonly signatureVerifier: ISignatureVerifier<Signature>,
    private readonly cache?: VerifiedSealCache,
  ) {}

  /**
   * Build the cache key for a (trust-base entry, seal) pair.
   *
   * Both halves are addressed by content, and both are load-bearing:
   *
   * 1. The seal is keyed on its **complete** encoding.
   *    {@link UnicitySeal.calculateHash} hashes it *without* the signatures — it
   *    is the digest the root nodes sign — so keying on that would let a seal's
   *    valid signatures be swapped for garbage and still hit a cached OK.
   *    `toCBOR()` encodes the signatures too, so a hit means identical bytes.
   * 2. The entry decides the outcome through its members, their weights and
   *    the quorum threshold, and is keyed by content: its complete tagged
   *    encoding (signatures included), not its identity.
   *
   * The signature verifier needs no representation here: a cache is reachable
   * only through the rule that owns it, and a rule owns exactly one verifier.
   *
   * Both are folded into a single digest through a CBOR array: the framing is
   * what makes one hash safe, since concatenating two variable-length encodings
   * raw would let a different (trust base, seal) split produce the same bytes.
   *
   * @param {RootTrustBaseV2} entry Trust-base entry the seal is verified against.
   * @param {UnicitySeal} unicitySeal Seal being verified.
   * @returns {Promise<string>} Cache key.
   */
  private static async cacheKeyFor(entry: RootTrustBaseV2, unicitySeal: UnicitySeal): Promise<string> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(entry.encode()),
          CborSerializer.encodeByteString(unicitySeal.toCBOR()),
        ),
      )
      .digest();

    return HexConverter.encode(hash.imprint);
  }

  /**
   * Verify the unicity seal carries valid signatures of members whose weight reaches the entry's quorum threshold. A signer that is not a
   * member, or a signature that does not verify, counts zero (the upstream seal rule); each member counts once, as the signatures are a map.
   *
   * @param {RootTrustBaseV2} entry Trust-base entry of the seal's epoch.
   * @param {UnicitySeal} unicitySeal Seal to verify.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public async verify(
    entry: RootTrustBaseV2,
    unicitySeal: UnicitySeal,
  ): Promise<VerificationResult<VerificationStatus>> {
    // A resource bound before anything is encoded, hashed, keyed or verified: unknown signers and bad values count like any other witness.
    if ((unicitySeal.witnesses?.size ?? 0) > UnicitySeal.MAX_WITNESSES) {
      return new VerificationResult(
        'UnicitySealQuorumSignaturesVerificationRule',
        VerificationStatus.FAIL,
        `${unicitySeal.witnesses?.size} signatures exceed ${UnicitySeal.MAX_WITNESSES}.`,
      );
    }
    const cacheKey = this.cache
      ? await UnicitySealQuorumSignaturesVerificationRule.cacheKeyFor(entry, unicitySeal)
      : null;
    if (cacheKey !== null) {
      const cached = this.cache?.get(cacheKey) ?? null;
      if (cached !== null) {
        return cached;
      }
    }

    const hash = await unicitySeal.calculateHash();

    const results = await Promise.all(
      Array.from(unicitySeal.signatures?.entries() ?? []).map(([nodeId, signature]) =>
        this.verifySignature(entry, nodeId, signature, hash),
      ),
    );

    // The weight of the members whose signature verified, each counted once (the map has one signature per node id).
    const weights = new Map(entry.members.map((member) => [member.nodeId, member.weight]));
    let signed = 0n;
    for (const [index, [nodeId]] of Array.from(unicitySeal.signatures?.entries() ?? []).entries()) {
      if (results[index].status === VerificationStatus.OK) {
        signed += weights.get(nodeId) ?? 0n;
      }
    }
    if (signed >= entry.quorumThreshold) {
      const result = new VerificationResult(
        'UnicitySealQuorumSignaturesVerificationRule',
        VerificationStatus.OK,
        `Unicity quorum weight ${signed} reached the threshold ${entry.quorumThreshold}`,
        results,
      );
      // Only quorum-reaching outcomes are memoised: a failure is the abnormal
      // path, and not caching it keeps a flood of bad seals from evicting good
      // entries.
      if (cacheKey !== null) {
        this.cache?.set(cacheKey, result);
      }

      return result;
    }

    return new VerificationResult(
      'UnicitySealQuorumSignaturesVerificationRule',
      VerificationStatus.FAIL,
      `Unicity quorum weight ${signed} is below the threshold ${entry.quorumThreshold}`,
      results,
    );
  }

  private async verifySignature(
    entry: RootTrustBaseV2,
    nodeId: string,
    signature: Signature,
    hash: DataHash,
  ): Promise<VerificationResult<VerificationStatus>> {
    const node = entry.members.find((member) => member.nodeId === nodeId) ?? null;
    if (node === null) {
      return new VerificationResult(
        `SignatureVerificationRule[${nodeId}]`,
        VerificationStatus.FAIL,
        'No root node defined',
      );
    }

    const result = await this.signatureVerifier.verify(hash, signature, node.sigKey);
    if (!result) {
      return new VerificationResult(
        `SignatureVerificationRule[${nodeId}]`,
        VerificationStatus.FAIL,
        'Signature verification failed',
      );
    }

    return new VerificationResult(`SignatureVerificationRule[${nodeId}]`, VerificationStatus.OK);
  }
}
