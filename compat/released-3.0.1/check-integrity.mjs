// Verifies that this directory is wired to the RELEASED package and nothing else: the pinned version, the recorded npm
// integrity, that the lock file agrees and that the installed tree is the one npm recorded for it (not a link or a local
// copy). `npm ci --ignore-scripts` makes npm itself verify the tarball against the lock integrity. Run before the compatibility run; `run.mjs` calls it too.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASED = Object.freeze({
  // recorded from `npm view` for the report; npm does not ship it in the installed manifest, so it is not checked
  gitHead: 'f5f0737306901215860aa920a6ab570b699efba8',
  integrity: 'sha512-ND4mW7nQjgr8yDdxvHNFheHH3gPijD4y0NS7XU2YPzjsdyDs4LDCYlRG/ZSSEDbz3xVgMh1biL3BY60nGPIsXQ==',
  name: '@unicitylabs/state-transition-sdk',
  tarball: 'https://registry.npmjs.org/@unicitylabs/state-transition-sdk/-/state-transition-sdk-3.0.1.tgz',
  version: '3.0.1',
});

/** @returns {string[]} Problems found, empty if the wiring is the released package. */
export function integrityProblems(dir = dirname(fileURLToPath(import.meta.url))) {
  const problems = [];
  const read = (...p) => JSON.parse(readFileSync(join(dir, ...p), 'utf8'));
  const manifest = read('package.json');
  if (manifest.dependencies?.[RELEASED.name] !== RELEASED.version) {
    problems.push(`package.json must pin ${RELEASED.name} to exactly ${RELEASED.version}`);
  }
  const entry = read('package-lock.json').packages?.[`node_modules/${RELEASED.name}`];
  if (!entry) {
    problems.push('package-lock.json has no entry for the package');
  } else {
    if (entry.version !== RELEASED.version) problems.push(`lock version ${entry.version}`);
    if (entry.integrity !== RELEASED.integrity) problems.push(`lock integrity ${entry.integrity}`);
    if (entry.resolved !== RELEASED.tarball) problems.push(`lock tarball ${entry.resolved}`);
  }
  // The installed tree must be what npm installed from the pinned lock entry: a real directory (no symlink from `npm
  // link` or a local build) whose recorded origin in node_modules/.package-lock.json is the pinned tarball and integrity.
  const installedDir = join(dir, 'node_modules', ...RELEASED.name.split('/'));
  try {
    if (
      lstatSync(installedDir).isSymbolicLink() ||
      realpathSync(installedDir) !== join(realpathSync(dir), 'node_modules', ...RELEASED.name.split('/'))
    ) {
      problems.push('the installed package is a symlink or lies outside this directory');
    }
    const installed = read('node_modules', ...RELEASED.name.split('/'), 'package.json');
    if (installed.version !== RELEASED.version) problems.push(`installed version ${installed.version}`);
    const hidden = read('node_modules', '.package-lock.json').packages?.[`node_modules/${RELEASED.name}`];
    if (
      hidden?.integrity !== RELEASED.integrity ||
      hidden?.resolved !== RELEASED.tarball ||
      hidden?.version !== RELEASED.version
    ) {
      problems.push(
        'node_modules/.package-lock.json does not record the pinned tarball and integrity: reinstall with `npm ci --ignore-scripts`',
      );
    }
  } catch {
    problems.push('package not installed: run `npm ci --ignore-scripts` in this directory');
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = integrityProblems();
  if (problems.length > 0) {
    console.error(`NOT the released ${RELEASED.name}@${RELEASED.version}:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(
    `${RELEASED.name}@${RELEASED.version} ${RELEASED.integrity} (installed from the pinned lock entry; npm ci verified the tarball)`,
  );
}
