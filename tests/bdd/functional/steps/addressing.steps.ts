import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { PayToPublicKeyPredicateUnlockScript } from '../../../../src/predicate/builtin/PayToPublicKeyPredicateUnlockScript.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { Token } from '../../../../src/transaction/Token.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { AddressingMethod, IUser, createUser, registerNametag, resolveRecipientAddress } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

function parseMethod(raw: string): AddressingMethod {
  if (raw === 'pubkey' || raw === 'nametag') {
    return raw;
  }
  throw new Error(`Unsupported addressing method: "${raw}"`);
}

function ensureNamedUser(world: TokenWorld, name: string): IUser {
  let user = world.namedUsers.get(name);
  if (!user) {
    user = createUser();
    world.namedUsers.set(name, user);
    // Mirror onto well-known World fields so legacy steps that read this.alice / this.bob etc. still work.
    const slot = name.toLowerCase() as 'alice' | 'bob' | 'carol' | 'dave';
    if (slot === 'alice' || slot === 'bob' || slot === 'carol' || slot === 'dave') {
      world[slot] = user;
    }
  }
  return user;
}

function requireNamedUser(world: TokenWorld, name: string): IUser {
  const user = world.namedUsers.get(name);
  if (!user) {
    throw new Error(`No named user "${name}" in scope; use "<name> has a signing key" first.`);
  }
  return user;
}

// --- Given: user setup and nametag registration ------------------------------

Given(/^(\w+) has a signing key$/, function (this: TokenWorld, name: string): void {
  ensureNamedUser(this, name);
});

Given(
  /^(\w+) has registered the nametag "@([^"]+)"$/,
  async function (this: TokenWorld, userName: string, tag: string): Promise<void> {
    const user = ensureNamedUser(this, userName);
    const nametag = await registerNametag(this.setup, user, tag);
    this.nametags.set(user, nametag);
  },
);

Given(
  /^(\w+) has registered the nametag "@([^"]+)" in domain "([^"]+)"$/,
  async function (this: TokenWorld, userName: string, tag: string, domain: string): Promise<void> {
    const user = ensureNamedUser(this, userName);
    const nametag = await registerNametag(this.setup, user, tag, domain);
    this.nametags.set(user, nametag);
  },
);

// --- When: addressing-aware mint ---------------------------------------------

When(
  /^(\w+) mints a new token addressed to (\w+) via (pubkey|nametag)$/,
  async function (this: TokenWorld, senderName: string, recipientName: string, methodRaw: string): Promise<void> {
    const method = parseMethod(methodRaw);
    const sender = requireNamedUser(this, senderName);
    const recipient = requireNamedUser(this, recipientName);
    const recipientAddress = await resolveRecipientAddress(
      recipient,
      method,
      method === 'nametag' ? (this.nametags.get(recipient) ?? null) : null,
    );

    this.addressingMethod = method;
    this.user = sender;

    const mintTransaction = await MintTransaction.create(
      recipientAddress,
      TokenId.generate(),
      TokenType.generate(),
      CborSerializer.encodeArray(),
    );

    const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
    const response = await this.setup.client.submitCertificationRequest(certificationData);
    this.certificationStatus = response.status;

    this.token = await Token.mint(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      await mintTransaction.toCertifiedTransaction(
        this.setup.trustBase,
        this.setup.predicateVerifier,
        await waitInclusionProof(
          this.setup.client,
          this.setup.trustBase,
          this.setup.predicateVerifier,
          mintTransaction,
        ),
      ),
    );
  },
);

// --- When: addressing-aware transfer -----------------------------------------

When(
  /^(\w+) transfers the token to (\w+) via (pubkey|nametag)$/,
  async function (this: TokenWorld, senderName: string, recipientName: string, methodRaw: string): Promise<void> {
    const method = parseMethod(methodRaw);
    const sender = requireNamedUser(this, senderName);
    const recipient = requireNamedUser(this, recipientName);
    const recipientAddress = await resolveRecipientAddress(
      recipient,
      method,
      method === 'nametag' ? (this.nametags.get(recipient) ?? null) : null,
    );

    const transferTransaction = await TransferTransaction.create(
      this.token,
      sender.predicate,
      recipientAddress,
      crypto.getRandomValues(new Uint8Array(32)),
      CborSerializer.encodeArray(),
    );

    const certificationData = await CertificationData.fromTransaction(
      transferTransaction,
      await PayToPublicKeyPredicateUnlockScript.create(transferTransaction, sender.signingService),
    );

    const response = await this.setup.client.submitCertificationRequest(certificationData);
    this.certificationStatus = response.status;

    this.token = await this.token.transfer(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      await transferTransaction.toCertifiedTransaction(
        this.setup.trustBase,
        this.setup.predicateVerifier,
        await waitInclusionProof(
          this.setup.client,
          this.setup.trustBase,
          this.setup.predicateVerifier,
          transferTransaction,
        ),
      ),
    );
  },
);

// --- Then: assertions about the current token --------------------------------

Then(/^the current token verifies$/, async function (this: TokenWorld): Promise<void> {
  const result = await this.token.verify(this.setup.trustBase, this.setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then(/^the current token can be spent by (\w+)$/, async function (this: TokenWorld, ownerName: string): Promise<void> {
  const owner = requireNamedUser(this, ownerName);
  const bystander = createUser();

  const transferTransaction = await TransferTransaction.create(
    this.token,
    owner.predicate,
    await resolveRecipientAddress(bystander, 'pubkey'),
    crypto.getRandomValues(new Uint8Array(32)),
    CborSerializer.encodeArray(),
  );

  const certificationData = await CertificationData.fromTransaction(
    transferTransaction,
    await PayToPublicKeyPredicateUnlockScript.create(transferTransaction, owner.signingService),
  );

  const response = await this.setup.client.submitCertificationRequest(certificationData);
  assert.strictEqual(response.status, CertificationStatus.SUCCESS);
});

Then(
  /^the current token's CBOR does not contain the bytes of "@([^"]+)"$/,
  function (this: TokenWorld, tag: string): void {
    const cbor = this.token.toCBOR();
    const needle = new TextEncoder().encode(tag);
    const haystack = Buffer.from(cbor);
    assert.ok(
      haystack.indexOf(Buffer.from(needle)) === -1,
      `CBOR bytes of the current token contain the literal "@${tag}".`,
    );
  },
);
