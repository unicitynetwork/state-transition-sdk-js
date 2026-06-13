import { BuiltInPredicateType } from '../../../src/predicate/builtin/BuiltInPredicateType.js';
import { BurnPredicate } from '../../../src/predicate/builtin/BurnPredicate.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { PredicateEngine } from '../../../src/predicate/PredicateEngine.js';
import { CborDeserializer } from '../../../src/serialization/cbor/CborDeserializer.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

/**
 * PR #114 / issue #113:
 *  - PayToPublicKeyPredicate was renamed to SignaturePredicate.
 *  - The built-in predicate codes were renumbered: Signature=0x01, Burn=0x02, UnicityId=0x100
 *    (was PayToPublicKey=0x01, UnicityId=0x02, Burn=0x03). This is a wire-format change, so
 *    pin the numeric codes explicitly.
 */
describe('SignaturePredicate (post-PR #114 rename)', () => {
  const SAMPLE_PUBKEY = HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026');

  it('pins the renumbered built-in predicate codes', () => {
    expect(BuiltInPredicateType.Signature).toEqual(0x01);
    expect(BuiltInPredicateType.Burn).toEqual(0x02);
    expect(BuiltInPredicateType.UnicityId).toEqual(0x100);
  });

  it('reports type = Signature (code 0x01) and BUILT_IN engine', () => {
    const predicate = SignaturePredicate.create(SAMPLE_PUBKEY);
    expect(predicate.type).toEqual(BuiltInPredicateType.Signature);
    expect(predicate.engine).toEqual(PredicateEngine.BUILT_IN);
    expect(CborDeserializer.decodeUnsignedInteger(predicate.encodeCode())).toEqual(1n);
  });

  it('round-trips through EncodedPredicate preserving the public key', () => {
    const predicate = SignaturePredicate.create(SAMPLE_PUBKEY);
    const encoded = EncodedPredicate.fromPredicate(predicate);
    const recovered = SignaturePredicate.fromPredicate(EncodedPredicate.fromCBOR(encoded.toCBOR()));
    expect(HexConverter.encode(recovered.publicKey)).toEqual(HexConverter.encode(SAMPLE_PUBKEY));
    expect(recovered.type).toEqual(BuiltInPredicateType.Signature);
  });

  it('rejects an invalid public key', () => {
    expect(() => SignaturePredicate.create(new Uint8Array(33))).toThrow('Invalid public key.');
  });

  it('rejects an EncodedPredicate carrying a non-Signature code (Burn = 0x02)', () => {
    const burn = EncodedPredicate.fromPredicate(BurnPredicate.create(new Uint8Array(34).fill(0xaa)));
    expect(() => SignaturePredicate.fromPredicate(burn)).toThrow(
      `Predicate type must be ${BuiltInPredicateType.Signature}`,
    );
  });
});
