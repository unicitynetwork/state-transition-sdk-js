/**
 * Witness data presented when spending a predicate-locked state.
 * Concrete unlock scripts encode the proof a predicate verifier needs
 * (e.g. a signature for {@link SignaturePredicate}).
 */
export interface IUnlockScript {
  /**
   * @returns Canonical byte encoding of this unlock script.
   */
  encode(): Uint8Array;
}
