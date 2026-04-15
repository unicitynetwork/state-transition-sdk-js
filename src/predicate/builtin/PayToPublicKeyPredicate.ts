import { SigningService } from '../../crypto/secp256k1/SigningService.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { BuiltInPredicateType } from './BuiltInPredicateType.js';
import { IBuiltInPredicate } from './IBuiltInPredicate.js';
import { IPredicate } from '../IPredicate.js';

export class PayToPublicKeyPredicate implements IBuiltInPredicate {
  private constructor(private readonly _publicKey: Uint8Array) {
    this._publicKey = new Uint8Array(_publicKey);
  }

  public get engine(): PredicateEngine {
    return PredicateEngine.BUILT_IN;
  }

  public get publicKey(): Uint8Array {
    return new Uint8Array(this._publicKey);
  }

  public get type(): BuiltInPredicateType {
    return BuiltInPredicateType.PayToPublicKey;
  }

  public static create(publicKey: Uint8Array): PayToPublicKeyPredicate {
    if (!SigningService.isPublicKeyValid(publicKey)) {
      throw new Error('Invalid public key.');
    }

    return new PayToPublicKeyPredicate(publicKey);
  }

  public static fromPredicate(predicate: IPredicate): PayToPublicKeyPredicate {
    if (predicate.engine !== PredicateEngine.BUILT_IN) {
      throw new Error(`Predicate engine must be ${PredicateEngine.BUILT_IN}.`);
    }

    const type = CborDeserializer.decodeUnsignedInteger(predicate.encodeCode());
    if (type !== BigInt(BuiltInPredicateType.PayToPublicKey)) {
      throw new Error(`Predicate type must be ${BuiltInPredicateType.PayToPublicKey}.`);
    }

    return new PayToPublicKeyPredicate(predicate.encodeParameters());
  }

  public static fromSigningService(signingService: SigningService): PayToPublicKeyPredicate {
    return new PayToPublicKeyPredicate(signingService.publicKey);
  }
  public encodeCode(): Uint8Array {
    return CborSerializer.encodeUnsignedInteger(this.type);
  }

  public encodeParameters(): Uint8Array {
    return this.publicKey;
  }

  public toString(): string {
    return dedent`
      PayToPublicKeyPredicate
        Public Key: ${HexConverter.encode(this._publicKey)}`;
  }
}
