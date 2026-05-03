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
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

export class TransferTransaction implements ITransaction {
  public static readonly CBOR_TAG = 39045n;
  private static readonly VERSION = 1n;

  private constructor(
    public readonly sourceStateHash: DataHash,
    public readonly lockScript: IPredicate,
    public readonly recipient: IPredicate,
    private readonly _stateMask: Uint8Array,
    private readonly _data: Uint8Array | null,
  ) {}

  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  public get stateMask(): Uint8Array {
    return new Uint8Array(this._stateMask);
  }

  public get version(): bigint {
    return TransferTransaction.VERSION;
  }

  public static async create(
    token: Token,
    recipient: IPredicate,
    stateMask: Uint8Array,
    data: Uint8Array | null = null,
  ): Promise<TransferTransaction> {
    stateMask = new Uint8Array(stateMask);
    data = data ? new Uint8Array(data) : null;

    const transaction = token.latestTransaction;
    return new TransferTransaction(
      await transaction.calculateStateHash(),
      transaction.recipient,
      recipient,
      stateMask,
      data,
    );
  }

  public static fromCBOR(bytes: Uint8Array, token: Token): Promise<TransferTransaction> {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== TransferTransaction.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for TransferTransaction: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data, 4);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== TransferTransaction.VERSION) {
      throw new CborError(`Unsupported TransferTransaction version: ${version}`);
    }

    return TransferTransaction.create(
      token,
      EncodedPredicate.fromCBOR(data[1]),
      CborDeserializer.decodeByteString(data[2]),
      CborDeserializer.decodeNullable(data[3], CborDeserializer.decodeByteString),
    );
  }

  public calculateStateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(this.sourceStateHash.imprint),
          CborSerializer.encodeByteString(this._stateMask),
        ),
      )
      .digest();
  }

  public calculateTransactionHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(this.toCBOR()).digest();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      TransferTransaction.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        EncodedPredicate.fromPredicate(this.recipient).toCBOR(),
        CborSerializer.encodeByteString(this._stateMask),
        CborSerializer.encodeNullable(this._data, CborSerializer.encodeByteString),
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
        StateMask: ${HexConverter.encode(this._stateMask)}
        Data: ${this._data ? HexConverter.encode(this._data) : 'null'}`;
  }
}
