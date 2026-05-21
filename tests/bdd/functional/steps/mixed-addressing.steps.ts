import assert from 'node:assert/strict';

import { When } from '@cucumber/cucumber';

import { Asset } from '../../../../src/payment/asset/Asset.js';
import { AssetId } from '../../../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { Token } from '../../../../src/transaction/Token.js';
import { UnicityIdToken } from '../../../../src/unicity-id/UnicityIdToken.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import {
  AddressingMethod,
  IHop,
  IUser,
  createUser,
  mintTokenWithAssets,
  parseSimplePaymentData,
  parseSplitVerificationData,
  registerNametag,
  resolveRecipientPredicate,
  runMixedChain,
  splitTokenToOwner,
} from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

function parseSequence(raw: string): AddressingMethod[] {
  return raw.split(',').map((s) => s.trim()) as AddressingMethod[];
}

async function ensureAllNametags(world: TokenWorld, users: IUser[]): Promise<Map<IUser, UnicityIdToken>> {
  const registry = world.nametags;
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (!registry.has(u)) {
      registry.set(u, await registerNametag(world.setup, u, `mixed-${i}-${Date.now()}`));
    }
  }
  return registry;
}

When(
  /^Alice splits a 2-asset token and sends child 1 to Bob via (pubkey|nametag)$/,
  { timeout: 120_000 },
  async function (this: TokenWorld, methodRaw: string): Promise<void> {
    const method = methodRaw as AddressingMethod;
    const alice = this.namedUsers.get('Alice')!;
    const bob = this.namedUsers.get('Bob')!;
    const bobNametag = this.nametags.get(bob) ?? null;

    const assets = PaymentAssetCollection.create(
      new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 100n),
      new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 200n),
    );

    const parent = await mintTokenWithAssets(this.setup, alice, assets);

    const { TokenId } = await import('../../../../src/transaction/TokenId.js');
    const child1Id = TokenId.generate();
    const child2Id = TokenId.generate();

    // Split into 2 children; children are initially minted to Alice then
    // transferred to Bob via the chosen addressing method.
    const { splitTokens } = await splitTokenToOwner(
      this.setup,
      parent,
      alice.predicate,
      alice.signingService,
      [
        [child1Id, PaymentAssetCollection.create(assets.toArray()[0])],
        [child2Id, PaymentAssetCollection.create(assets.toArray()[1])],
      ],
      parseSimplePaymentData,
      alice,
    );

    const child1 = splitTokens[0];
    const recipientAddress = resolveRecipientPredicate(bob, method, bobNametag);

    // Transfer child 1 from Alice to Bob via <method>
    const { TransferTransaction } = await import('../../../../src/transaction/TransferTransaction.js');
    const { CertificationData } = await import('../../../../src/api/CertificationData.js');
    const { CertificationStatus } = await import('../../../../src/api/CertificationResponse.js');
    const { SignaturePredicateUnlockScript } =
      await import('../../../../src/predicate/builtin/SignaturePredicateUnlockScript.js');
    const { waitInclusionProof } = await import('../../../../src/util/InclusionProofUtils.js');

    const transferTx = await TransferTransaction.create(
      child1,
      recipientAddress,
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const cert = await CertificationData.fromTransaction(
      transferTx,
      await SignaturePredicateUnlockScript.create(transferTx, alice.signingService),
    );
    const resp = await this.setup.client.submitCertificationRequest(cert);
    assert.strictEqual(resp.status, CertificationStatus.SUCCESS);

    this.token = await child1.transfer(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      await transferTx.toCertifiedTransaction(
        this.setup.trustBase,
        this.setup.predicateVerifier,
        await waitInclusionProof(this.setup.client, this.setup.trustBase, this.setup.predicateVerifier, transferTx),
      ),
    );
    // Mirror onto bobToken so downstream steps (grandchild splits) can find it.
    this.bobToken = this.token;
  },
);

When(
  /^Alice splits a 2-asset token, sends child 1 to Bob via (pubkey|nametag), and child 2 to Carol via (pubkey|nametag)$/,
  { timeout: 180_000 },
  async function (this: TokenWorld, bobMethod: string, carolMethod: string): Promise<void> {
    const alice = this.namedUsers.get('Alice')!;
    const bob = this.namedUsers.get('Bob')!;
    const carol = this.namedUsers.get('Carol')!;

    const assets = PaymentAssetCollection.create(
      new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 100n),
      new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 200n),
    );
    const parent = await mintTokenWithAssets(this.setup, alice, assets);

    const { TokenId } = await import('../../../../src/transaction/TokenId.js');
    const { splitTokens } = await splitTokenToOwner(
      this.setup,
      parent,
      alice.predicate,
      alice.signingService,
      [
        [TokenId.generate(), PaymentAssetCollection.create(assets.toArray()[0])],
        [TokenId.generate(), PaymentAssetCollection.create(assets.toArray()[1])],
      ],
      parseSimplePaymentData,
      alice,
    );

    const { TransferTransaction } = await import('../../../../src/transaction/TransferTransaction.js');
    const { CertificationData } = await import('../../../../src/api/CertificationData.js');
    const { CertificationStatus } = await import('../../../../src/api/CertificationResponse.js');
    const { SignaturePredicateUnlockScript } =
      await import('../../../../src/predicate/builtin/SignaturePredicateUnlockScript.js');
    const { waitInclusionProof } = await import('../../../../src/util/InclusionProofUtils.js');

    const deliverChild = async (
      child: (typeof splitTokens)[number],
      to: IUser,
      method: AddressingMethod,
    ): Promise<Token> => {
      const recipientAddress = resolveRecipientPredicate(to, method, this.nametags.get(to) ?? null);
      const tx = await TransferTransaction.create(child, recipientAddress, crypto.getRandomValues(new Uint8Array(32)));
      const cert = await CertificationData.fromTransaction(
        tx,
        await SignaturePredicateUnlockScript.create(tx, alice.signingService),
      );
      const resp = await this.setup.client.submitCertificationRequest(cert);
      assert.strictEqual(resp.status, CertificationStatus.SUCCESS);
      return child.transfer(
        this.setup.trustBase,
        this.setup.predicateVerifier,
        await tx.toCertifiedTransaction(
          this.setup.trustBase,
          this.setup.predicateVerifier,
          await waitInclusionProof(this.setup.client, this.setup.trustBase, this.setup.predicateVerifier, tx),
        ),
      );
    };

    this.bobToken = await deliverChild(splitTokens[0], bob, bobMethod as AddressingMethod);
    this.carolToken = await deliverChild(splitTokens[1], carol, carolMethod as AddressingMethod);
  },
);

