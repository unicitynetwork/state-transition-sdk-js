import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The shared maximum-size fixture (tests/vectors/trust-base-v2/README.md), hex fields as in the vectors. */
export interface IMaxEntryFixture {
  readonly bundle: string;
  readonly entry: string;
  readonly entryBytes: number;
  readonly entryId: string;
  readonly genesis: string;
  readonly genesisId: string;
  readonly members: number;
  readonly network: number;
  readonly nodeIdBytes: number;
}

export function loadMaxEntry(): IMaxEntryFixture {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'tests/vectors/trust-base-v2/max-entry/v1/max-entry.json'), 'utf8'),
  ) as IMaxEntryFixture;
}
