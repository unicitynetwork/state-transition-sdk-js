import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CORE = 'src/api/bft/trustbase';

describe('trust-base core', () => {
  it('imports no filesystem, process or browser-storage API, so browser builds stay clean', () => {
    const files = readdirSync(join(process.cwd(), CORE)).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const name of files) {
      const source = readFileSync(join(process.cwd(), CORE, name), 'utf8');
      expect([name, /from '(node:|fs|path|os|crypto)/.test(source)]).toEqual([name, false]);
      expect([name, /\b(localStorage|indexedDB|sessionStorage)\b/.test(source)]).toEqual([name, false]);
    }
  });
});
