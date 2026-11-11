import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { IReleasePin } from '../../../../../src/api/bft/trustbase/ReleasePin.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseBundle } from '../../../../../src/api/bft/trustbase/TrustBaseBundle.js';
import { CborDeserializer } from '../../../../../src/serialization/cbor/CborDeserializer.js';
import { CborMap } from '../../../../../src/serialization/cbor/CborMap.js';
import { CborMapEntry } from '../../../../../src/serialization/cbor/CborMapEntry.js';
import { CborSerializer } from '../../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

/**
 * The shared V2 trust-base vectors, vendored byte for byte from ristik/bft-go-base, branch utb/upstream-v2, commit c202b48,
 * testdata/trust-base-v2/v1/vectors.json (see tests/vectors/trust-base-v2/README.md).
 */
export interface ITrustBaseVectors {
  readonly bundles: { readonly entryIds: string[]; readonly hex: string; readonly name: string }[];
  readonly decode: {
    readonly errorClass?: string;
    readonly hex: string;
    readonly name: string;
    readonly valid: boolean;
  }[];
  readonly entries: {
    readonly entryId: string;
    readonly hex: string;
    readonly name: string;
    readonly sigBytes: string;
  }[];
}

export function loadVectors(): ITrustBaseVectors {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'tests/vectors/trust-base-v2/vectors.json'), 'utf8'),
  ) as ITrustBaseVectors;
}

export function vectorEntry(name: string): Uint8Array {
  const entry = loadVectors().entries.find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`No vector entry ${name}`);
  }
  return HexConverter.decode(entry.hex);
}

/**
 * The fields of an entry, parsed here at the raw CBOR level and independent of the class under test, so a test can change exactly one field.
 */
export interface IEntryFields {
  changeRecordHash: Uint8Array | null;
  epoch: bigint;
  epochStart: bigint;
  members: [string, Uint8Array, bigint][];
  network: bigint;
  previousEntryId: Uint8Array;
  quorum: bigint;
  signatures: [string, Uint8Array][] | null;
  stateHash: Uint8Array | null;
  version: bigint;
}

export function parseEntryFields(bytes: Uint8Array): IEntryFields {
  const f = CborDeserializer.decodeArray(CborDeserializer.decodeTag(bytes).data, 10);
  const hash = (data: Uint8Array): Uint8Array | null =>
    CborDeserializer.decodeNullable(data, (x) => CborDeserializer.decodeByteString(x));
  return {
    changeRecordHash: hash(f[7]),
    epoch: CborDeserializer.decodeUnsignedInteger(f[2]),
    epochStart: CborDeserializer.decodeUnsignedInteger(f[3]),
    members: CborDeserializer.decodeArray(f[4]).map((m): [string, Uint8Array, bigint] => {
      const x = CborDeserializer.decodeArray(m, 3);
      return [
        CborDeserializer.decodeTextString(x[0]),
        CborDeserializer.decodeByteString(x[1]),
        CborDeserializer.decodeUnsignedInteger(x[2]),
      ];
    }),
    network: CborDeserializer.decodeUnsignedInteger(f[1]),
    previousEntryId: CborDeserializer.decodeByteString(f[8]),
    quorum: CborDeserializer.decodeUnsignedInteger(f[5]),
    signatures: CborDeserializer.decodeNullable(f[9], (x) =>
      CborDeserializer.decodeMap(x).map((e): [string, Uint8Array] => [
        CborDeserializer.decodeTextString(e.key),
        CborDeserializer.decodeByteString(e.value),
      ]),
    ),
    stateHash: hash(f[6]),
    version: CborDeserializer.decodeUnsignedInteger(f[0]),
  };
}

