import { CertifiedTransferTransaction } from './CertifiedTransferTransaction.js';
import { ITransaction } from './ITransaction.js';
import { Token } from './Token.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

export class TransferTransaction implements ITransaction {
  public static readonly CBOR_TAG = 39045n;
  private static readonly VERSION = 1n;

  private constructor(
    public readonly sourceStateHash: DataHash,
    public readonly lockScript: IPredicate,
    public readonly recipient: IPredicate,
    private readonly _x: Uint8Array,
    private readonly _data: Uint8Array,
  ) {
    this._x = new Uint8Array(_x);
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public get version(): bigint {
    return TransferTransaction.VERSION;
  }

  public get x(): Uint8Array {
    return new Uint8Array(this._x);
  }

  public static async create(
    token: Token,
    recipient: IPredicate,
    x: Uint8Array,
    data: Uint8Array,
  ): Promise<TransferTransaction> {
    const transaction = token.latestTransaction;
    return new TransferTransaction(await transaction.calculateStateHash(), transaction.recipient, recipient, x, data);
  }

  public static fromCBOR(bytes: Uint8Array, token: Token): Promise<TransferTransaction> {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== TransferTransaction.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for TransferTransaction: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== TransferTransaction.VERSION) {
      throw new CborError(`Unsupported TransferTransaction version: ${version}`);
    }

    return TransferTransaction.create(
      token,
      EncodedPredicate.fromCBOR(data[1]),
      CborDeserializer.decodeByteString(data[2]),
      CborDeserializer.decodeByteString(data[3]),
    );
  }

  public calculateStateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(this.sourceStateHash.imprint),
          CborSerializer.encodeByteString(this._x),
        ),
      )
      .digest();
  }

  public calculateTransactionHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          EncodedPredicate.fromPredicate(this.recipient).toCBOR(),
          CborSerializer.encodeByteString(this._x),
          CborSerializer.encodeByteString(this._data),
        ),
      )
      .digest();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      TransferTransaction.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        EncodedPredicate.fromPredicate(this.recipient).toCBOR(),
        CborSerializer.encodeByteString(this._x),
        CborSerializer.encodeByteString(this._data),
      ),
    );
  }

  public toCertifiedTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedTransferTransaction> {
    return CertifiedTransferTransaction.fromTransaction(trustBase, predicateVerifier, this, inclusionProof);
  }

  public toString(): string {
    return dedent`
      TransferTransaction
        Version: ${this.version.toString()}
        Source State Hash: ${this.sourceStateHash.toString()}
        Lock Script: 
          ${this.lockScript.toString()}
        Recipient: ${this.recipient.toString()}
        X: ${HexConverter.encode(this._x)}
        Data: ${HexConverter.encode(this._data)}`;
  }
}
