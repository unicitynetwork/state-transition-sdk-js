import { InputRecord } from '../../../src/api/bft/InputRecord.js';
import { UnicityCertificate } from '../../../src/api/bft/UnicityCertificate.js';
import { UnicitySealHashMatchesWithRootHashRule } from '../../../src/api/bft/verification/rule/UnicitySealHashMatchesWithRootHashRule.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import {
  OperationUnicityCertificateVerifier,
  UnicityCertificateVerifier,
} from '../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProof } from '../../../src/api/InclusionProof.js';
import { ShardRouting } from '../../../src/consolidation/ShardRouting.js';
import { TokenProofClient } from '../../../src/consolidation/TokenProofClient.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { authorityIdentityBuildCount } from '../../../src/internal/bft/authorityIdentity.js';
import { CborDeserializer } from '../../../src/serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { Token } from '../../../src/transaction/Token.js';
import { IVerificationContext } from '../../../src/transaction/verification/IVerificationContext.js';
import { VerificationContext } from '../../../src/transaction/verification/VerificationContext.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';
import { IScenario, NestedTokenJustification, scenario } from '../../utils/ConsolidationScenario.js';
import { shardIdFromBits, WORLD_PARTITION } from '../../utils/ShardedWorld.js';

jest.setTimeout(180_000);

function proofsOf(token: Token): InclusionProof[] {
  return [token.genesis, ...token.transactions].map((t) => t.inclusionProof);
}

function distinct(items: Uint8Array[]): number {
  return new Set(items.map((b) => HexConverter.encode(b))).size;
}

function distinctUcs(tokens: Token[]): number {
  return distinct(tokens.flatMap(proofsOf).map((p) => p.unicityCertificate.toCBOR()));
}

function distinctSeals(tokens: Token[]): number {
  return distinct(tokens.flatMap(proofsOf).map((p) => p.unicityCertificate.unicitySeal.toCBOR()));
}

function withVerifier(context: IVerificationContext, verifier: UnicityCertificateVerifier): IVerificationContext {
  return new VerificationContext(
    context.trustBase,
    context.predicateVerifier,
    verifier,
    context.mintJustificationVerifier,
    context.tokenIssuanceVerifier,
  );
}

/** The default verifier: token verification runs it as one operation. */
function plainVerifier(signatureVerifier: Secp256k1SignatureVerifier): UnicityCertificateVerifier {
  return new UnicityCertificateVerifier(new UnicitySealQuorumSignaturesVerificationRule(signatureVerifier));
}

/** An injected verifier that customizes nothing but is not the default class: no sharing, the slow reference model. */
class ReferenceVerifier extends UnicityCertificateVerifier {}

function referenceVerifier(signatureVerifier: Secp256k1SignatureVerifier): UnicityCertificateVerifier {
  return new ReferenceVerifier(new UnicitySealQuorumSignaturesVerificationRule(signatureVerifier));
}

async function consolidated(s: IScenario, token: Token): Promise<Token> {
  const routing = new ShardRouting({
    endpoints: s.world.bits.map((b) => ({ client: s.world.client(b), shard: shardIdFromBits(b) })),
    partitionId: WORLD_PARTITION,
    scheme: s.world.scheme,
  });
  const result = await new TokenProofClient({ routing, verificationContext: s.context }).consolidate(token);
  if (result.status !== 'consolidated') {
    throw new Error('expected consolidation');
  }
  return result.token;
}

