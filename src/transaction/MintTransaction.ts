import { Address } from './Address.js';
import { CertifiedMintTransaction } from './CertifiedMintTransaction.js';
import { ITransaction } from './ITransaction.js';
import { MintTransactionState } from './MintTransactionState.js';
import { TokenId } from './TokenId.js';
import { TokenType } from './TokenType.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { MintSigningService } from '../crypto/MintSigningService.js';
import { PayToPublicKeyPredicate } from '../predicate/builtin/PayToPublicKeyPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

export class MintTransaction implements ITransaction {
  public static readonly CBOR_TAG = 39041n;
  private static readonly VERSION = 1n;

  private constructor(
    public readonly sourceStateHash: MintTransactionState,
    public readonly lockScript: IPredicate,
    public readonly recipient: Address,
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    private readonly _data: Uint8Array,
  ) {}

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public get version(): bigint {
    return MintTransaction.VERSION;
  }

  public get x(): Uint8Array {
    return new Uint8Array(this.tokenId.bytes);
  }

  public static async create(
    recipient: Address,
    tokenId: TokenId,
    tokenType: TokenType,
    data: Uint8Array,
  ): Promise<MintTransaction> {
    data = new Uint8Array(data);

    const signingService = await MintSigningService.create(tokenId);
    return new MintTransaction(
      await MintTransactionState.create(tokenId),
      PayToPublicKeyPredicate.fromSigningService(signingService),
      recipient,
      tokenId,
      tokenType,
      data,
    );
  }

  public static fromCBOR(bytes: Uint8Array): Promise<MintTransaction> {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== MintTransaction.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for MintTransaction: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== MintTransaction.VERSION) {
      throw new CborError(`Unsupported MintTransaction version: ${version}`);
    }

    const aux = CborDeserializer.decodeArray(data[3]);
    return MintTransaction.create(
      Address.fromCBOR(data[1]),
      TokenId.fromCBOR(data[2]),
      TokenType.fromCBOR(aux[0]),
      CborDeserializer.decodeByteString(aux[1]),
    );
  }

  public calculateStateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(this.sourceStateHash.imprint),
          CborSerializer.encodeByteString(this.x),
        ),
      )
      .digest();
  }

  public calculateTransactionHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          this.recipient.toCBOR(),
          this.tokenId.toCBOR(),
          CborSerializer.encodeArray(this.tokenType.toCBOR(), CborSerializer.encodeByteString(this._data)),
        ),
      )
      .digest();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      MintTransaction.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        this.recipient.toCBOR(),
        this.tokenId.toCBOR(),
        CborSerializer.encodeArray(this.tokenType.toCBOR(), CborSerializer.encodeByteString(this._data)),
      ),
    );
  }

  public toCertifiedTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedMintTransaction> {
    return CertifiedMintTransaction.fromTransaction(trustBase, predicateVerifier, this, inclusionProof);
  }

  public toString(): string {
    return dedent`
      MintTransaction
        Version: ${this.version.toString()}
        Lock Script:
          ${this.lockScript.toString()}
        Recipient: ${this.recipient.toString()}
        Token ID: ${this.tokenId.toString()}
        Token Type: ${this.tokenType.toString()}
        Data: ${HexConverter.encode(this._data)}`;
  }
}
