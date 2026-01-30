import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { PayToPublicKeyPredicate } from '../../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PayToScriptHash } from '../../../src/transaction/PayToScriptHash.js';

describe('PayToScriptHash', () => {
  it('should correctly result initial hash with fromString', async () => {
    const predicate = PayToPublicKeyPredicate.create(new SigningService(SigningService.generatePrivateKey()));
    const scriptHash = await PayToScriptHash.create(predicate);
    await expect(PayToScriptHash.fromString(scriptHash.toString()).then((hash) => hash.toString())).resolves.toEqual(
      scriptHash.toString(),
    );
  });
});
