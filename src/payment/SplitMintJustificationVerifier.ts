import { IPaymentData } from './IPaymentData.js';
import { SplitMintJustification } from './SplitMintJustification.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { BurnPredicate } from '../predicate/builtin/BurnPredicate.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CertifiedMintTransaction } from '../transaction/CertifiedMintTransaction.js';
import { IMintJustificationVerifier } from '../transaction/verification/IMintJustificationVerifier.js';
import { MintJustificationVerifierService } from '../transaction/verification/MintJustificationVerifierService.js';
import { HexConverter } from '../util/HexConverter.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';

export class SplitMintJustificationVerifier implements IMintJustificationVerifier {
  public constructor(
    private readonly trustBase: RootTrustBase,
    private readonly predicateVerifier: PredicateVerifierService,
    private readonly decodePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>,
  ) {}

  public get tag(): bigint {
    return SplitMintJustification.CBOR_TAG;
  }

  public async verify(
    transaction: CertifiedMintTransaction,
    mintJustificationVerifier: MintJustificationVerifierService,
  ): Promise<VerificationResult<VerificationStatus>> {
    const justificationBytes = transaction.justification;
    if (!justificationBytes) {
      return new VerificationResult(
        'SplitMintJustificationVerifier',
        VerificationStatus.FAIL,
        'Transaction has no justification.',
        [],
      );
    }

    const justification = await SplitMintJustification.fromCBOR(justificationBytes);
    const paymentDataBytes = transaction.data;
    const paymentData = paymentDataBytes ? await this.decodePaymentData(paymentDataBytes) : null;

    if (paymentData?.assets == null) {
      return new VerificationResult(
        'SplitMintJustificationVerifier',
        VerificationStatus.FAIL,
        'Assets data is missing.',
        [],
      );
    }

    const tokenVerificationResult = await justification.token.verify(
      this.trustBase,
      this.predicateVerifier,
      mintJustificationVerifier,
    );
    if (tokenVerificationResult.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'SplitMintJustificationVerifier',
        VerificationStatus.FAIL,
        'Burn token verification failed.',
        [tokenVerificationResult],
      );
    }

    if (paymentData.assets.size() !== justification.proofs.length) {
      return new VerificationResult(
        'SplitMintJustificationVerifier',
        VerificationStatus.FAIL,
        'Total amount of assets differ in token and proofs.',
        [],
      );
    }

    const validatedAssets = new Set<string>();
    const burntTokenLastTransaction = justification.token.transactions.at(-1);
    const root = justification.proofs.at(0)?.aggregationPath.root;
    for (const proof of justification.proofs) {
      const aggregationPathResult = await proof.aggregationPath.verify(proof.assetId.toBitString().toBigInt());
      if (!aggregationPathResult.isSuccessful) {
        return new VerificationResult(
          'SplitMintJustificationVerifier',
          VerificationStatus.FAIL,
          `Aggregation path verification failed for asset: ${proof.assetId.toString()}`,
          [],
        );
      }

      const assetTreePathResult = await proof.assetTreePath.verify(transaction.tokenId.toBitString().toBigInt());
      if (!assetTreePathResult.isSuccessful) {
        return new VerificationResult(
          'SplitMintJustificationVerifier',
          VerificationStatus.FAIL,
          `Asset tree path verification failed for token: ${transaction.tokenId.toString()}`,
          [],
        );
      }

      if (!proof.aggregationPath.root.equals(root)) {
        return new VerificationResult(
          'TokenSplitReasonVerificationRule',
          VerificationStatus.FAIL,
          'Current proof is not derived from the same asset tree as other proofs.',
        );
      }

      if (!areUint8ArraysEqual(proof.assetTreePath.root.imprint, proof.aggregationPath.steps.at(0)?.data)) {
        return new VerificationResult(
          'SplitMintJustificationVerifier',
          VerificationStatus.FAIL,
          'Asset tree root does not match aggregation path leaf.',
          [],
        );
      }

      const amount = paymentData.assets.get(proof.assetId)?.value;
      if (amount == null) {
        return new VerificationResult(
          'SplitMintJustificationVerifier',
          VerificationStatus.FAIL,
          `Asset id ${proof.assetId.toString()} not found in asset data.`,
          [],
        );
      }

      if (proof.assetTreePath.steps.at(0)?.value !== amount) {
        return new VerificationResult(
          'SplitMintJustificationVerifier',
          VerificationStatus.FAIL,
          `Asset amount for asset id ${proof.assetId.toString()} does not match asset tree leaf.`,
          [],
        );
      }

      const recipient = burntTokenLastTransaction
        ? EncodedPredicate.fromPredicate(burntTokenLastTransaction.recipient)
        : null;
      const expectedRecipient = EncodedPredicate.fromPredicate(
        BurnPredicate.create(proof.aggregationPath.root.imprint),
      );
      if (!EncodedPredicate.equals(recipient, expectedRecipient)) {
        return new VerificationResult(
          'SplitMintJustificationVerifier',
          VerificationStatus.FAIL,
          'Aggregation path root does not match burn predicate.',
          [],
        );
      }

      validatedAssets.add(HexConverter.encode(proof.assetId.bytes));
    }

    if (validatedAssets.size !== paymentData.assets.size()) {
      return new VerificationResult(
        'SplitMintJustificationVerifier',
        VerificationStatus.FAIL,
        'Some assets proofs are missing from the token.',
        [],
      );
    }

    return new VerificationResult('SplitMintJustificationVerifier', VerificationStatus.OK);
  }
}
