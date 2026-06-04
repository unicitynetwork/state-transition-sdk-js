/**
 * Marker for objects that can serialize themselves to canonical CBOR bytes.
 */
export interface ICborSerializable {
  /**
   * @returns CBOR-encoded representation of this object.
   */
  toCBOR(): Uint8Array;
}
