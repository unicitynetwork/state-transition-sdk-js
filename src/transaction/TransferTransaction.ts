import { CertifiedTransferTransaction } from './CertifiedTransferTransaction.js';
import { ITransaction } from './ITransaction.js';
import { PayToScriptHash } from './Recipient.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { StateId } from '../api/StateId.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from './verification/rule/InclusionProofVerificationRule.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifierFactory } from '../predicate/verification/PredicateVerifierFactory.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

export class TransferTransaction implements ITransaction {
  private constructor(
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

  public static create(
    owner: IPredicate,
    recipient: PayToScriptHash,
    x: Uint8Array,
    data: Uint8Array,
  ): TransferTransaction {
    return new TransferTransaction(owner, recipient, x, data);
  }

  public static fromCBOR(bytes: Uint8Array): TransferTransaction {
    const data = CborDeserializer.decodeArray(bytes);

    return TransferTransaction.create(
      EncodedPredicate.decode(CborDeserializer.decodeByteString(data[0])),
      PayToScriptHash.fromCBOR(data[1]),
      CborDeserializer.decodeByteString(data[2]),
      CborDeserializer.decodeByteString(data[3]),
    );
  }

  public calculateSourceStateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(this.lockScript.encode()),
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
      CborSerializer.encodeByteString(this.lockScript.encode()),
      this.recipient.toCBOR(),
      CborSerializer.encodeByteString(this._x),
      CborSerializer.encodeByteString(this._data),
    );
  }

  public async toCertifiedTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierFactory,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedTransferTransaction> {
    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      inclusionProof,
      await StateId.fromTransaction(this),
    );
    if (result.status !== InclusionProofVerificationStatus.OK) {
      throw new Error(`Inclusion proof verification failed: ${result.status.toString()}`);
    }

    return new CertifiedTransferTransaction(this, inclusionProof);
  }

  public toString(): string {
    return dedent`
      TransferTransaction
        Lock Script: 
          ${this.lockScript.toString()}
        Recipient: ${this.recipient.toString()}
        X: ${HexConverter.encode(this._x)}
        Data: ${HexConverter.encode(this._data)}`;
  }
}
