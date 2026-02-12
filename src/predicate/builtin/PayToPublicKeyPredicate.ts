import { DataHasher } from '../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../crypto/secp256k1/SigningService.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { ITransaction } from '../../transaction/ITransaction.js';
import { dedent } from '../../util/StringUtils.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';

export class PayToPublicKeyPredicate implements IPredicate {
  public static readonly TYPE: bigint = 0x01n;

  private constructor(private readonly _publicKey: Uint8Array) {
    this._publicKey = new Uint8Array(_publicKey);
  }

  public get engine(): PredicateEngine {
    return PredicateEngine.BUILT_IN;
  }

  public get publicKey(): Uint8Array {
    return new Uint8Array(this._publicKey);
  }

  public get type(): bigint {
    return PayToPublicKeyPredicate.TYPE;
  }

  public static create(signingService: SigningService): PayToPublicKeyPredicate {
    return new PayToPublicKeyPredicate(signingService.publicKey);
  }

  public static decode(bytes: Uint8Array): PayToPublicKeyPredicate {
    const data = CborDeserializer.decodeArray(bytes);
    const engine = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (engine !== BigInt(PredicateEngine.BUILT_IN)) {
      throw new Error('Invalid predicate engine for PayToPublicKeyPredicate.');
    }

    const type = CborDeserializer.decodeUnsignedInteger(CborDeserializer.decodeByteString(data[1]));
    if (type !== PayToPublicKeyPredicate.TYPE) {
      throw new Error('Invalid predicate type for PayToPublicKeyPredicate.');
    }

    return new PayToPublicKeyPredicate(CborDeserializer.decodeByteString(data[2]));
  }

  public static async generateUnlockScript(
    transaction: ITransaction,
    signingService: SigningService,
  ): Promise<Uint8Array> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(transaction.sourceStateHash.data),
          await transaction.calculateTransactionHash().then((hash) => CborSerializer.encodeByteString(hash.data)),
        ),
      )
      .digest();

    return signingService.sign(hash).then((signature) => signature.encode());
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(BigInt(this.engine)),
      CborSerializer.encodeByteString(CborSerializer.encodeUnsignedInteger(this.type)),
      CborSerializer.encodeByteString(this._publicKey),
    );
  }

  public toString(): string {
    return dedent`
      PayToPublicKeyPredicate
        Public Key: ${HexConverter.encode(this._publicKey)}`;
  }
}
