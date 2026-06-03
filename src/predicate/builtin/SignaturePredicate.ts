import { SigningService } from '../../crypto/secp256k1/SigningService.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { BuiltInPredicateType } from './BuiltInPredicateType.js';
import { IBuiltInPredicate } from './IBuiltInPredicate.js';
import { EncodedPredicate } from '../EncodedPredicate.js';

/**
 * Built-in predicate that locks a state to a single secp256k1 public key.
 * Spending requires a {@link SignaturePredicateUnlockScript} signed by the
 * matching private key.
 */
export class SignaturePredicate implements IBuiltInPredicate {
  private constructor(private readonly _publicKey: Uint8Array) {
    this._publicKey = new Uint8Array(_publicKey);
  }

  /**
   * @returns {PredicateEngine} Built-in predicate engine.
   */
  public get engine(): PredicateEngine {
    return PredicateEngine.BUILT_IN;
  }

  /**
   * @returns {Uint8Array} Copy of the compressed public key.
   */
  public get publicKey(): Uint8Array {
    return new Uint8Array(this._publicKey);
  }

  /**
   * @returns {BuiltInPredicateType} Signature predicate type id.
   */
  public get type(): BuiltInPredicateType {
    return BuiltInPredicateType.Signature;
  }

  /**
   * Create a SignaturePredicate from a compressed secp256k1 public key.
   *
   * @param {Uint8Array} publicKey Compressed public key bytes.
   * @returns {SignaturePredicate} New predicate.
   * @throws {Error} If `publicKey` is not a valid compressed point.
   */
  public static create(publicKey: Uint8Array): SignaturePredicate {
    if (!SigningService.isPublicKeyValid(publicKey)) {
      throw new Error('Invalid public key.');
    }

    return new SignaturePredicate(publicKey);
  }

  /**
   * Decode a SignaturePredicate from an EncodedPredicate.
   *
   * @param {EncodedPredicate} predicate Encoded predicate.
   * @returns {SignaturePredicate} Decoded predicate.
   * @throws {Error} If the engine or type does not match.
   */
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

  /**
   * Create a SignaturePredicate from the public key of a SigningService.
   *
   * @param {SigningService} signingService Service whose public key is used.
   * @returns {SignaturePredicate} New predicate.
   */
  public static fromSigningService(signingService: SigningService): SignaturePredicate {
    return new SignaturePredicate(signingService.publicKey);
  }

  /**
   * @inheritDoc
   */
  public encodeCode(): Uint8Array {
    return CborSerializer.encodeUnsignedInteger(this.type);
  }

  /**
   * @inheritDoc
   */
  public encodeParameters(): Uint8Array {
    return this.publicKey;
  }

  /**
   * @returns {string} String representation of the predicate.
   */
  public toString(): string {
    return dedent`
      SignaturePredicate
        Public Key: ${HexConverter.encode(this._publicKey)}`;
  }
}
