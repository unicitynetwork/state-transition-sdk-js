import { IPredicate } from './IPredicate.js';
import { SigningService } from '../crypto/secp256k1/SigningService.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

export class PayToPublicKeyPredicate implements IPredicate {
  public static readonly TYPE: bigint = 0x01n;

  private constructor(private readonly _publicKey: Uint8Array) {
    this._publicKey = new Uint8Array(_publicKey);
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

  // TODO: When aggregator supports predicates, fix following methods

  public static decode(bytes: Uint8Array): PayToPublicKeyPredicate {
    return new PayToPublicKeyPredicate(bytes);
  }

  public encode(): Uint8Array {
    return this._publicKey;
  }

  public toString(): string {
    return dedent`
      PayToPublicKeyPredicate
        Public Key: ${HexConverter.encode(this._publicKey)}`;
  }
}
