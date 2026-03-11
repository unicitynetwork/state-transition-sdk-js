import { UnicityIdMintTransaction } from './UnicityIdMintTransaction.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { Address } from '../transaction/Address.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { TokenId } from '../transaction/TokenId.js';
import { TokenType } from '../transaction/TokenType.js';
import { dedent } from '../util/StringUtils.js';
import { PayToPublicKeyPredicate } from '../predicate/builtin/PayToPublicKeyPredicate.js';
import { UnicityId } from './UnicityId.js';

export class CertifiedUnicityIdMintTransaction implements ITransaction {
  public constructor(
    private readonly transaction: UnicityIdMintTransaction,
    public readonly inclusionProof: InclusionProof,
  ) {}

  public get data(): Uint8Array {
    return this.transaction.data;
  }

  public get lockScript(): IPredicate {
    return this.transaction.lockScript;
  }

  public get recipient(): Address {
    return this.transaction.recipient;
  }

  public get sourceStateHash(): DataHash {
    return this.transaction.sourceStateHash;
  }

  public get targetPredicate(): PayToPublicKeyPredicate {
    return this.transaction.targetPredicate;
  }

  public get tokenId(): TokenId {
    return this.transaction.tokenId;
  }

  public get tokenType(): TokenType {
    return this.transaction.tokenType;
  }

  public get unicityId(): UnicityId {
    return this.transaction.unicityId;
  }

  public get x(): Uint8Array {
    return this.transaction.x;
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<CertifiedUnicityIdMintTransaction> {
    const data = CborDeserializer.decodeArray(bytes);
    return new CertifiedUnicityIdMintTransaction(
      await UnicityIdMintTransaction.fromCBOR(data[0]),
      InclusionProof.fromCBOR(data[1]),
    );
  }

  public calculateStateHash(): Promise<DataHash> {
    return this.transaction.calculateStateHash();
  }

  public calculateTransactionHash(): Promise<DataHash> {
    return this.transaction.calculateTransactionHash();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.transaction.toCBOR(), this.inclusionProof.toCBOR());
  }

  public toString(): string {
    return dedent`
      CertifiedMintTransaction
        ${this.transaction.toString()}
        ${this.inclusionProof.toString()}`;
  }
}