export function buildEntry(f: IEntryFields): Uint8Array {
  const hash = (h: Uint8Array | null): Uint8Array =>
    h === null ? CborSerializer.encodeNull() : CborSerializer.encodeByteString(h);
  return CborSerializer.encodeTag(
    39000n,
    CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(f.version),
      CborSerializer.encodeUnsignedInteger(f.network),
      CborSerializer.encodeUnsignedInteger(f.epoch),
      CborSerializer.encodeUnsignedInteger(f.epochStart),
      CborSerializer.encodeArray(
        ...f.members.map(([id, key, weight]) =>
          CborSerializer.encodeArray(
            CborSerializer.encodeTextString(id),
            CborSerializer.encodeByteString(key),
            CborSerializer.encodeUnsignedInteger(weight),
          ),
        ),
      ),
      CborSerializer.encodeUnsignedInteger(f.quorum),
      hash(f.stateHash),
      hash(f.changeRecordHash),
      CborSerializer.encodeByteString(f.previousEntryId),
      f.signatures === null
        ? CborSerializer.encodeNull()
        : CborSerializer.encodeMap(
            new CborMap(
              f.signatures.map(
                ([id, signature]) =>
                  new CborMapEntry(CborSerializer.encodeTextString(id), CborSerializer.encodeByteString(signature)),
              ),
            ),
          ),
    ),
  );
}

/**
 * A bundle header around entries embedded verbatim.
 */
export interface IBundleFields {
  effectiveEnd: bigint;
  endEntryId: Uint8Array | null;
  entries: Uint8Array[];
  fromEpoch: bigint;
  network: bigint;
  nextEpoch: bigint | null;
  status: bigint;
  version: bigint;
}

export function parseBundleFields(bytes: Uint8Array): IBundleFields {
  const f = CborDeserializer.decodeArray(CborDeserializer.decodeTag(bytes).data, 8);
  return {
    effectiveEnd: CborDeserializer.decodeUnsignedInteger(f[4]),
    endEntryId: CborDeserializer.decodeNullable(f[5], (x) => CborDeserializer.decodeByteString(x)),
    entries: CborDeserializer.decodeArray(f[6]),
    fromEpoch: CborDeserializer.decodeUnsignedInteger(f[3]),
    network: CborDeserializer.decodeUnsignedInteger(f[1]),
    nextEpoch: CborDeserializer.decodeNullable(f[7], (x) => CborDeserializer.decodeUnsignedInteger(x)),
    status: CborDeserializer.decodeUnsignedInteger(f[2]),
    version: CborDeserializer.decodeUnsignedInteger(f[0]),
  };
}

export function buildBundle(f: IBundleFields): Uint8Array {
  return CborSerializer.encodeTag(
    39015n,
    CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(f.version),
      CborSerializer.encodeUnsignedInteger(f.network),
      CborSerializer.encodeUnsignedInteger(f.status),
      CborSerializer.encodeUnsignedInteger(f.fromEpoch),
      CborSerializer.encodeUnsignedInteger(f.effectiveEnd),
      f.endEntryId === null ? CborSerializer.encodeNull() : CborSerializer.encodeByteString(f.endEntryId),
      CborSerializer.encodeArray(...f.entries),
      f.nextEpoch === null ? CborSerializer.encodeNull() : CborSerializer.encodeUnsignedInteger(f.nextEpoch),
    ),
  );
}

export function replaceBytes(data: Uint8Array, from: string, to: string): Uint8Array {
  const hex = HexConverter.encode(data);
  const index = hex.indexOf(from);
  if (index < 0 || hex.indexOf(from, index + 1) >= 0) {
    throw new Error(`Pattern ${from} must occur exactly once`);
  }
  return HexConverter.decode(hex.slice(0, index) + to + hex.slice(index + from.length));
}

/**
 * Test keys of the shared vectors: member "a".."d" has the private key of 32 bytes of value 1..4. They sign nothing real.
 *
 * @param {string} name Member name, a..d.
 * @returns {Uint8Array} Private key.
 */
export function testSecret(name: string): Uint8Array {
  return new Uint8Array(32).fill(name.charCodeAt(0) - 'a'.charCodeAt(0) + 1);
}

/**
 * A recoverable signature in the wire form `r || s || recovery` over SHA-256 of `data` (deterministic, RFC 6979).
 */
