import assert from 'node:assert/strict';

import { When } from '@cucumber/cucumber';

import { UnicityCertificate } from '../../../../src/api/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { InclusionProof } from '../../../../src/api/InclusionProof.js';
import { CborDeserializer } from '../../../../src/serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { CertifiedMintTransaction } from '../../../../src/transaction/CertifiedMintTransaction.js';
import { CertifiedMintTransactionVerificationRule } from '../../../../src/transaction/verification/rule/CertifiedMintTransactionVerificationRule.js';
import { TokenWorld } from '../support/World.js';

interface ISealIsolationStash {
  mockCert?: CertifiedMintTransaction;
  tamperedProof?: InclusionProof;
}

function getStash(world: TokenWorld): ISealIsolationStash {
  world.sealIsolationStash ??= {};
  return world.sealIsolationStash;
}

// CBOR-level surgery: take a real UnicitySeal's CBOR (tag 39005 wrapping arity-8 array) and
// replace slot [1] (the networkId uint) with a different network id. Everything else stays —
// signatures inside the seal won't re-verify, but the network rule fires BEFORE signature
// verification per PR #119 ordering, so the test observes the seal rule's FAIL specifically.
function rebuildSealWithNetworkId(seal: UnicitySeal, alternateNetworkId: number): UnicitySeal {
  const cbor = seal.toCBOR();
  const { tag, data: arrayBytes } = CborDeserializer.decodeTag(cbor);
  assert.strictEqual(tag, UnicitySeal.CBOR_TAG, 'unexpected seal tag');
  const slots = CborDeserializer.decodeArray(arrayBytes, 8);
  const tampered = CborSerializer.encodeTag(
    UnicitySeal.CBOR_TAG,
    CborSerializer.encodeArray(
      slots[0], // version
      CborSerializer.encodeUnsignedInteger(alternateNetworkId), // tampered networkId
      slots[2], // rootChainRoundNumber
      slots[3], // epoch
      slots[4], // timestamp
      slots[5], // previousHash
      slots[6], // hash
      slots[7], // signatures
    ),
  );
  return UnicitySeal.fromCBOR(tampered);
}

When(
  "the genesis inclusion proof's unicitySeal networkId is swapped to a different network",
  function (this: TokenWorld): void {
    const stash = getStash(this);
    const realGenesis = this.token.genesis;
    const realProof = realGenesis.inclusionProof;
    const realCert = realProof.unicityCertificate;
    const realSeal = realCert.unicitySeal;
    // Pick a guaranteed-different networkId. The trust base used by `setup` is networkId 3
    // (LOCAL); swap the seal to 2 (TESTNET).
    const altNetworkId = realSeal.networkId.id === 2 ? 1 : 2;
    const tamperedSeal = rebuildSealWithNetworkId(realSeal, altNetworkId);
    const tamperedCert = new UnicityCertificate(
      realCert.inputRecord,
      realCert.technicalRecordHash,
      realCert.shardConfigurationHash,
      realCert.shardTreeCertificate,
      realCert.unicityTreeCertificate,
      tamperedSeal,
    );
    stash.tamperedProof = new InclusionProof(realProof.certificationData, realProof.inclusionCertificate, tamperedCert);
    // Mock cert: keep the real MintTransaction (so genesis.networkId stays correct and the mint
    // rule will pass), but swap the inclusion proof for the tampered one. CertifiedMintTransaction's
    // constructor is private; the verification rule only reads .networkId, .tokenId, .recipient,
    // .lockScript, and .inclusionProof, so a plain shape-compatible object suffices.
    stash.mockCert = {
      calculateTransactionHash: realGenesis.calculateTransactionHash.bind(realGenesis),
      data: realGenesis.data,
      inclusionProof: stash.tamperedProof,
      justification: realGenesis.justification,
      lockScript: realGenesis.lockScript,
      networkId: realGenesis.networkId,
      recipient: realGenesis.recipient,
      sourceStateHash: realGenesis.sourceStateHash,
      tokenId: realGenesis.tokenId,
      tokenType: realGenesis.tokenType,
    } as unknown as CertifiedMintTransaction;
  },
);

When(
  'the tampered cert mint is verified under the native trust base',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    assert.ok(stash.mockCert, 'mockCert missing — When step skipped?');
    const result = await CertifiedMintTransactionVerificationRule.verify(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      this.setup.mintJustificationVerifier,
      stash.mockCert,
    );
    // Stash via the existing networkConsistencyStash slot so the existing assertions in
    // network-id-consistency.steps.ts (status, findRule walker) match without duplication.
    this.networkConsistencyStash ??= {};
    this.networkConsistencyStash.result = result;
  },
);
