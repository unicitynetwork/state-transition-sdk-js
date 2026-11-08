import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  TrustBaseBundleError,
  TrustBaseEncodingError,
  TrustBaseError,
} from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseRange } from '../../../../../src/api/bft/trustbase/TrustBaseRange.js';
import { NetworkId } from '../../../../../src/api/NetworkId.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

interface IAccept {
  readonly effectiveEnd: number;
  readonly endEntryId?: string;
  readonly entryEpochs?: number[];
  readonly fromEpoch: number;
  readonly hex: string;
  readonly name: string;
  readonly nextEpoch?: number;
  readonly status: number;
}

interface IReject {
  readonly error: 'encoding' | 'response';
  readonly hex: string;
  readonly name: string;
}

interface IVectors {
  readonly cases: (IAccept | IReject)[];
  readonly network: number;
}

const vectors = JSON.parse(
  readFileSync(path.join(__dirname, '../../../../vectors/gettrustbase/vectors.json'), 'utf8'),
) as IVectors;
const LIMITS = { maxBytes: 1 << 20, maxEntries: 64 };
const NETWORK = NetworkId.fromId(vectors.network);

const accepts = vectors.cases.filter((c): c is IAccept => !('error' in c));
const rejects = vectors.cases.filter((c): c is IReject => 'error' in c);

describe('GetTrustBase response: shared vectors (bft-core 5d9a8eaa)', () => {
  it.each(accepts)('accepts: $name', async (vector) => {
    const range = await TrustBaseRange.decode(HexConverter.decode(vector.hex), LIMITS, NETWORK);
    expect(range.status).toBe(vector.status);
    expect(range.fromEpoch).toBe(BigInt(vector.fromEpoch));
    expect(range.effectiveEnd).toBe(BigInt(vector.effectiveEnd));
    expect(range.endEntryId === null ? undefined : HexConverter.encode(range.endEntryId)).toBe(vector.endEntryId);
    expect(range.entries.map((entry) => Number(entry.epoch))).toEqual(vector.entryEpochs ?? []);
    expect(range.nextEpoch === null ? undefined : Number(range.nextEpoch)).toBe(vector.nextEpoch);
  });

  it.each(rejects)('rejects ($error): $name', async (vector) => {
    const error: unknown = await TrustBaseRange.decode(HexConverter.decode(vector.hex), LIMITS, NETWORK).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TrustBaseError);
    if (vector.error === 'encoding') {
      expect(error).toBeInstanceOf(TrustBaseEncodingError);
    } else if (vector.name.includes('not a version 2 entry')) {
      // Go labels a junk embedded entry a response failure (the entry decode error is wrapped); here it is the entry's own encoding error.
      expect(error).toBeInstanceOf(TrustBaseEncodingError);
    } else {
      expect(error).toBeInstanceOf(TrustBaseBundleError);
    }
  });

  it('has the cases the rules above are written against', () => {
    expect(accepts.length + rejects.length).toBe(vectors.cases.length);
    expect(rejects.some((c) => c.error === 'encoding')).toBe(true);
    expect(rejects.some((c) => c.error === 'response')).toBe(true);
  });
});
