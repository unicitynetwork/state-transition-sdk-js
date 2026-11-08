import { readFileSync } from 'node:fs';

import { sha256 } from '@noble/hashes/sha2.js';

import { RootTrustBaseV2 } from '../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseHistory } from '../../src/api/bft/trustbase/TrustBaseHistory.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import {
  buildBundle,
  buildEntry,
  IEntryFields,
  parseEntryFields,
  signRecoverable,
} from '../unit/api/bft/trustbase/TrustBaseTestUtils.js';

/** The epoch of the fixtures' genesis entry, and of every seal the fixtures sign. */
export const FIXTURE_EPOCH = 1n;

export interface IFixtureMember {
  readonly nodeId: string;
  readonly publicKey: Uint8Array;
  readonly weight: bigint;
}

/** Fields of a genesis entry (network LOCAL, epoch 1, start round 0) for the given members, sorted by node id as the entry rule requires. */
export function genesisFields(members: readonly IFixtureMember[]): IEntryFields {
  const total = members.reduce((sum, member) => sum + member.weight, 0n);
  return {
    changeRecordHash: null,
    epoch: FIXTURE_EPOCH,
    epochStart: 0n,
    members: [...members]
      .sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1))
      .map((member): [string, Uint8Array, bigint] => [member.nodeId, member.publicKey, member.weight]),
    network: BigInt(NetworkId.LOCAL.id),
    previousEntryId: new Uint8Array(32),
    quorum: (total * 2n) / 3n + 1n,
    signatures: null,
    stateHash: null,
    version: 2n,
  };
}

/** A history holding the genesis of the given members, loaded through `append` like any entry. */
export async function createTrustBaseHistoryOf(members: readonly IFixtureMember[]): Promise<TrustBaseHistory> {
  const genesis = RootTrustBaseV2.decode(buildEntry(genesisFields(members)));
  const history = TrustBaseHistory.create(await genesis.entryId());
  await history.append(genesis);
  return history;
}

/** The one-member history `NODE` with weight 1 and the given key. */
export function createTrustBaseHistory(publicKey: Uint8Array): Promise<TrustBaseHistory> {
  return createTrustBaseHistoryOf([{ nodeId: 'NODE', publicKey, weight: 1n }]);
}

/**
 * A history for a client that is built synchronously: the pin is computed with a synchronous SHA-256, and `ready` settles when the genesis is
 * appended. Await `ready` before verifying against `history`.
 */
export function createTrustBaseHistorySync(publicKey: Uint8Array): { history: TrustBaseHistory; ready: Promise<void> } {
  const bytes = buildEntry(genesisFields([{ nodeId: 'NODE', publicKey, weight: 1n }]));
  const genesis = RootTrustBaseV2.decode(bytes);
  const history = TrustBaseHistory.create(sha256(genesis.sigBytes()));
  return { history, ready: history.append(genesis).then(() => undefined) };
}

/** The genesis entry of the given members, without the history around it. */
export function createTrustBaseEntryOf(members: readonly IFixtureMember[]): RootTrustBaseV2 {
  return RootTrustBaseV2.decode(buildEntry(genesisFields(members)));
}

/**
 * Append the next epoch to a history: the tip's members and weights, a later start round, signed by the named member alone (so the tip must
 * be a one-member entry, or the member's weight a quorum).
 */
export async function appendNextEpoch(
  history: TrustBaseHistory,
  signerNodeId: string,
  signerSecret: Uint8Array,
  startRound: bigint,
): Promise<RootTrustBaseV2> {
  const tip = history.tip;
  if (tip === null) {
    throw new Error('The history is empty.');
  }
  const fields: IEntryFields = {
    ...parseEntryFields(tip.encode()),
    epoch: tip.epoch + 1n,
    epochStart: startRound,
    previousEntryId: await tip.entryId(),
    signatures: null,
  };
  const unsigned = buildEntry(fields);
  const next = RootTrustBaseV2.decode(
    buildEntry({ ...fields, signatures: [[signerNodeId, signRecoverable(unsigned, signerSecret)]] }),
  );
  await history.append(next);
  return next;
}

