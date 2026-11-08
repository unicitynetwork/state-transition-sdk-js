import { RootTrustBaseV2 } from './RootTrustBaseV2.js';
import { TrustBaseEncodingError } from './TrustBaseError.js';
import { CborDeserializer } from '../../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../../serialization/cbor/CborSerializer.js';

/** CBOR tag of the GetTrustBase response (and of a release bundle, which is the same object). */
export const RESPONSE_TAG = 39015n;
/** Version of the GetTrustBase response. */
export const RESPONSE_VERSION = 1n;
/** Number of defined response statuses. */
export const STATUS_COUNT = 8n;

/**
 * The fields of a GetTrustBase response, the entries still embedded verbatim: `[1, network, status, fromEpoch, effectiveEnd, endEntryId|null,
 * [entry...], nextEpoch|null]`. Only the envelope is checked here; each user of the response applies its own rules to the contents.
 */
export interface ITrustBaseResponseFields {
  effectiveEnd: bigint;
  endEntryId: Uint8Array | null;
  entries: Uint8Array[];
  fromEpoch: bigint;
  network: number;
  nextEpoch: bigint | null;
  status: bigint;
}

/**
 * Parse the envelope of a tagged GetTrustBase response.
 *
 * @param {Uint8Array} bytes Tagged response.
 * @param {number} maxEntries Most entries accepted.
 * @returns {ITrustBaseResponseFields} The fields.
 * @throws {TrustBaseEncodingError} If the bytes are not the deterministic envelope or exceed the entry budget.
 */
export function parseTrustBaseResponse(bytes: Uint8Array, maxEntries: number): ITrustBaseResponseFields {
  try {
    const tagged = CborDeserializer.decodeTag(bytes);
    if (tagged.tag !== RESPONSE_TAG) {
      throw new TrustBaseEncodingError(`Tag ${tagged.tag}, expected ${RESPONSE_TAG}.`);
    }

    const fields = CborDeserializer.decodeArray(tagged.data);
    if (fields.length !== 8) {
      throw new TrustBaseEncodingError(`Expected 8 fields, got ${fields.length}.`);
    }

    const uint64 = (data: Uint8Array): bigint => {
      return CborDeserializer.decodeUnsignedInteger(data);
    };

    const version = uint64(fields[0]);
    if (version !== RESPONSE_VERSION) {
      throw new TrustBaseEncodingError(`Version ${version}, expected ${RESPONSE_VERSION}.`);
    }
    const network = uint64(fields[1]);
    // A header network of 0 is not refused here: no entry has network 0 (validate), so the entries cannot match it and the bundle is refused as such.
    if (network > 0xffffn) {
      throw new TrustBaseEncodingError(`Network identifier ${network} above 65535.`);
    }
    const status = uint64(fields[2]);
    if (status >= STATUS_COUNT) {
      throw new TrustBaseEncodingError(`Status ${status} is not defined.`);
    }
    const endEntryId = CborDeserializer.decodeNullable(fields[5], (item) => CborDeserializer.decodeByteString(item));
    if (endEntryId !== null && endEntryId.length !== RootTrustBaseV2.ID_LENGTH) {
      throw new TrustBaseEncodingError(`End id of ${endEntryId.length} bytes.`);
    }
    const entries = CborDeserializer.decodeArray(fields[6]);
    if (entries.length > maxEntries) {
      throw new TrustBaseEncodingError(`${entries.length} entries exceed ${maxEntries}.`);
    }
    const nextEpoch = CborDeserializer.decodeNullable(fields[7], uint64);

    return {
      effectiveEnd: uint64(fields[4]),
      endEntryId,
      entries,
      fromEpoch: uint64(fields[3]),
      network: Number(network),
      nextEpoch,
      status,
    };
  } catch (error) {
    if (error instanceof TrustBaseEncodingError) {
      throw error;
    }
    throw new TrustBaseEncodingError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Encode a GetTrustBase response, the entries embedded verbatim: the inverse of {@link parseTrustBaseResponse}.
 *
 * @param {ITrustBaseResponseFields} fields The fields; `entries` are complete tagged entries.
 * @returns {Uint8Array} Tagged response.
 */
export function encodeTrustBaseResponse(fields: ITrustBaseResponseFields): Uint8Array {
  return CborSerializer.encodeTag(
    RESPONSE_TAG,
    CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(RESPONSE_VERSION),
      CborSerializer.encodeUnsignedInteger(fields.network),
      CborSerializer.encodeUnsignedInteger(fields.status),
      CborSerializer.encodeUnsignedInteger(fields.fromEpoch),
      CborSerializer.encodeUnsignedInteger(fields.effectiveEnd),
      fields.endEntryId === null ? CborSerializer.encodeNull() : CborSerializer.encodeByteString(fields.endEntryId),
      CborSerializer.encodeArray(...fields.entries),
      fields.nextEpoch === null ? CborSerializer.encodeNull() : CborSerializer.encodeUnsignedInteger(fields.nextEpoch),
    ),
  );
}