describe('token verification work', () => {
  afterEach(() => jest.restoreAllMocks());

  const lengths = [1, 2, 4, 8];

  it('checks one body and one quorum for a consolidated single shard history, however long it is', async () => {
    for (const transfers of lengths) {
      const s = await scenario(0);
      const token = await consolidated(s, await s.history(transfers));
      const proofs = transfers + 1;
      expect(distinctUcs([token])).toEqual(1);

      // slow reference model: no sharing at all
      const signatureVerifier = new Secp256k1SignatureVerifier();
      const quorumCalls = jest.spyOn(signatureVerifier, 'verify');
      const bodyCalls = jest.spyOn(UnicitySealHashMatchesWithRootHashRule, 'verify');
      const reference = await token.verify(withVerifier(s.context, referenceVerifier(signatureVerifier)));
      expect(reference.status).toEqual(VerificationStatus.OK);
      expect(bodyCalls).toHaveBeenCalledTimes(proofs);
      expect(quorumCalls).toHaveBeenCalledTimes(proofs);
      bodyCalls.mockRestore();

      // operation scoped: 1 body, 1 quorum, L encodes
      const signatureVerifier2 = new Secp256k1SignatureVerifier();
      const quorumCalls2 = jest.spyOn(signatureVerifier2, 'verify');
      const operation = plainVerifier(signatureVerifier2).beginOperation() as OperationUnicityCertificateVerifier;
      const result = await token.verify(withVerifier(s.context, operation));
      expect(result.status).toEqual(VerificationStatus.OK);
      expect(operation.stats).toEqual({
        authorityBuilds: 1,
        bodyChecks: 1,
        bodyHits: proofs - 1,
        encodes: proofs,
        quorumChecks: 1,
      });
      expect(quorumCalls2).toHaveBeenCalledTimes(1);
    }
  });

  it('does the same through the ordinary token verification, without any explicit operation', async () => {
    for (const transfers of lengths) {
      const s = await scenario(0);
      const token = await consolidated(s, await s.history(transfers));
      const signatureVerifier = new Secp256k1SignatureVerifier();
      const quorumCalls = jest.spyOn(signatureVerifier, 'verify');
      const bodyCalls = jest.spyOn(UnicitySealHashMatchesWithRootHashRule, 'verify');
      const result = await token.verify(withVerifier(s.context, plainVerifier(signatureVerifier)));
      expect(result.status).toEqual(VerificationStatus.OK);
      expect(bodyCalls).toHaveBeenCalledTimes(1);
      expect(quorumCalls).toHaveBeenCalledTimes(1);
      bodyCalls.mockRestore();
    }
  });

  it('scales with distinct certificates and seals: m bodies and one quorum over m shards', async () => {
    const s = await scenario(2);
    const token = await consolidated(s, await s.history(10));
    const operation = plainVerifier(
      new Secp256k1SignatureVerifier(),
    ).beginOperation() as OperationUnicityCertificateVerifier;
    expect((await token.verify(withVerifier(s.context, operation))).status).toEqual(VerificationStatus.OK);
    expect(distinctSeals([token])).toEqual(1);
    expect(operation.stats.bodyChecks).toEqual(distinctUcs([token]));
    expect(operation.stats.bodyChecks).toBeLessThanOrEqual(4);
    expect(operation.stats.quorumChecks).toEqual(1);
    expect(operation.stats.encodes).toEqual(11);
  });

  it('never does more than the distinct work for a token certified under many seals', async () => {
    for (const transfers of [2, 6]) {
      const s = await scenario(1);
      const token = await s.history(transfers);
      const operation = plainVerifier(
        new Secp256k1SignatureVerifier(),
      ).beginOperation() as OperationUnicityCertificateVerifier;
      expect((await token.verify(withVerifier(s.context, operation))).status).toEqual(VerificationStatus.OK);
      expect(operation.stats.bodyChecks).toEqual(distinctUcs([token]));
      expect(operation.stats.quorumChecks).toEqual(distinctSeals([token]));
    }
  });

  it('shares the operation with nested proofs of mint justifications', async () => {
    for (const nestedTransfers of [1, 4]) {
      const s = await scenario(0);
      const nested = await s.history(nestedTransfers);
      const outer = await s.history(2, new NestedTokenJustification(nested));
      const consolidatedOuter = await consolidated(s, outer);

      const operation = plainVerifier(
        new Secp256k1SignatureVerifier(),
      ).beginOperation() as OperationUnicityCertificateVerifier;
      const result = await consolidatedOuter.verify(withVerifier(s.context, operation));
      expect(result.status).toEqual(VerificationStatus.OK);
      // the nested token keeps its own seals: they are checked once each, in the same operation
      expect(operation.stats.bodyChecks).toEqual(distinctUcs([consolidatedOuter, nested]));
      expect(operation.stats.quorumChecks).toEqual(distinctSeals([consolidatedOuter, nested]));
      expect(operation.stats.encodes).toEqual(proofsOf(consolidatedOuter).length + proofsOf(nested).length);
    }
  });

  it('builds the authority identity once per operation, not once per proof or per seal check', async () => {
    const builds: number[] = [];
    for (const transfers of lengths) {
      const s = await scenario(0);
      const token = await consolidated(s, await s.history(transfers));
      const before = authorityIdentityBuildCount();
      const operation = plainVerifier(new Secp256k1SignatureVerifier()).beginOperation();
      expect((await token.verify(withVerifier(s.context, operation))).status).toEqual(VerificationStatus.OK);
      builds.push(authorityIdentityBuildCount() - before);
    }
    // constant in the number of proofs
    expect(new Set(builds).size).toEqual(1);
    expect(builds[0]).toEqual(1);
  });

  it('does not change a verdict and never remembers a failure', async () => {
    const s = await scenario(0);
    const token = await consolidated(s, await s.history(3));
    const items = CborDeserializer.decodeArray(CborDeserializer.decodeTag(token.toCBOR()).data, 3);
    const transfers = CborDeserializer.decodeArray(items[2]);

    // one proof of the history carries a certificate whose input record was altered: its body fails
    const victim = token.transactions[1].inclusionProof;
    const uc = victim.unicityCertificate;
    const ir = uc.inputRecord;
    const forgedIr = new InputRecord(
      ir.roundNumber + 1n,
      ir.epoch,
      ir.previousHash,
      ir.nullableHash,
      ir.nullableSummaryValue,
      ir.timestamp,
      ir.blockHash,
      ir.sumOfEarnedFees,
      ir.executedTransactionsHash,
    );
    const forged = new InclusionProof(
      victim.certificationData,
      victim.referenceTime,
      victim.inclusionCertificate,
      new UnicityCertificate(
        forgedIr,
        uc.technicalRecordHash,
        uc.shardConfigurationHash,
        uc.shardTreeCertificate,
        uc.unicityTreeCertificate,
        uc.unicitySeal,
      ),
    );
    const [transaction] = CborDeserializer.decodeArray(transfers[1], 2);
    transfers[1] = CborSerializer.encodeArray(transaction, forged.toCBOR());
    const tampered = await Token.fromCBOR(
      CborSerializer.encodeTag(
        CborDeserializer.decodeTag(token.toCBOR()).tag,
        CborSerializer.encodeArray(items[0], items[1], CborSerializer.encodeArray(...transfers)),
      ),
    );

    const reference = await tampered.verify(withVerifier(s.context, plainVerifier(new Secp256k1SignatureVerifier())));
    expect(reference.status).toEqual(VerificationStatus.FAIL);

    const operation = plainVerifier(
      new Secp256k1SignatureVerifier(),
    ).beginOperation() as OperationUnicityCertificateVerifier;
    const scoped = withVerifier(s.context, operation);
    expect((await tampered.verify(scoped)).status).toEqual(VerificationStatus.FAIL);
    const bodiesAfterFirst = operation.stats.bodyChecks;
    // the failed body is not remembered: it is evaluated (and fails) again
    expect((await tampered.verify(scoped)).status).toEqual(VerificationStatus.FAIL);
    expect(operation.stats.bodyChecks).toBeGreaterThan(bodiesAfterFirst);
    // and the valid token still verifies in that very operation
    expect((await token.verify(scoped)).status).toEqual(VerificationStatus.OK);
  });

  it('leaves an injected custom verifier in full control', () => {
    const custom = referenceVerifier(new Secp256k1SignatureVerifier());
    expect(custom.beginOperation()).toBe(custom);
    const operation = plainVerifier(new Secp256k1SignatureVerifier()).beginOperation();
    expect(operation.beginOperation()).toBe(operation);
  });
});

describe('customized verification is never scoped', () => {
  it('leaves a custom quorum rule in full control, with the caller trust base and no memo', async () => {
    class PinnedRule extends UnicitySealQuorumSignaturesVerificationRule {}
    const verifier = new UnicityCertificateVerifier(new PinnedRule(new Secp256k1SignatureVerifier()));
    expect(verifier.beginOperation()).toBe(verifier);

    // such a verifier verifies every proof by itself: L+1 quorum calls over a single seal history
    const s = await scenario(0);
    const signatureVerifier = new Secp256k1SignatureVerifier();
    const calls = jest.spyOn(signatureVerifier, 'verify');
    const custom = new UnicityCertificateVerifier(new PinnedRule(signatureVerifier));
    const token = await consolidated(s, await s.history(3));
    expect((await token.verify(withVerifier(s.context, custom))).status).toEqual(VerificationStatus.OK);
    expect(calls).toHaveBeenCalledTimes(4);
    calls.mockRestore();
  });
});
