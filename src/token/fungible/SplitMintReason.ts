import { BurnPredicate } from '../../predicate/embedded/BurnPredicate.js';
import { PredicateEngineService } from '../../predicate/PredicateEngineService.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';
import { ITokenJson, Token } from '../Token.js';
import { ISplitMintReasonProofJson, SplitMintReasonProof } from './SplitMintReasonProof.js';
import { IMintTransactionReason } from '../../transaction/IMintTransactionReason.js';
import { MintReasonType } from '../../transaction/MintReasonType.js';
import { MintTransaction } from '../../transaction/MintTransaction.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationResultCode } from '../../verification/VerificationResultCode.js';

export class SplitMintReason implements IMintTransactionReason {
  public constructor(
    public readonly token: Token,
    private readonly _proofs: SplitMintReasonProof[],
  ) {
    this._proofs = _proofs.slice();
  }

  public get proofs(): SplitMintReasonProof[] {
    return this._proofs.slice();
  }

  /**
   * Create split mint reason from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return split mint reason proof
   */
  public static async fromCBOR(bytes: Uint8Array): Promise<SplitMintReason> {
    const data = CborDeserializer.readArray(bytes);

    const type = CborDeserializer.readUnsignedInteger(data[0]);
    if (type !== BigInt(MintReasonType.TOKEN_SPLIT)) {
      throw new Error('Invalid mint reason type for SplitMintReason.');
    }

    return new SplitMintReason(
      await Token.fromCBOR(data[1]),
      CborDeserializer.readArray(data[2]).map((proof) => SplitMintReasonProof.fromCBOR(proof)),
    );
  }

  public async verify(transaction: MintTransaction): Promise<VerificationResult> {
    if (transaction.data.coinData == null) {
      return Promise.resolve(new VerificationResult(VerificationResultCode.FAIL, 'Coin data is missing.'));
    }

    const predicate = await PredicateEngineService.createPredicate(this.token.state.predicate);
    if (!(predicate instanceof BurnPredicate)) {
      return Promise.resolve(new VerificationResult(VerificationResultCode.FAIL, 'Token is not burned.'));
    }

    if (transaction.data.coinData.length !== this._proofs.length) {
      return Promise.resolve(
        new VerificationResult(VerificationResultCode.FAIL, 'Total amount of coins differ in token and proofs.'),
      );
    }

    for (const proof of this._proofs) {
      const aggregationPathResult = await proof.aggregationPath.verify(proof.coinId.toBitString().toBigInt());
      if (!aggregationPathResult.isSuccessful) {
        return Promise.resolve(
          new VerificationResult(
            VerificationResultCode.FAIL,
            `Aggregation path verification failed for coin: ${proof.coinId}`,
          ),
        );
      }

      const coinTreePathResult = await proof.coinTreePath.verify(transaction.data.tokenId.toBitString().toBigInt());
      if (!coinTreePathResult.isSuccessful) {
        return Promise.resolve(
          new VerificationResult(
            VerificationResultCode.FAIL,
            `Coin tree path verification failed for token: ${transaction.data.tokenId}`,
          ),
        );
      }

      if (!areUint8ArraysEqual(proof.coinTreePath.root.imprint, proof.aggregationPath.steps.at(0)?.data)) {
        return Promise.resolve(
          new VerificationResult(VerificationResultCode.FAIL, 'Coin tree root does not match aggregation path leaf.'),
        );
      }

      const amount = transaction.data.coinData.get(proof.coinId);
      if (amount === null) {
        return Promise.resolve(
          new VerificationResult(VerificationResultCode.FAIL, `Coin id ${proof.coinId} not found in coin data.`),
        );
      }

      if (proof.coinTreePath.steps.at(0)?.value !== amount) {
        return Promise.resolve(
          new VerificationResult(
            VerificationResultCode.FAIL,
            `Coin amount for coin id ${proof.coinId} does not match coin tree leaf.`,
          ),
        );
      }

      if (!proof.aggregationPath.root.equals(predicate.reason)) {
        return Promise.resolve(
          new VerificationResult(VerificationResultCode.FAIL, 'Aggregation path root does not match burn reason.'),
        );
      }
    }

    return Promise.resolve(new VerificationResult(VerificationResultCode.OK));
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(MintReasonType.TOKEN_SPLIT),
      this.token.toCBOR(),
      CborSerializer.encodeArray(...this._proofs.map((proof) => proof.toCBOR())),
    );
  }
}
