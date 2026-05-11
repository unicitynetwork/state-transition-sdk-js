import { Given, When } from '@cucumber/cucumber';

import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateUnlockScript } from '../../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { UnicityIdPredicate } from '../../../../src/predicate/builtin/UnicityIdPredicate.js';
import { UnicityIdPredicateUnlockScript } from '../../../../src/predicate/builtin/UnicityIdPredicateUnlockScript.js';
import { UnicityIdPredicateVerifier } from '../../../../src/predicate/builtin/verification/UnicityIdPredicateVerifier.js';
import { EncodedPredicate } from '../../../../src/predicate/EncodedPredicate.js';
import { Token } from '../../../../src/transaction/Token.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { UnicityIdToken } from '../../../../src/unicity-id/UnicityIdToken.js';
import { createUser, mintTokenToRecipient, registerNametag } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

// Reuses the "the unicity-id verification result is OK/FAIL" + "the unicity-id failure
// message contains {string}" Then steps from unicity-id-issuer-pinning.steps.ts (they read
// world.issuerPinStash.result), so we populate that stash here.
interface IUidVerifierStash {
  aliceSigningService: SigningService;
  lockedToken: Token;
  nametag: UnicityIdToken;
  trueIssuerPublicKey: Uint8Array;
}

function getStash(world: TokenWorld): IUidVerifierStash {
  if (!world.uidVerifierStash) {
    throw new Error('uidVerifierStash not initialised — run the Background step first');
  }
  return world.uidVerifierStash;
}

function setResult(
  world: TokenWorld,
  result: import('../../../../src/verification/VerificationResult.js').VerificationResult<
    import('../../../../src/verification/VerificationStatus.js').VerificationStatus
  >,
): void {
  const stash = getStash(world);
  world.issuerPinStash = { result, token: stash.nametag, trueIssuerPublicKey: stash.trueIssuerPublicKey };
}

async function buildTransferAndVerify(
  world: TokenWorld,
  unlockSigningService: SigningService,
  nametagForUnlock: UnicityIdToken,
  issuerKey: Uint8Array,
): Promise<void> {
  const stash = getStash(world);
  const transferTx = await TransferTransaction.create(
    stash.lockedToken,
    createUser().predicate, // new recipient — irrelevant to the verification under test
    crypto.getRandomValues(new Uint8Array(32)),
  );
  const unlock = await UnicityIdPredicateUnlockScript.create(nametagForUnlock, transferTx, unlockSigningService);
  const verifier = new UnicityIdPredicateVerifier(world.setup.predicateVerifier, world.setup.trustBase, issuerKey);
  const result = await verifier.verify(
    EncodedPredicate.fromPredicate(UnicityIdPredicate.create(stash.nametag.genesis.unicityId)),
    transferTx.sourceStateHash,
    await transferTx.calculateTransactionHash(),
    unlock.encode(),
  );
  setResult(world, result);
}

Given(
  'Alice has registered a nametag, and a token locked to that nametag',
  async function (this: TokenWorld): Promise<void> {
    const alice = createUser();
    const nametag = await registerNametag(this.setup, alice, `uid-verifier-${Date.now()}`);
    const trueIssuerPublicKey = SignaturePredicate.fromPredicate(nametag.genesis.lockScript).publicKey;
    // Mint a fresh token locked to "whoever owns this nametag".
    const lockedToken = await mintTokenToRecipient(this.setup, UnicityIdPredicate.create(nametag.genesis.unicityId));
    this.uidVerifierStash = { aliceSigningService: alice.signingService, lockedToken, nametag, trueIssuerPublicKey };
  },
);

When(
  'the unicity-id-locked transfer is verified with the true nametag issuer',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    await buildTransferAndVerify(this, stash.aliceSigningService, stash.nametag, stash.trueIssuerPublicKey);
  },
);

When(
  'the unicity-id-locked transfer is verified with an unrelated issuer',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    const wrongIssuer = new SigningService(SigningService.generatePrivateKey()).publicKey;
    await buildTransferAndVerify(this, stash.aliceSigningService, stash.nametag, wrongIssuer);
  },
);

When(
  'the unicity-id-locked transfer is unlocked by a non-owner and verified with the true issuer',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    // A non-owner can still wrap the (publicly-visible) nametag token, but their inner
    // signature won't match the nametag's targetPredicate.
    const nonOwner = createUser();
    await buildTransferAndVerify(this, nonOwner.signingService, stash.nametag, stash.trueIssuerPublicKey);
  },
);

When(
  'the unicity-id-locked transfer is unlocked with an unrelated nametag and verified with the true issuer',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    // Register a *different* nametag (different name → different token id). The transfer's
    // lock script still refers to the original nametag, so the unlock script's token id
    // won't match → "Token ID mismatch".
    const other = createUser();
    const otherNametag = await registerNametag(this.setup, other, `uid-verifier-other-${Date.now()}`);
    const transferTx = await TransferTransaction.create(
      stash.lockedToken,
      createUser().predicate,
      crypto.getRandomValues(new Uint8Array(32)),
    );
    // UnicityIdPredicateUnlockScript.create rejects a mismatched token up front, so build the
    // wrapper directly via the inner signature + the wrong token, mirroring its encode().
    const innerUnlock = await SignaturePredicateUnlockScript.create(transferTx, other.signingService);
    const { CborSerializer } = await import('../../../../src/serialization/cbor/CborSerializer.js');
    const wrongWrapper = CborSerializer.encodeArray(
      CborSerializer.encodeByteString(innerUnlock.encode()),
      otherNametag.toCBOR(),
    );
    const verifier = new UnicityIdPredicateVerifier(
      this.setup.predicateVerifier,
      this.setup.trustBase,
      stash.trueIssuerPublicKey,
    );
    const result = await verifier.verify(
      EncodedPredicate.fromPredicate(UnicityIdPredicate.create(stash.nametag.genesis.unicityId)),
      transferTx.sourceStateHash,
      await transferTx.calculateTransactionHash(),
      wrongWrapper,
    );
    setResult(this, result);
  },
);
