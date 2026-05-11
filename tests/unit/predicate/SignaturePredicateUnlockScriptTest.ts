import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateUnlockScript } from '../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { SignaturePredicateVerifier } from '../../../src/predicate/builtin/verification/SignaturePredicateVerifier.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { ITransaction } from '../../../src/transaction/ITransaction.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';

/**
 * PR #114 / issue #113 renamed PayToPublicKeyPredicateUnlockScript/Verifier to
 * SignaturePredicateUnlockScript/Verifier. These classes were previously only exercised
 * end-to-end via the BDD suite; this pins their create/verify/round-trip behaviour directly.
 *
 * Contract: the unlock script signs sha256(encodeArray(sourceStateHash.data, transactionHash.data));
 * the verifier checks that signature against the predicate's public key over the same digest.
 */
describe('SignaturePredicateUnlockScript + SignaturePredicateVerifier', () => {
  function makeTx(): ITransaction {
    const sourceStateHash = new DataHash(HashAlgorithm.SHA256, new Uint8Array(32).fill(0x11));
    const transactionHash = new DataHash(HashAlgorithm.SHA256, new Uint8Array(32).fill(0x22));
    return {
      calculateTransactionHash: () => Promise.resolve(transactionHash),
      sourceStateHash,
    } as unknown as ITransaction;
  }

  it('an unlock script created by the owner verifies OK', async () => {
    const signingService = new SigningService(SigningService.generatePrivateKey());
    const tx = makeTx();
    const unlock = await SignaturePredicateUnlockScript.create(tx, signingService);
    const verifier = new SignaturePredicateVerifier();
    const result = await verifier.verify(
      EncodedPredicate.fromPredicate(SignaturePredicate.fromSigningService(signingService)),
      tx.sourceStateHash,
      await tx.calculateTransactionHash(),
      unlock.encode(),
    );
    expect(result.status).toEqual(VerificationStatus.OK);
  });

  it('an unlock script from a different key fails with "Signature verification failed."', async () => {
    const owner = new SigningService(SigningService.generatePrivateKey());
    const attacker = new SigningService(SigningService.generatePrivateKey());
    const tx = makeTx();
    const unlock = await SignaturePredicateUnlockScript.create(tx, attacker);
    const verifier = new SignaturePredicateVerifier();
    const result = await verifier.verify(
      EncodedPredicate.fromPredicate(SignaturePredicate.fromSigningService(owner)),
      tx.sourceStateHash,
      await tx.calculateTransactionHash(),
      unlock.encode(),
    );
    expect(result.status).toEqual(VerificationStatus.FAIL);
    expect(result.message).toContain('Signature verification failed');
  });

  it('verification fails when the transactionHash differs from the one signed', async () => {
    const signingService = new SigningService(SigningService.generatePrivateKey());
    const tx = makeTx();
    const unlock = await SignaturePredicateUnlockScript.create(tx, signingService);
    const verifier = new SignaturePredicateVerifier();
    const tamperedTxHash = new DataHash(HashAlgorithm.SHA256, new Uint8Array(32).fill(0x33));
    const result = await verifier.verify(
      EncodedPredicate.fromPredicate(SignaturePredicate.fromSigningService(signingService)),
      tx.sourceStateHash,
      tamperedTxHash,
      unlock.encode(),
    );
    expect(result.status).toEqual(VerificationStatus.FAIL);
  });

  it('encode/decode round-trips the signature bytes', async () => {
    const signingService = new SigningService(SigningService.generatePrivateKey());
    const unlock = await SignaturePredicateUnlockScript.create(makeTx(), signingService);
    const decoded = SignaturePredicateUnlockScript.decode(unlock.encode());
    expect(HexConverter.encode(decoded.encode())).toEqual(HexConverter.encode(unlock.encode()));
  });
});
