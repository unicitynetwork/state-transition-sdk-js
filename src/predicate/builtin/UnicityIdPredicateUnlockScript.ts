import { SignaturePredicateUnlockScript } from './SignaturePredicateUnlockScript.js';
import { UnicityIdPredicate } from './UnicityIdPredicate.js';
import { SigningService } from '../../crypto/secp256k1/SigningService.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { ITransaction } from '../../transaction/ITransaction.js';
import { TokenId } from '../../transaction/TokenId.js';
import { UnicityIdToken } from '../../unicity-id/UnicityIdToken.js';
import { IUnlockScript } from '../IUnlockScript.js';

/**
 * Unlock script for {@link UnicityIdPredicate}: a signed unlock script
 * bundled with the unicity-id token that authorizes the spend.
 */
export class UnicityIdPredicateUnlockScript implements IUnlockScript {
  private constructor(
    private readonly _unlockScript: Uint8Array,
    public readonly token: UnicityIdToken,
  ) {
    this._unlockScript = new Uint8Array(_unlockScript);
  }

  /**
   * @returns {Uint8Array} Copy of the inner signature unlock script bytes.
   */
  public get unlockScript(): Uint8Array {
    return new Uint8Array(this._unlockScript);
  }

  /**
   * Build an unlock script that proves the spender owns `token`, the
   * unicity-id token bound to the predicate.
   *
   * @param {UnicityIdToken} token Unicity-id token authorizing the spend.
   * @param {ITransaction} transaction Transaction being unlocked.
   * @param {SigningService} signingService Service holding the private key.
   * @returns {Promise<UnicityIdPredicateUnlockScript>} Signed unlock script.
   * @throws {Error} If the token's id does not match the predicate's UnicityId.
   */
  public static async create(
    token: UnicityIdToken,
    transaction: ITransaction,
    signingService: SigningService,
  ): Promise<UnicityIdPredicateUnlockScript> {
    const predicate = UnicityIdPredicate.fromPredicate(transaction.lockScript);
    const tokenId = await TokenId.fromSalt(token.genesis.networkId, await predicate.unicityId.toTokenSalt());
    if (!token.id.equals(tokenId)) {
      throw new Error('Invalid Unicity ID for transaction');
    }

    const unlockScript = await SignaturePredicateUnlockScript.create(transaction, signingService);
    return new UnicityIdPredicateUnlockScript(unlockScript.encode(), token);
  }

  /**
   * Decode a UnicityIdPredicateUnlockScript from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {Promise<UnicityIdPredicateUnlockScript>} Decoded unlock script.
   */
  public static async decode(bytes: Uint8Array): Promise<UnicityIdPredicateUnlockScript> {
    const [unlockScriptBytes, tokenBytes] = CborDeserializer.decodeArray(bytes);
    return new UnicityIdPredicateUnlockScript(
      CborDeserializer.decodeByteString(unlockScriptBytes),
      await UnicityIdToken.fromCBOR(tokenBytes),
    );
  }

  /**
   * @inheritDoc
   */
  public encode(): Uint8Array {
    return CborSerializer.encodeArray(CborSerializer.encodeByteString(this._unlockScript), this.token.toCBOR());
  }
}