/** The authority of a corpus, as the single-record JSON the corpora spell it in (uint64 values as decimal strings). */
export interface IAuthorityJson {
  readonly epoch: string;
  readonly epochStartRound: string;
  readonly networkId: number;
  readonly quorumThreshold: string;
  readonly rootNodes: readonly { readonly nodeId: string; readonly sigKey: string; readonly stake: string }[];
}

/**
 * A history holding the one entry a corpus authority spells: its epoch, start round, members and quorum as given (the entry rules still apply).
 * The pin is the entry's own id.
 */
export async function createTrustBaseHistoryFromAuthority(authority: IAuthorityJson): Promise<TrustBaseHistory> {
  const fields: IEntryFields = {
    changeRecordHash: null,
    epoch: BigInt(authority.epoch),
    epochStart: BigInt(authority.epochStartRound),
    members: authority.rootNodes
      .map((node): [string, Uint8Array, bigint] => [node.nodeId, hexBytes(node.sigKey), BigInt(node.stake)])
      .sort((a, b) => (Buffer.from(a[0]).compare(Buffer.from(b[0])) < 0 ? -1 : 1)),
    network: BigInt(authority.networkId),
    previousEntryId: new Uint8Array(32),
    quorum: BigInt(authority.quorumThreshold),
    signatures: null,
    stateHash: null,
    version: 2n,
  };
  const genesis = RootTrustBaseV2.decode(buildEntry(fields));
  const history = TrustBaseHistory.create(await genesis.entryId());
  await history.append(genesis);
  return history;
}

function hexBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

/**
 * A corpus authority file (single-record JSON with the uint64 values as JSON numbers and `0x` keys) as a history: the numbers are quoted before
 * parsing, a double would round them.
 *
 * @param {string} path Authority file.
 * @returns {Promise<TrustBaseHistory>} The history of the one entry.
 */
export function loadAuthorityHistory(path: string): Promise<TrustBaseHistory> {
  const text = readFileSync(path, 'utf8').replace(
    /("(?:epoch|epochStartRound|stake|quorumThreshold)":\s*)(\d+)/g,
    '$1"$2"',
  );
  const json = JSON.parse(text) as IAuthorityJson;
  return createTrustBaseHistoryFromAuthority({
    ...json,
    rootNodes: json.rootNodes.map((node) => ({ ...node, sigKey: node.sigKey.replace(/^0x/, '') })),
  });
}

/** The complete bundle (tag 39015, status OK, genesis to tip) of a history, as the file a deployment under test serves. */
export async function bundleOfHistory(history: TrustBaseHistory): Promise<Uint8Array> {
  const tip = history.tip;
  if (tip === null) {
    throw new Error('The history is empty.');
  }
  const first = history.entries[0];
  return buildBundle({
    effectiveEnd: tip.epoch,
    endEntryId: await tip.entryId(),
    entries: history.entries.map((entry) => entry.encode()),
    fromEpoch: first.epoch,
    network: BigInt(tip.networkId.id),
    nextEpoch: null,
    status: 0n,
    version: 1n,
  });
}

/** The single-record JSON the released 3.0.1 client reads, for the first entry of a history (the compat runners drive that client). */
export function legacyTrustBaseJson(history: TrustBaseHistory): Record<string, unknown> {
  const entry = history.entries[0];
  return {
    changeRecordHash: null,
    epoch: entry.epoch.toString(),
    epochStartRound: entry.epochStartRound.toString(),
    networkId: entry.networkId.id,
    previousEntryHash: null,
    quorumThreshold: entry.quorumThreshold.toString(),
    rootNodes: entry.members.map((member) => ({
      nodeId: member.nodeId,
      sigKey: Buffer.from(member.sigKey).toString('hex'),
      stake: member.weight.toString(),
    })),
    signatures: {},
    stateHash: '00',
    version: '1',
  };
}