export function signRecoverable(data: Uint8Array, secret: Uint8Array): Uint8Array {
  const signature = secp256k1.sign(data, secret, { format: 'recovered' });
  return new Uint8Array([...signature.slice(1), signature[0]]);
}

/**
 * The same signature with its s replaced by N - s and the recovery id flipped: it still recovers the signer's key but is high-S.
 */
export function toHighS(signature: Uint8Array): Uint8Array {
  const s = BigInt('0x' + HexConverter.encode(signature.slice(32, 64)));
  const flipped = (secp256k1.Point.Fn.ORDER - s).toString(16).padStart(64, '0');
  return new Uint8Array([...signature.slice(0, 32), ...HexConverter.decode(flipped), signature[64] ^ 1]);
}

/**
 * An entry signed by the named test members over its own sigBytes.
 */
export function signEntry(fields: IEntryFields, signers: string[]): Uint8Array {
  const unsigned = buildEntry({ ...fields, signatures: null });
  return buildEntry({
    ...fields,
    signatures: signers.map((name): [string, Uint8Array] => [name, signRecoverable(unsigned, testSecret(name))]),
  });
}

/** The three-entry vector as a page of epochs 2 and 3 (from epoch 2, no cursor). */
export function rangeFields(): IBundleFields {
  const vector = loadVectors().bundles.find((candidate) => candidate.name.startsWith('three'));
  if (!vector) {
    throw new Error('No three-entry bundle vector');
  }
  const f = parseBundleFields(HexConverter.decode(vector.hex));
  return { ...f, entries: f.entries.slice(1), fromEpoch: 2n };
}

/**
 * Options of {@link buildChain}: `forkAt`/`tag` give every entry from that index on another state hash (another valid history sharing the prefix
 * before it); `network` builds another network; `signers` names who signs each entry (default a, b, c).
 */
export interface IChainOptions {
  forkAt?: number;
  network?: bigint;
  signers?: string[] | ((index: number) => string[]);
  tag?: number;
}

/**
 * A signed chain of `length` entries from the vectors' genesis, each signed by members of its predecessor (same committee throughout).
 */
export async function buildChain(length: number, options: IChainOptions = {}): Promise<RootTrustBaseV2[]> {
  const genesis = parseEntryFields(vectorEntry('genesis'));
  const template = parseEntryFields(vectorEntry('epoch2-signed-abc'));
  const network = options.network ?? genesis.network;
  const hashOf = (index: number): Uint8Array | null =>
    options.forkAt !== undefined && index >= options.forkAt
      ? new Uint8Array(32).fill(options.tag ?? 0xee)
      : template.stateHash;
  const entries: RootTrustBaseV2[] = [
    RootTrustBaseV2.decode(
      buildEntry({ ...genesis, network, stateHash: options.forkAt === 0 ? hashOf(0) : genesis.stateHash }),
    ),
  ];
  for (let index = 1; index < length; index++) {
    const fields: IEntryFields = {
      ...template,
      epoch: genesis.epoch + BigInt(index),
      epochStart: genesis.epochStart + BigInt(index) * 10n,
      network,
      previousEntryId: await entries[index - 1].entryId(),
      stateHash: hashOf(index),
    };
    const signers =
      typeof options.signers === 'function' ? options.signers(index) : (options.signers ?? ['a', 'b', 'c']);
    entries.push(RootTrustBaseV2.decode(signEntry(fields, signers)));
  }
  return entries;
}

/** A release pin whose embedded bundle is the first `pinnedLength` entries of the chain. */
export async function buildPin(chain: RootTrustBaseV2[], pinnedLength: number): Promise<IReleasePin> {
  const embedded = chain.slice(0, pinnedLength);
  const bundle = await TrustBaseBundle.encode(embedded);
  return {
    bundleSha256: sha256(bundle),
    embeddedBundle: bundle,
    genesisEntryId: await embedded[0].entryId(),
    genesisEpoch: embedded[0].epoch,
    networkId: embedded[0].networkId,
    pinnedEntryId: await embedded[embedded.length - 1].entryId(),
    pinnedEpoch: embedded[embedded.length - 1].epoch,
  };
}
