import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('consolidation is never automatic', () => {
  const files = sources(join(process.cwd(), 'src'));
  const outside = files.filter(
    (f) =>
      !f.includes('/src/consolidation/') &&
      !f.endsWith('IBatchAggregatorClient.ts') &&
      !f.endsWith('AggregatorClient.ts'),
  );

  it('no SDK operation calls the batch proof method or the consolidation client', () => {
    for (const file of outside) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/getInclusionProofs|TokenProofClient|ProofConsolidator|ShardRouting/);
    }
  });

  it('introduces no automatic policy', () => {
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/consolidat\w*\s*[:=]\s*['"]auto['"]|\bauto\b.*consolidat/i);
    }
  });

  it('the aggregator client only calls the batch method from its own batch entry point', () => {
    const text = readFileSync(join(process.cwd(), 'src/api/AggregatorClient.ts'), 'utf8');
    expect(text.match(/'get_inclusion_proofs\.v1'/g)).toHaveLength(1);
    const single = text.slice(
      text.indexOf('public async getInclusionProof('),
      text.indexOf('public async getInclusionProofs('),
    );
    expect(single).not.toContain('get_inclusion_proofs.v1');
  });
});
