import { PayToPublicKeyPredicate } from './PayToPublicKeyPredicate.js';
import { UnicityIdPredicate } from './UnicityIdPredicate.js';
import { SigningService } from '../../crypto/secp256k1/SigningService.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { ITransaction } from '../../transaction/ITransaction.js';
import { TokenId } from '../../transaction/TokenId.js';
import { UnicityIdToken } from '../../unicity-id/UnicityIdToken.js';

// TODO: Move token out of unlock script.
export class UnicityIdPredicateUnlockScript {
  private constructor(
    private readonly _unlockScript: Uint8Array,
    public readonly token: UnicityIdToken,
  ) {
    this._unlockScript = new Uint8Array(_unlockScript);
  }

  public get unlockScript(): Uint8Array {
    return new Uint8Array(this._unlockScript);
  }

  public static async create(
    token: UnicityIdToken,
    transaction: ITransaction,
    signingService: SigningService,
  ): Promise<Uint8Array> {
    const predicate = UnicityIdPredicate.fromCBOR(transaction.lockScript.toCBOR());
    if (!token.id.equals(await TokenId.fromUnicityId(predicate.unicityId))) {
      throw new Error('Invalid Unicity ID for transaction');
    }

    return new UnicityIdPredicateUnlockScript(
      await PayToPublicKeyPredicate.generateUnlockScript(transaction, signingService),
      token,
    ).toCBOR();
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<UnicityIdPredicateUnlockScript> {
    const [unlockScriptBytes, tokenBytes] = CborDeserializer.decodeArray(bytes);
    return new UnicityIdPredicateUnlockScript(
      CborDeserializer.decodeByteString(unlockScriptBytes),
      await UnicityIdToken.fromCBOR(tokenBytes),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(CborSerializer.encodeByteString(this.unlockScript), this.token.toCBOR());
  }
}
