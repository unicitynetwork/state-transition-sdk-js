import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AuthenticatedPartitionView,
  PartitionViewAuthenticator,
} from '../../../../src/api/bft/AuthenticatedPartitionView.js';
import { PartitionView } from '../../../../src/api/bft/PartitionView.js';
import { RootTrustBase } from '../../../../src/api/bft/RootTrustBase.js';
import { ShardId } from '../../../../src/api/bft/ShardId.js';
import { UnicityCertificate } from '../../../../src/api/bft/UnicityCertificate.js';
import { UnicityTreeCertificate } from '../../../../src/api/bft/UnicityTreeCertificate.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { SealVerificationSession } from '../../../../src/api/bft/verification/SealVerificationSession.js';
import { Secp256k1SignatureVerifier } from '../../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';

const PARTITION = 0x0a0b0c0dn;
const DIR = join(process.cwd(), 'tests/fixtures/uc-consolidation/partition-view/v1');

interface IVector {
  readonly enclosingUc: string;
  readonly epoch: number;
  readonly epochStartRound: number;
  readonly networkId: number;
  readonly nodeId: string;
  readonly shards: { readonly uc: string }[];
  readonly sigKey: string;
  readonly view: string;
}

function vector(name: string): IVector {
  return JSON.parse(readFileSync(join(DIR, `assembly-${name}.json`), 'utf8')) as IVector;
}

function trustBase(v: IVector): RootTrustBase {
  return RootTrustBase.fromJSON({
    changeRecordHash: null,
    epoch: String(v.epoch),
    epochStartRound: String(v.epochStartRound),
    networkId: v.networkId,
    previousEntryHash: null,
    quorumThreshold: '1',
    rootNodes: [{ nodeId: v.nodeId, sigKey: v.sigKey, stake: '1' }],
    signatures: {},
    stateHash: '00',
    version: '1',
  });
}

