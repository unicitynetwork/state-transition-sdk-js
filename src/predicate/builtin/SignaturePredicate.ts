import { SigningService } from '../../crypto/secp256k1/SigningService.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { BuiltInPredicateType } from './BuiltInPredicateType.js';
import { IBuiltInPredicate } from './IBuiltInPredicate.js';
import { EncodedPredicate } from '../EncodedPredicate.js';

export class SignaturePredicate implements IBuiltInPredicate {
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
    return BuiltInPredicateType.Signature;
  }

  public static create(publicKey: Uint8Array): SignaturePredicate {
    if (!SigningService.isPublicKeyValid(publicKey)) {
      throw new Error('Invalid public key.');
    }

    return new SignaturePredicate(publicKey);
  }

  public static fromPredicate(predicate: EncodedPredicate): SignaturePredicate {
    if (predicate.engine !== PredicateEngine.BUILT_IN) {
      throw new Error(`Predicate engine must be ${PredicateEngine.BUILT_IN}.`);
    }

    const type = CborDeserializer.decodeUnsignedInteger(predicate.encodeCode());
    if (type !== BigInt(BuiltInPredicateType.Signature)) {
      throw new Error(`Predicate type must be ${BuiltInPredicateType.Signature}.`);
    }

    return new SignaturePredicate(predicate.encodeParameters());
  }

  public static fromSigningService(signingService: SigningService): SignaturePredicate {
    return new SignaturePredicate(signingService.publicKey);
  }
  public encodeCode(): Uint8Array {
    return CborSerializer.encodeUnsignedInteger(this.type);
  }

  public encodeParameters(): Uint8Array {
    return this.publicKey;
  }

  public toString(): string {
    return dedent`
      SignaturePredicate
        Public Key: ${HexConverter.encode(this._publicKey)}`;
  }
}
