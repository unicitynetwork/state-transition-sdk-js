import { CertifiedTransferTransaction } from './CertifiedTransferTransaction.js';
import { ITransaction } from './ITransaction.js';
import { PayToScriptHash } from './PayToScriptHash.js';
import { Token } from './Token.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from './verification/rule/InclusionProofVerificationRule.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifier } from '../predicate/verification/PredicateVerifier.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

export class TransferTransaction implements ITransaction {
  private constructor(
    public readonly sourceStateHash: DataHash,
    public readonly lockScript: IPredicate,
    public readonly recipient: PayToScriptHash,
    private readonly _x: Uint8Array,
    private readonly _data: Uint8Array,
  ) {
    this._x = new Uint8Array(_x);
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public get x(): Uint8Array {
    return new Uint8Array(this._x);
  }

  public static async create(
    token: Token,
    owner: IPredicate,
    recipient: PayToScriptHash,
    x: Uint8Array,
    data: Uint8Array,
  ): Promise<TransferTransaction> {
    const transaction = token.transactions.at(-1) ?? token.genesis;
    if (!transaction.recipient.equals(await PayToScriptHash.create(owner))) {
      throw new Error('Predicate does not match pay to script hash.');
    }

    const sourceStateHash = await transaction.calculateStateHash();
    return new TransferTransaction(sourceStateHash, owner, recipient, x, data);
  }

  public static fromCBOR(bytes: Uint8Array): TransferTransaction {
    const data = CborDeserializer.decodeArray(bytes);

    return new TransferTransaction(
      new DataHash(HashAlgorithm.SHA256, CborDeserializer.decodeByteString(data[0])),
      EncodedPredicate.fromCBOR(CborDeserializer.decodeByteString(data[1])),
      PayToScriptHash.fromCBOR(data[2]),
      CborDeserializer.decodeByteString(data[3]),
      CborDeserializer.decodeByteString(data[4]),
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
          this.recipient.toCBOR(),
          CborSerializer.encodeByteString(this._x),
          CborSerializer.encodeByteString(this._data),
        ),
      )
      .digest();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(this.sourceStateHash.data),
      CborSerializer.encodeByteString(this.lockScript.toCBOR()),
      this.recipient.toCBOR(),
      CborSerializer.encodeByteString(this._x),
      CborSerializer.encodeByteString(this._data),
    );
  }

  public async toCertifiedTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifier,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedTransferTransaction> {
    const result = await InclusionProofVerificationRule.verify(trustBase, predicateVerifier, inclusionProof, this);
    if (result.status !== InclusionProofVerificationStatus.OK) {
      throw new Error(`Inclusion proof verification failed: ${result.status.toString()}`);
    }

    return new CertifiedTransferTransaction(this, inclusionProof);
  }

  public toString(): string {
    return dedent`
      TransferTransaction
        Source State Hash: ${this.sourceStateHash.toString()}
        Lock Script: 
          ${this.lockScript.toString()}
        Recipient: ${this.recipient.toString()}
        X: ${HexConverter.encode(this._x)}
        Data: ${HexConverter.encode(this._data)}`;
  }
}
