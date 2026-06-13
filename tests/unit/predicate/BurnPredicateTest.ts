import { BurnPredicate } from '../../../src/predicate/builtin/BurnPredicate.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { PredicateEngine } from '../../../src/predicate/PredicateEngine.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

/**
 * PR #110 — BurnPredicate is the destination predicate for split burns.
 * This test pins its reference stability:
 *   - same reason (aggregation root imprint) → same canonical CBOR
 *   - different reasons → different canonical CBOR
 *   - round-trip via EncodedPredicate preserves type and reason bytes
 */
describe('BurnPredicate', () => {
  const reasonA = new Uint8Array(32).fill(0xaa);
  const reasonB = new Uint8Array(32).fill(0xbb);

  it('two BurnPredicates from the same reason encode identically', () => {
    const p1 = BurnPredicate.create(reasonA);
    const p2 = BurnPredicate.create(reasonA);
    const e1 = HexConverter.encode(EncodedPredicate.fromPredicate(p1).toCBOR());
    const e2 = HexConverter.encode(EncodedPredicate.fromPredicate(p2).toCBOR());
    expect(e1).toEqual(e2);
  });

  it('BurnPredicates from different reasons encode differently', () => {
    const p1 = BurnPredicate.create(reasonA);
    const p2 = BurnPredicate.create(reasonB);
    const e1 = HexConverter.encode(EncodedPredicate.fromPredicate(p1).toCBOR());
    const e2 = HexConverter.encode(EncodedPredicate.fromPredicate(p2).toCBOR());
    expect(e1).not.toEqual(e2);
  });

  it('round-trips through EncodedPredicate without loss of reason bytes', () => {
    const p1 = BurnPredicate.create(reasonA);
    const encoded = EncodedPredicate.fromPredicate(p1);
    const recovered = BurnPredicate.fromPredicate(encoded);
    expect(HexConverter.encode(recovered.reason)).toEqual(HexConverter.encode(reasonA));
    expect(recovered.engine).toEqual(PredicateEngine.BUILT_IN);
  });
});