When(
  /^after the split, Bob splits his child again and sends grandchild 1 to Carol via (pubkey|nametag)$/,
  { timeout: 240_000 },
  async function (this: TokenWorld, methodRaw: string): Promise<void> {
    const method = methodRaw as AddressingMethod;
    const bob = this.namedUsers.get('Bob')!;
    const carol = this.namedUsers.get('Carol')!;

    // Bob's child from the earlier step lives in this.bobToken.
    const bobToken = this.bobToken;
    const { TokenId } = await import('../../../../src/transaction/TokenId.js');

    // Bob's child has a single asset — split it in half.
    // Post-PR #112: split-child genesis.data is bare assets.toCBOR() (no array wrapper).
    const { PaymentAssetCollection: PAC } = await import('../../../../src/payment/asset/PaymentAssetCollection.js');
    const bobAssets = PAC.fromCBOR(bobToken.genesis.data ?? new Uint8Array());
    const single = bobAssets.toArray()[0];
    const halfA = new Asset(single.id, single.value / 2n);
    const halfB = new Asset(single.id, single.value - single.value / 2n);
    const dummyId1 = TokenId.generate();
    const dummyId2 = TokenId.generate();

    const { splitTokens: grandchildren } = await splitTokenToOwner(
      this.setup,
      bobToken,
      bob.predicate,
      bob.signingService,
      [
        [dummyId1, PAC.create(halfA)],
        [dummyId2, PAC.create(halfB)],
      ],
      parseSplitVerificationData,
      bob,
    );

    const recipientAddress = resolveRecipientPredicate(carol, method, this.nametags.get(carol) ?? null);

    const { TransferTransaction } = await import('../../../../src/transaction/TransferTransaction.js');
    const { CertificationData } = await import('../../../../src/api/CertificationData.js');
    const { CertificationStatus } = await import('../../../../src/api/CertificationResponse.js');
    const { SignaturePredicateUnlockScript } =
      await import('../../../../src/predicate/builtin/SignaturePredicateUnlockScript.js');
    const { waitInclusionProof } = await import('../../../../src/util/InclusionProofUtils.js');

    const tx = await TransferTransaction.create(
      grandchildren[0],
      recipientAddress,
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const cert = await CertificationData.fromTransaction(
      tx,
      await SignaturePredicateUnlockScript.create(tx, bob.signingService),
    );
    const resp = await this.setup.client.submitCertificationRequest(cert);
    assert.strictEqual(resp.status, CertificationStatus.SUCCESS);

    this.token = await grandchildren[0].transfer(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      await tx.toCertifiedTransaction(
        this.setup.trustBase,
        this.setup.predicateVerifier,
        await waitInclusionProof(this.setup.client, this.setup.trustBase, this.setup.predicateVerifier, tx),
      ),
    );
  },
);

When(
  /^a (\d+)-hop transfer chain runs using addressing sequence "([^"]+)"$/,
  { timeout: 120_000 },
  async function (this: TokenWorld, lengthRaw: string, seqRaw: string): Promise<void> {
    const length = parseInt(lengthRaw, 10);
    const methods = parseSequence(seqRaw);
    assert.strictEqual(methods.length, length, `sequence length ${methods.length} != declared hops ${length}`);

    const participants: IUser[] = Array.from({ length: length + 1 }, () => createUser());
    const registry = await ensureAllNametags(this, participants);

    const hops: IHop[] = methods.map((method, i) => ({
      from: participants[i],
      method,
      to: participants[i + 1],
    }));

    const { finalToken, tokens } = await runMixedChain(this.setup, hops, registry);
    this.token = finalToken;
    this.finalToken = finalToken;
    // Retain the chain for downstream assertions
    (this as unknown as { chainTokens: typeof tokens }).chainTokens = tokens;

    const result = await finalToken.verify(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      this.setup.mintJustificationVerifier,
    );
    assert.strictEqual(result.status, VerificationStatus.OK);
  },
);
