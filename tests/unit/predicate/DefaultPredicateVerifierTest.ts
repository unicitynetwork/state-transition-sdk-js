import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { BuiltInPredicateType } from '../../../src/predicate/builtin/BuiltInPredicateType.js';
import { UnicityIdPredicate } from '../../../src/predicate/builtin/UnicityIdPredicate.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { UnicityId } from '../../../src/unicity-id/UnicityId.js';

/**
 * PR #114 / issue #113: PredicateVerifierService.create() / DefaultBuiltInPredicateVerifier.create()
 * no longer take (verifier, trustBase) and no longer register UnicityIdPredicateVerifier by default —
 * only SignaturePredicateVerifier. A caller that needs unicity-id verification must register
 * UnicityIdPredicateVerifier(predicateVerifier, trustBase, issuerPublicKey) explicitly.
 *
 * This test documents the new default: verifying a UnicityIdPredicate-locked artefact with the
 * default service throws "Unsupported predicate type for verification." (synchronously, before any
 * promise is produced).
 */
describe('Default PredicateVerifierService (post-PR #114)', () => {
  const DUMMY_HASH = new DataHash(HashAlgorithm.SHA256, new Uint8Array(32));

  it('does not register UnicityIdPredicateVerifier — verifying a UnicityIdPredicate lock script throws', () => {
    const verifier = PredicateVerifierService.create();
    const encoded = EncodedPredicate.fromPredicate(UnicityIdPredicate.create(new UnicityId('alice', 'bdd/test')));
    expect(BuiltInPredicateType.UnicityId).toEqual(0x100);
    expect(() => verifier.verify(encoded, DUMMY_HASH, DUMMY_HASH, new Uint8Array(0))).toThrow(
      'Unsupported predicate type for verification.',
    );
  });
});