describe('AuthenticatedPartitionView', () => {
  const v = vector('4');
  const viewBytes = HexConverter.decode(v.view);
  const ucBytes = HexConverter.decode(v.enclosingUc);
  let verifier: Secp256k1SignatureVerifier;
  let verifySpy: jest.SpyInstance;
  let session: SealVerificationSession;

  beforeEach(() => {
    verifier = new Secp256k1SignatureVerifier();
    verifySpy = jest.spyOn(verifier, 'verify');
    session = new SealVerificationSession(trustBase(v), new UnicitySealQuorumSignaturesVerificationRule(verifier));
  });

  it('is only obtainable from the authenticator', () => {
    expect(() => new AuthenticatedPartitionView(Symbol('forged') as never, {} as never)).toThrow('can only be created');
  });

  it('yields the Go certificates, immutable to callers', async () => {
    const authenticated = await new PartitionViewAuthenticator(PARTITION, session).authenticate(viewBytes, ucBytes);
    const certificates = authenticated.assembleCertificates();
    expect(certificates.map((uc) => HexConverter.encode(uc.toCBOR()))).toEqual(v.shards.map((s) => s.uc));
    certificates.length = 0;
    expect(authenticated.assembleCertificates()).toHaveLength(4);
    expect(Object.isFrozen(authenticated)).toBe(true);
    const leaves = authenticated.leaves;
    leaves.length = 0;
    expect(authenticated.leaves).toHaveLength(4);
    expect(HexConverter.encode(authenticated.certificateOf(authenticated.scheme[2]).toCBOR())).toEqual(v.shards[2].uc);
    expect(authenticated.authority).toEqual(session.identity);
  });

  it('checks the tree and enclosing leaf before the seal, so an unproven view never reaches authentication', async () => {
    const authenticate = jest.spyOn(session, 'authenticate');
    const view = PartitionView.fromCBOR(viewBytes);
    const leaves = view.leaves;
    const wrong = new PartitionView(view.partitionId, [leaves[1], leaves[0], leaves[2], leaves[3]]);
    await expect(new PartitionViewAuthenticator(PARTITION, session).authenticate(wrong, ucBytes)).rejects.toMatchObject(
      { reason: 'topology' },
    );
    expect(authenticate).not.toHaveBeenCalled();

    const uc = UnicityCertificate.fromCBOR(ucBytes);
    const nil = new UnicityCertificate(
      uc.inputRecord,
      uc.technicalRecordHash,
      uc.shardConfigurationHash,
      uc.shardTreeCertificate,
      new UnicityTreeCertificate(uc.unicityTreeCertificate.partitionIdentifier, [null as never]),
      uc.unicitySeal,
    );
    await expect(new PartitionViewAuthenticator(PARTITION, session).authenticate(view, nil)).rejects.toMatchObject({
      reason: 'tree_mismatch',
    });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('does not authenticate when the tree matches but the anchored authority does not', async () => {
    const other = new SealVerificationSession(
      RootTrustBase.fromJSON({ ...trustBase(v).toJSON(), epoch: String(v.epoch + 1) }),
      new UnicitySealQuorumSignaturesVerificationRule(verifier),
    );
    await expect(
      new PartitionViewAuthenticator(PARTITION, other).authenticate(viewBytes, ucBytes),
    ).rejects.toMatchObject({ reason: 'seal_invalid' });
    await expect(
      new PartitionViewAuthenticator(PARTITION + 1n, session).authenticate(viewBytes, ucBytes),
    ).rejects.toMatchObject({ reason: 'topology' });
  });

  it('memoizes by authority, partition, pins and bytes', async () => {
    const authenticator = new PartitionViewAuthenticator(PARTITION, session);
    const first = await authenticator.authenticate(viewBytes, ucBytes);
    expect(await authenticator.authenticate(viewBytes, ucBytes)).toBe(first);
    expect(verifySpy).toHaveBeenCalledTimes(1);

    const concurrent = new PartitionViewAuthenticator(PARTITION, session);
    const [a, b] = await Promise.all([
      concurrent.authenticate(viewBytes, ucBytes),
      concurrent.authenticate(viewBytes, ucBytes),
    ]);
    expect(a).toBe(b);
  });

  it('includes pins in the identity of the authenticator and of the views it produces', async () => {
    const view = PartitionView.fromCBOR(viewBytes);
    const hashes = view.leaves.map((l) => ({ hash: l.shardConfigurationHash, shard: l.shardId }));
    const plain = new PartitionViewAuthenticator(PARTITION, session);
    const pinned = new PartitionViewAuthenticator(PARTITION, session, { shardConfigurationPins: hashes });
    const otherPins = new PartitionViewAuthenticator(PARTITION, session, {
      shardConfigurationPins: [{ hash: new Uint8Array(32).fill(1), shard: ShardId.fromBits('00') }],
    });
    expect(new Set([plain.identity, pinned.identity, otherPins.identity]).size).toEqual(3);
    expect((await plain.authenticate(view, ucBytes)).policy).not.toEqual(
      (await pinned.authenticate(view, ucBytes)).policy,
    );
    await expect(otherPins.authenticate(view, ucBytes)).rejects.toMatchObject({ reason: 'config_not_admitted' });
    // same pins in another map order are the same policy
    const reordered = new PartitionViewAuthenticator(PARTITION, session, {
      shardConfigurationPins: hashes.slice().reverse(),
    });
    expect(reordered.identity).toEqual(pinned.identity);
  });

  it('keeps initial-state leaves null in the derived certificates', async () => {
    const initial = vector('4-initial');
    const s = new SealVerificationSession(
      trustBase(initial),
      new UnicitySealQuorumSignaturesVerificationRule(verifier),
    );
    const authenticated = await new PartitionViewAuthenticator(PARTITION, s).authenticate(
      HexConverter.decode(initial.view),
      HexConverter.decode(initial.enclosingUc),
    );
    const certificates = authenticated.assembleCertificates();
    expect(certificates.map((uc) => HexConverter.encode(uc.toCBOR()))).toEqual(initial.shards.map((x) => x.uc));
    expect(certificates[1].inputRecord.nullableHash).toBeNull();
    expect(certificates[1].inputRecord.nullableSummaryValue).toBeNull();
  });

  describe('independence of caller owned state', () => {
    const wrongPin = (): { hash: Uint8Array; shard: ShardId }[] => [
      { hash: new Uint8Array(32).fill(1), shard: ShardId.fromBits('00') },
    ];

    it('applies the pins snapshotted at construction, not the caller map afterwards', async () => {
      const pins = wrongPin();
      const authenticator = new PartitionViewAuthenticator(PARTITION, session, { shardConfigurationPins: pins });
      const identity = authenticator.identity;
      pins.length = 0;
      await expect(authenticator.authenticate(viewBytes, ucBytes)).rejects.toMatchObject({
        reason: 'config_not_admitted',
      });
      expect(authenticator.identity).toEqual(identity);
    });

    it('does not let later mutation of pin buffers or maps change the applied policy or the memo', async () => {
      const view = PartitionView.fromCBOR(viewBytes);
      const good = new Uint8Array(view.leaves[0].shardConfigurationHash);
      const pins = [{ hash: good, shard: ShardId.fromBits('00') }];
      const authenticator = new PartitionViewAuthenticator(PARTITION, session, { shardConfigurationPins: pins });
      const identity = authenticator.identity;
      const first = await authenticator.authenticate(viewBytes, ucBytes);

      good[0] ^= 1;
      pins.push({ hash: new Uint8Array(32), shard: ShardId.fromBits('01') });
      expect(authenticator.identity).toEqual(identity);
      expect(await authenticator.authenticate(viewBytes, ucBytes)).toBe(first);
      // a fresh authenticator over the current (mutated) policy is a different policy and rejects
      await expect(
        new PartitionViewAuthenticator(PARTITION, session, { shardConfigurationPins: pins }).authenticate(
          viewBytes,
          ucBytes,
        ),
      ).rejects.toMatchObject({ reason: 'config_not_admitted' });
    });

    it('snapshots the pinned scheme', async () => {
      const scheme = PartitionView.fromCBOR(viewBytes).scheme;
      const authenticator = new PartitionViewAuthenticator(PARTITION, session, { scheme });
      scheme.length = 0;
      await expect(authenticator.authenticate(viewBytes, ucBytes)).resolves.toBeDefined();
    });

    it('snapshots the pinned ShardId objects, not only the array', async () => {
      const scheme = PartitionView.fromCBOR(viewBytes).scheme;
      const authenticator = new PartitionViewAuthenticator(PARTITION, session, { scheme });
      const identity = authenticator.identity;
      // JavaScript callers can write the public length of a retained id
      (scheme[0] as unknown as { length: number }).length = 0;
      (scheme[1] as unknown as { _bits: Uint8Array })._bits.fill(0xff);
      expect(authenticator.identity).toEqual(identity);
      await expect(authenticator.authenticate(viewBytes, ucBytes)).resolves.toBeDefined();
    });

    it('is independent of the buffers the inputs came from', async () => {
      const viewBuffer = Buffer.from(viewBytes);
      const ucBuffer = Buffer.from(ucBytes);
      const authenticator = new PartitionViewAuthenticator(PARTITION, session);
      const pending = authenticator.authenticate(viewBuffer, ucBuffer);
      // reuse of the source buffers while verification is in flight and afterwards
      ucBuffer.fill(0);
      viewBuffer.fill(0);
      const authenticated = await pending;
      expect(authenticated.assembleCertificates().map((uc) => HexConverter.encode(uc.toCBOR()))).toEqual(
        v.shards.map((s) => s.uc),
      );
      expect(HexConverter.encode(authenticated.seal.toCBOR())).toEqual(
        HexConverter.encode(UnicityCertificate.fromCBOR(ucBytes).unicitySeal.toCBOR()),
      );

      // the original valid bytes authenticate to a valid object, not to a cached corrupted one
      const again = await authenticator.authenticate(viewBytes, ucBytes);
      expect(again.assembleCertificates().map((uc) => HexConverter.encode(uc.toCBOR()))).toEqual(
        v.shards.map((s) => s.uc),
      );
    });

    it('is independent of the caller owned objects passed in', async () => {
      const view = PartitionView.fromCBOR(viewBytes);
      const uc = UnicityCertificate.fromCBOR(ucBytes);
      const authenticated = await new PartitionViewAuthenticator(PARTITION, session).authenticate(view, uc);
      // JavaScript callers can write to readonly fields and to buffers behind getters
      (uc.inputRecord as unknown as { timestamp: bigint }).timestamp = 1n;
      expect(authenticated.assembleCertificates().map((c) => HexConverter.encode(c.toCBOR()))).toEqual(
        v.shards.map((s) => s.uc),
      );
    });

    it('hands out independent copies of every nested object', async () => {
      const authenticated = await new PartitionViewAuthenticator(PARTITION, session).authenticate(viewBytes, ucBytes);
      const expected = v.shards.map((s) => s.uc);

      const first = authenticated.assembleCertificates();
      (first[0].inputRecord as unknown as { timestamp: bigint }).timestamp = 1n;
      (first[1].unicitySeal as unknown as { _hash: Uint8Array })._hash.fill(0);
      (first[2].unicityTreeCertificate as unknown as { _steps: unknown[] })._steps.length = 0;
      (authenticated.seal as unknown as { _hash: Uint8Array })._hash.fill(0);
      (authenticated.leaves[0].inputRecord as unknown as { timestamp: bigint }).timestamp = 1n;
      (authenticated.certificateOf(authenticated.scheme[3]).inputRecord as unknown as { timestamp: bigint }).timestamp =
        1n;

      expect(authenticated.assembleCertificates().map((uc) => HexConverter.encode(uc.toCBOR()))).toEqual(expected);
      expect(HexConverter.encode(authenticated.seal.toCBOR())).toEqual(
        HexConverter.encode(UnicityCertificate.fromCBOR(ucBytes).unicitySeal.toCBOR()),
      );
      expect(HexConverter.encode(authenticated.certificateOf(authenticated.scheme[3]).toCBOR())).toEqual(expected[3]);
      expect(HexConverter.encode(PartitionView.fromCBOR(viewBytes).toCBOR())).toEqual(v.view);
      expect(authenticated.leaves[0].inputRecord.timestamp).not.toEqual(1n);
    });
  });

  describe('construction boundary', () => {
    it('exposes no factory on the authenticator or the view', () => {
      for (const target of [PartitionViewAuthenticator, AuthenticatedPartitionView]) {
        const statics = Object.getOwnPropertyNames(target).filter((n) => !['length', 'name', 'prototype'].includes(n));
        expect(statics.filter((n) => typeof (target as unknown as Record<string, unknown>)[n] === 'function')).toEqual(
          [],
        );
      }
      expect((PartitionViewAuthenticator as unknown as Record<string, unknown>).create).toBeUndefined();
    });

    it('exposes no instance worker that skips the snapshot and decode boundary', () => {
      for (const target of [PartitionViewAuthenticator, AuthenticatedPartitionView]) {
        const methods = Object.getOwnPropertyNames(target.prototype).filter((n) => n !== 'constructor');
        expect(methods.sort()).not.toContain('run');
      }
      expect(Object.getOwnPropertyNames(PartitionViewAuthenticator.prototype).sort()).toEqual([
        'authenticate',
        'constructor',
        'identity',
      ]);
      const authenticator = new PartitionViewAuthenticator(PARTITION, session);
      expect((authenticator as unknown as Record<string, unknown>).run).toBeUndefined();
      expect(
        Object.getOwnPropertyNames(authenticator).filter((n) => typeof (authenticator as never)[n] === 'function'),
      ).toEqual([]);
    });

    it('cannot be forged through the emitted JavaScript either', async () => {
      const built = join(process.cwd(), 'lib/api/bft/AuthenticatedPartitionView.js');
      if (!existsSync(built)) {
        return; // only after `npm run build`
      }
      const lib = (await import(built)) as Record<string, Record<string, unknown>>;
      expect(Object.keys(lib).sort()).toEqual(['AuthenticatedPartitionView', 'PartitionViewAuthenticator']);
      expect(lib.PartitionViewAuthenticator.create).toBeUndefined();
      const proto = (lib.PartitionViewAuthenticator as unknown as { prototype: object }).prototype;
      expect(Object.getOwnPropertyNames(proto).sort()).toEqual(['authenticate', 'constructor', 'identity']);
      const Forged = lib.AuthenticatedPartitionView as unknown as new (c: symbol, p: object) => unknown;
      expect(() => new Forged(Symbol('authenticated'), {})).toThrow('can only be created');
    });
  });
});
