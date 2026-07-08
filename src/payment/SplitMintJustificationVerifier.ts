import { IPaymentData } from './IPaymentData.js';
import { SplitManifest } from './SplitManifest.js';
import { SplitMintJustification } from './SplitMintJustification.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { BurnPredicate } from '../predicate/builtin/BurnPredicate.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { CertifiedMintTransaction } from '../transaction/CertifiedMintTransaction.js';
import type { Token } from '../transaction/Token.js';
import { IMintJustificationVerifier } from '../transaction/verification/IMintJustificationVerifier.js';
import { HexConverter } from '../util/HexConverter.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';

const RULE = 'SplitMintJustificationVerifier';

/**
 * Verifier for {@link SplitMintJustification} mint justifications. It reports the
 * burned source token for caller verification, binds the burn to the split
 * manifest, recomputes the output's leaf data, and verifies every output asset
 * against its allocation proof — requiring each asset's reconstructed total to
 * equal the source amount (value conservation).
 */
export class SplitMintJustificationVerifier implements IMintJustificationVerifier {
  public constructor(private readonly decodePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>) {}

  /**
   * @returns {bigint} CBOR tag this verifier handles.
   */
  public get tag(): bigint {
    return SplitMintJustification.CBOR_TAG;
  }

  private static fail(
    message: string,
    results: VerificationResult<unknown>[] = [],
  ): VerificationResult<VerificationStatus> {
    return new VerificationResult(RULE, VerificationStatus.FAIL, message, results);
  }

  /**
   * @inheritDoc
   */
  public async verify(
    transaction: CertifiedMintTransaction,
    nestedTokenCollector: (token: Token) => void,
  ): Promise<VerificationResult<VerificationStatus>> {
    if (!transaction.justification) {
      return SplitMintJustificationVerifier.fail('Transaction has no justification.');
    }

    const justification = await SplitMintJustification.fromCBOR(transaction.justification);

    if (!transaction.networkId.equals(justification.token.genesis.networkId)) {
      return SplitMintJustificationVerifier.fail(
        `Network identifier mismatch: mint is on ${transaction.networkId.toString()}, source token is on ${justification.token.genesis.networkId.toString()}.`,
      );
    }

    nestedTokenCollector(justification.token);

    const burnTransaction = justification.token.transactions.at(-1);
    if (!burnTransaction) {
      return SplitMintJustificationVerifier.fail('Burned source token does not end in a certified transfer.');
    }

    if (!burnTransaction.data) {
      return SplitMintJustificationVerifier.fail('Burn transfer has no manifest.');
    }
    const roots = SplitManifest.fromCBOR(burnTransaction.data).roots;

    const burnReason = await new DataHasher(HashAlgorithm.SHA256).update(burnTransaction.data).digest();
    const expectedRecipient = EncodedPredicate.fromPredicate(BurnPredicate.create(burnReason.data));
    if (!EncodedPredicate.equals(burnTransaction.recipient, expectedRecipient)) {
      return SplitMintJustificationVerifier.fail('Burn transfer recipient does not match the manifest hash.');
    }

    if (!areUint8ArraysEqual(transaction.tokenType.bytes, justification.token.type.bytes)) {
      return SplitMintJustificationVerifier.fail('Output token type does not match the source token type.');
    }

    const sourceTokenPaymentData = justification.token.genesis.data
      ? await this.decodePaymentData(justification.token.genesis.data)
      : null;
    if (sourceTokenPaymentData?.assets.size() !== roots.length) {
      return SplitMintJustificationVerifier.fail('Manifest root count does not match the source asset count.');
    }

    const paymentData = transaction.data ? await this.decodePaymentData(transaction.data) : null;
    const proofs = justification.proofs;
    if (proofs.length !== paymentData?.assets.size()) {
      return SplitMintJustificationVerifier.fail('Allocation proof count does not match the output asset count.');
    }

    const leafData = await SplitMintJustification.calculateLeafData(
      justification.token,
      transaction.recipient,
      transaction.salt,
      transaction.tokenId,
      transaction.data,
    );

    const assets = paymentData.assets.toArray();

    const rootByAssetKey = new Map(
      sourceTokenPaymentData.assets
        .toArray()
        .map((asset, index) => [HexConverter.encode(asset.id.bytes), roots[index]] as const),
    );

    const results = await Promise.all(
      assets.map(async (asset, i) => {
        const sourceAsset = sourceTokenPaymentData.assets.get(asset.id);
        const root = rootByAssetKey.get(HexConverter.encode(asset.id.bytes));
        if (sourceAsset == null || root == null) {
          return SplitMintJustificationVerifier.fail(`Asset ${asset.id.toString()} is absent from the source token.`);
        }

        const isValid = await proofs[i].verify(
          transaction.tokenId.bytes,
          leafData,
          asset.value,
          root,
          sourceAsset.value,
        );
        if (!isValid) {
          return SplitMintJustificationVerifier.fail(`Allocation proof failed for asset ${asset.id.toString()}.`);
        }

        return new VerificationResult<VerificationStatus>(RULE, VerificationStatus.OK);
      }),
    );

    return VerificationResult.fromResults(RULE, results);
  }
}
