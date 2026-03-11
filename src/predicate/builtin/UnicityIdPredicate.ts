import { PayToPublicKeyPredicate } from './PayToPublicKeyPredicate.js';
import { DataHasher } from '../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../crypto/secp256k1/SigningService.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { ITransaction } from '../../transaction/ITransaction.js';
import { Token } from '../../transaction/Token.js';
import { dedent } from '../../util/StringUtils.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { BuiltInPredicateType } from './BuiltInPredicateType.js';
import { UnicityId } from '../../unicity-id/UnicityId.js';

export class UnicityIdPredicate implements IPredicate {
  public static readonly TYPE: bigint = BigInt(BuiltInPredicateType.UnicityId);

  private constructor(
    private readonly _publicKey: Uint8Array,
    public readonly unicityId: UnicityId,
  ) {
    this._publicKey = new Uint8Array(_publicKey);
  }

  public get engine(): PredicateEngine {
    return PredicateEngine.BUILT_IN;
  }

  public get publicKey(): Uint8Array {
    return new Uint8Array(this._publicKey);
  }

  public get type(): bigint {
    return UnicityIdPredicate.TYPE;
  }

  public static create(publicKey: Uint8Array, unicityId: UnicityId): UnicityIdPredicate {
    return new UnicityIdPredicate(publicKey, unicityId);
  }

  public static fromCBOR(bytes: Uint8Array): UnicityIdPredicate {
    const data = CborDeserializer.decodeArray(bytes);
    const engine = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (engine !== BigInt(PredicateEngine.BUILT_IN)) {
      throw new Error('Invalid predicate engine.');
    }

    const type = CborDeserializer.decodeUnsignedInteger(CborDeserializer.decodeByteString(data[1]));
    if (type !== UnicityIdPredicate.TYPE) {
      throw new Error('Invalid predicate type.');
    }

    const params = CborDeserializer.decodeArray(CborDeserializer.decodeByteString(data[2]));

    return new UnicityIdPredicate(CborDeserializer.decodeByteString(params[0]), UnicityId.fromCBOR(params[1]));
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(BigInt(this.engine)),
      CborSerializer.encodeByteString(CborSerializer.encodeUnsignedInteger(this.type)),
      CborSerializer.encodeByteString(
        CborSerializer.encodeArray(CborSerializer.encodeByteString(this._publicKey), this.unicityId.toCBOR()),
      ),
    );
  }

  public toString(): string {
    return dedent`
      UnicityIdPredicate
        Public Key: ${HexConverter.encode(this._publicKey)}
        UnicityId: 
          ${this.unicityId.toString()}`;
  }
}
