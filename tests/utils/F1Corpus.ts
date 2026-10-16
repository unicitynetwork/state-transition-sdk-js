import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { ShardId } from '../../src/api/bft/ShardId.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { InclusionProofResponse } from '../../src/api/InclusionProofResponse.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { IConsolidationItem } from '../../src/consolidation/ProofConsolidator.js';
import { CborDeserializer } from '../../src/serialization/cbor/CborDeserializer.js';
import { HexConverter } from '../../src/util/HexConverter.js';

export const F1_DIR = join(process.cwd(), 'tests/fixtures/uc-consolidation/f1/v1');

export interface IF1Context {
  readonly master: string;
  readonly networkId: number;
  readonly participants: string[];
  readonly partitionId: number;
  readonly shardConfigs: { hash: string; shard: string }[];
  readonly shards: string[];
}

interface IF1Rpc {
  readonly error?: unknown;
  readonly id: number;
  readonly jsonrpc: string;
  readonly result?: unknown;
}

export interface IF1Responses {
  readonly master: IF1Rpc;
  readonly peers?: { response: IF1Rpc; shard: string }[];
}

export interface IF1Requests {
  readonly evidence: { proof: string; request: string }[];
  readonly master: { requests: string[]; shard: string };
  readonly peers?: { requests: string[]; shard: string }[];
}

export interface IF1Expected {
  readonly base?: string;
  readonly bundle?: { proofs: string[]; shard: string; uc: string }[];
  readonly changedFiles?: string[];
  readonly counters?: { bodyChecks: number; evidenceQuorumChecks: number; leafChecks: number; quorumChecks: number };
  readonly master?: string;
  readonly outcome: string;
  readonly pipelineOutcome?: string;
  readonly rMin?: string;
  readonly rootRound?: string;
  readonly rpc?: { code: number; detail?: string; reason?: string; retryable?: boolean; role: string; shard: string };
  readonly stage: string;
}

export interface IF1Case {
  readonly context: IF1Context;
  readonly expected: IF1Expected;
  readonly name: string;
  readonly partitionView: Uint8Array;
  readonly requests: IF1Requests;
  readonly responses: IF1Responses;
  readonly trustBase: RootTrustBase;
}

function read(dir: string, file: string): Buffer {
  return readFileSync(join(dir, file));
}

function json<T>(dir: string, file: string): T {
  return JSON.parse(read(dir, file).toString('utf8')) as T;
}

/** A negative case holds only its changed files, everything else is the base case's. */
function resolve(name: string, file: string): { dir: string; file: string } {
  const own = join(F1_DIR, name);
  if (existsSync(join(own, file))) {
    return { dir: own, file };
  }
  const base = json<IF1Expected>(own, 'expected.json').base;
  if (!base) {
    throw new Error(`File ${file} missing in ${name}`);
  }
  return { dir: join(F1_DIR, base), file };
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function shardIdOf(bits: string): ShardId {
  const bytes = new Uint8Array(Math.floor(bits.length / 8) + 1);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      bytes[Math.floor(i / 8)] |= 0x80 >> (i % 8);
    }
  }
  bytes[Math.floor(bits.length / 8)] |= 0x80 >> (bits.length % 8);
  return ShardId.decode(bytes);
}

/** Go trust base CBOR: tag 39000 [version, network, epoch, epochStart, [[id, key, stake]...], quorum, ...]. */
export function trustBaseFromCbor(bytes: Uint8Array): RootTrustBase {
  const data = CborDeserializer.decodeArray(CborDeserializer.decodeTag(bytes).data);
  const nodes = CborDeserializer.decodeArray(data[4]).map((n) => {
    const [id, key, stake] = CborDeserializer.decodeArray(n, 3);
    return {
      nodeId: CborDeserializer.decodeTextString(id),
      sigKey: HexConverter.encode(CborDeserializer.decodeByteString(key)),
      stake: CborDeserializer.decodeUnsignedInteger(stake).toString(),
    };
  });
  return RootTrustBase.fromJSON({
    changeRecordHash: null,
    epoch: CborDeserializer.decodeUnsignedInteger(data[2]).toString(),
    epochStartRound: CborDeserializer.decodeUnsignedInteger(data[3]).toString(),
    networkId: Number(CborDeserializer.decodeUnsignedInteger(data[1])),
    previousEntryHash: null,
    quorumThreshold: CborDeserializer.decodeUnsignedInteger(data[5]).toString(),
    rootNodes: nodes,
    signatures: {},
    stateHash: '00',
    version: '1',
  });
}

export function loadCase(name: string): IF1Case {
  const get = <T>(file: string): T => {
    const r = resolve(name, file);
    return json<T>(r.dir, r.file);
  };
  const bytes = (file: string): Uint8Array => {
    const r = resolve(name, file);
    return new Uint8Array(read(r.dir, r.file));
  };
  return {
    context: get<IF1Context>('context.json'),
    expected: json<IF1Expected>(join(F1_DIR, name), 'expected.json'),
    name,
    partitionView: bytes('partition-view.cbor'),
    requests: get<IF1Requests>('requests.json'),
    responses: get<IF1Responses>('responses.json'),
    trustBase: trustBaseFromCbor(bytes('trust-base.cbor')),
  };
}

export function negativeCaseNames(): string[] {
  return readdirSync(join(F1_DIR, 'negative'))
    .sort()
    .map((n) => `negative/${n}`);
}

export function networkOf(context: IF1Context): NetworkId {
  return NetworkId.fromId(context.networkId);
}

/** Certification data inside a Go certification request (tag 39030). */
export function certificationDataOf(requestHex: string): CertificationData {
  const request = CborDeserializer.decodeArray(CborDeserializer.decodeTag(HexConverter.decode(requestHex)).data, 4);
  return CertificationData.fromCBOR(request[2]);
}

export function evidenceOf(requests: IF1Requests): IConsolidationItem[] {
  return requests.evidence.map((e) => {
    const response = InclusionProofResponse.fromCBOR(HexConverter.decode(e.proof));
    if (!response.inclusionProof) {
      throw new Error('Evidence proof is not certified.');
    }
    return { certificationData: certificationDataOf(e.request), proof: response.inclusionProof };
  });
}
