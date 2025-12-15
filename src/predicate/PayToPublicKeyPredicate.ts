import { IPredicate } from './IPredicate.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { SigningService } from '../crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { ITransaction } from '../transaction/ITransaction.js';
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

  public static async generateUnlockScript(
    transaction: ITransaction,
    signingService: SigningService,
  ): Promise<Uint8Array> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          await transaction.calculateSourceStateHash().then((hash) => hash.toCBOR()),
          await transaction.calculateTransactionHash().then((hash) => hash.toCBOR()),
        ),
      )
      .digest();

    return signingService.sign(hash).then((signature) => signature.encode());
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
