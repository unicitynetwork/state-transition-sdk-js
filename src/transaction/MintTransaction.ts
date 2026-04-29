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
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

export class MintTransaction implements ITransaction {
  public static readonly CBOR_TAG = 39041n;
  private static readonly VERSION = 1n;

  private constructor(
    public readonly sourceStateHash: MintTransactionState,
    public readonly lockScript: IPredicate,
    public readonly recipient: IPredicate,
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    private readonly _justification: Uint8Array | null,
    private readonly _data: Uint8Array | null,
  ) {}

  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  public get justification(): Uint8Array | null {
    return this._justification ? new Uint8Array(this._justification) : null;
  }

  public get stateMask(): Uint8Array {
    return new Uint8Array(this.tokenId.bytes);
  }

  public get version(): bigint {
    return MintTransaction.VERSION;
  }

  public static async create(
    recipient: IPredicate,
    tokenId: TokenId,
    tokenType: TokenType,
    justification: Uint8Array | null = null,
    data: Uint8Array | null = null,
  ): Promise<MintTransaction> {
    justification = justification ? new Uint8Array(justification) : null;
    data = data ? new Uint8Array(data) : null;

    const signingService = await MintSigningService.create(tokenId);
    return new MintTransaction(
      await MintTransactionState.create(tokenId),
      PayToPublicKeyPredicate.fromSigningService(signingService),
      recipient,
      tokenId,
      tokenType,
      justification,
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

    return MintTransaction.create(
      EncodedPredicate.fromCBOR(data[1]),
      TokenId.fromCBOR(data[2]),
      TokenType.fromCBOR(data[3]),
      CborDeserializer.decodeNullable(data[4], CborDeserializer.decodeByteString),
      CborDeserializer.decodeNullable(data[5], CborDeserializer.decodeByteString),
    );
  }

  public calculateStateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(this.sourceStateHash.imprint),
          CborSerializer.encodeByteString(this.stateMask),
        ),
      )
      .digest();
  }

  public calculateTransactionHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(this.toCBOR()).digest();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      MintTransaction.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        EncodedPredicate.fromPredicate(this.recipient).toCBOR(),
        this.tokenId.toCBOR(),
        this.tokenType.toCBOR(),
        CborSerializer.encodeNullable(this._justification, CborSerializer.encodeByteString),
        CborSerializer.encodeNullable(this._data, CborSerializer.encodeByteString),
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
        Mint Justification: ${this._justification ? HexConverter.encode(this._justification) : 'null'}
        Data: ${this._data ? HexConverter.encode(this._data) : 'null'}`;
  }
}
