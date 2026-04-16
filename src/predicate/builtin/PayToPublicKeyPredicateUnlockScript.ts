import { DataHasher } from '../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { Signature } from '../../crypto/secp256k1/Signature.js';
import { SigningService } from '../../crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { ITransaction } from '../../transaction/ITransaction.js';
import { IUnlockScript } from '../IUnlockScript.js';

export class PayToPublicKeyPredicateUnlockScript implements IUnlockScript {
  private constructor(public readonly signature: Signature) {}

  public static async create(
    transaction: ITransaction,
    signingService: SigningService,
  ): Promise<PayToPublicKeyPredicateUnlockScript> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(transaction.sourceStateHash.data),
          CborSerializer.encodeByteString(await transaction.calculateTransactionHash().then((h) => h.data)),
        ),
      )
      .digest();

    return new PayToPublicKeyPredicateUnlockScript(await signingService.sign(hash));
  }

  public static decode(bytes: Uint8Array): PayToPublicKeyPredicateUnlockScript {
    return new PayToPublicKeyPredicateUnlockScript(Signature.decode(bytes));
  }

  public encode(): Uint8Array {
    return this.signature.encode();
  }
}
