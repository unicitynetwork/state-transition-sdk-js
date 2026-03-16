import {
  createAssetId,
  createTestSetup,
  createUser,
  mintTokenWithAssets,
  parseSplitPaymentData,
  parseSimplePaymentData,
  splitTokenToOwner,
  transferToken,
  ITestSetup,
  IUser,
} from './TestSetup.js';
import { Asset } from '../../../../src/payment/asset/Asset.js';
import { AssetId } from '../../../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { IPaymentData } from '../../../../src/payment/IPaymentData.js';
import { Token } from '../../../../src/transaction/Token.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';

/**
 * Token tree structure (4 levels, 4 users):
 *
 * L0: Alice mints T0 [A1=1000, A2=2000]
 *
 * L1: Alice splits T0 → T1a[600,1200] + T1b[400,800]
 *     Alice transfers T1a → Bob
 *     Alice transfers T1b → Carol
 *
 * L2: Bob splits T1a → T2a[350,700] + T2b[250,500]
 *     Bob transfers T2a → Carol
 *     Bob transfers T2b → Dave
 *
 * L3: Carol splits T1b → T3a[200,400] + T3b[200,400]
 *     Carol transfers T3a → Dave
 *     Carol transfers T3b → Alice
 *
 * L4: Dave splits T2b → T4a[125,250] + T4b[125,250]
 *     Dave transfers T4a → Alice
 *     Dave transfers T4b → Bob
 *
 * Final live tokens: T2a(Carol), T3a(Dave), T3b(Alice), T4a(Alice), T4b(Bob)
 * Burned tokens: T0_burned, T1a_burned, T1b_burned, T2b_burned
 */
export interface ITokenTree {
  readonly alice: IUser;
  readonly assetId1: AssetId;
  readonly assetId2: AssetId;
  readonly bob: IUser;
  readonly carol: IUser;
  readonly dave: IUser;
  readonly ownersByTokenName: ReadonlyMap<string, IUser>;
  readonly setup: ITestSetup;

  // Burned tokens (after split)
  readonly t0Burned: Token;
  readonly t1aBurned: Token;
  readonly t1aPreTransfer: Token; // owned by Alice (before transfer to Bob)
  readonly t1bBurned: Token;
  readonly t1bPreTransfer: Token; // owned by Alice (before transfer to Carol)
  readonly t2aCarol: Token;
  readonly t2aPreTransfer: Token; // owned by Bob (before transfer to Carol)
  readonly t2bBurned: Token;
  readonly t2bPreTransfer: Token; // owned by Bob (before transfer to Dave)
  readonly t3aDave: Token;
  readonly t3aPreTransfer: Token; // owned by Carol (before transfer to Dave)
  readonly t3bAlice: Token;
  readonly t3bPreTransfer: Token; // owned by Carol (before transfer to Alice)
  readonly t4aAlice: Token;
  readonly t4aPreTransfer: Token; // owned by Dave (before transfer to Alice)
  readonly t4bBob: Token;
  readonly t4bPreTransfer: Token; // owned by Dave (before transfer to Bob)

  readonly tokenAssets: ReadonlyMap<string, PaymentAssetCollection>;
  readonly tokenParsers: ReadonlyMap<string, (bytes: Uint8Array) => Promise<IPaymentData>>;
  readonly tokensByName: ReadonlyMap<string, Token>;
  readonly usersByName: ReadonlyMap<string, IUser>;
}

let cachedTree: ITokenTree | null = null;

export async function buildTokenTree(): Promise<ITokenTree> {
  if (cachedTree) {
    return cachedTree;
  }

  const setup = createTestSetup();
  const alice = createUser();
  const bob = createUser();
  const carol = createUser();
  const dave = createUser();
  const assetId1 = createAssetId();
  const assetId2 = createAssetId();

  // ── L0: Alice mints T0 ──
  const t0Assets = PaymentAssetCollection.create(new Asset(assetId1, 1000n), new Asset(assetId2, 2000n));
  const t0 = await mintTokenWithAssets(setup, alice, t0Assets);

  // ── L1: Alice splits T0 → T1a + T1b ──
  const t1aId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const t1bId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const l1SplitAssets: [TokenId, PaymentAssetCollection][] = [
    [t1aId, PaymentAssetCollection.create(new Asset(assetId1, 600n), new Asset(assetId2, 1200n))],
    [t1bId, PaymentAssetCollection.create(new Asset(assetId1, 400n), new Asset(assetId2, 800n))],
  ];

  const l1Result = await splitTokenToOwner(
    setup,
    t0,
    alice.predicate,
    alice.signingService,
    l1SplitAssets,
    parseSimplePaymentData,
    alice,
  );

  const t0Burned = l1Result.burnedToken;
  const t1aPreTransfer = l1Result.splitTokens[0]; // owned by Alice
  const t1bPreTransfer = l1Result.splitTokens[1]; // owned by Alice

  // Alice transfers T1a → Bob, T1b → Carol
  const t1aBob = await transferToken(setup, t1aPreTransfer, alice.predicate, alice.signingService, bob.predicate);
  const t1bCarol = await transferToken(setup, t1bPreTransfer, alice.predicate, alice.signingService, carol.predicate);

  // ── L2: Bob splits T1a → T2a + T2b ──
  const t2aId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const t2bId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const l2SplitAssets: [TokenId, PaymentAssetCollection][] = [
    [t2aId, PaymentAssetCollection.create(new Asset(assetId1, 350n), new Asset(assetId2, 700n))],
    [t2bId, PaymentAssetCollection.create(new Asset(assetId1, 250n), new Asset(assetId2, 500n))],
  ];

  const l2Result = await splitTokenToOwner(
    setup,
    t1aBob,
    bob.predicate,
    bob.signingService,
    l2SplitAssets,
    parseSplitPaymentData,
    bob,
  );

  const t1aBurned = l2Result.burnedToken;
  const t2aPreTransfer = l2Result.splitTokens[0]; // owned by Bob
  const t2bPreTransfer = l2Result.splitTokens[1]; // owned by Bob

  // Bob transfers T2a → Carol, T2b → Dave
  const t2aCarol = await transferToken(setup, t2aPreTransfer, bob.predicate, bob.signingService, carol.predicate);
  const t2bDave = await transferToken(setup, t2bPreTransfer, bob.predicate, bob.signingService, dave.predicate);

  // ── L3: Carol splits T1b → T3a + T3b ──
  const t3aId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const t3bId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const l3SplitAssets: [TokenId, PaymentAssetCollection][] = [
    [t3aId, PaymentAssetCollection.create(new Asset(assetId1, 200n), new Asset(assetId2, 400n))],
    [t3bId, PaymentAssetCollection.create(new Asset(assetId1, 200n), new Asset(assetId2, 400n))],
  ];

  const l3Result = await splitTokenToOwner(
    setup,
    t1bCarol,
    carol.predicate,
    carol.signingService,
    l3SplitAssets,
    parseSplitPaymentData,
    carol,
  );

  const t1bBurned = l3Result.burnedToken;
  const t3aPreTransfer = l3Result.splitTokens[0]; // owned by Carol
  const t3bPreTransfer = l3Result.splitTokens[1]; // owned by Carol

  // Carol transfers T3a → Dave, T3b → Alice
  const t3aDave = await transferToken(setup, t3aPreTransfer, carol.predicate, carol.signingService, dave.predicate);
  const t3bAlice = await transferToken(setup, t3bPreTransfer, carol.predicate, carol.signingService, alice.predicate);

  // ── L4: Dave splits T2b → T4a + T4b ──
  const t4aId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const t4bId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const l4SplitAssets: [TokenId, PaymentAssetCollection][] = [
    [t4aId, PaymentAssetCollection.create(new Asset(assetId1, 125n), new Asset(assetId2, 250n))],
    [t4bId, PaymentAssetCollection.create(new Asset(assetId1, 125n), new Asset(assetId2, 250n))],
  ];

  const l4Result = await splitTokenToOwner(
    setup,
    t2bDave,
    dave.predicate,
    dave.signingService,
    l4SplitAssets,
    parseSplitPaymentData,
    dave,
  );

  const t2bBurned = l4Result.burnedToken;
  const t4aPreTransfer = l4Result.splitTokens[0]; // owned by Dave
  const t4bPreTransfer = l4Result.splitTokens[1]; // owned by Dave

  // Dave transfers T4a → Alice, T4b → Bob
  const t4aAlice = await transferToken(setup, t4aPreTransfer, dave.predicate, dave.signingService, alice.predicate);
  const t4bBob = await transferToken(setup, t4bPreTransfer, dave.predicate, dave.signingService, bob.predicate);

  // Build lookup maps
  const tokensByName = new Map<string, Token>([
    ['T0_burned', t0Burned],
    ['T1a_burned', t1aBurned],
    ['T1a_pre', t1aPreTransfer],
    ['T1b_burned', t1bBurned],
    ['T1b_pre', t1bPreTransfer],
    ['T2a_carol', t2aCarol],
    ['T2a_pre', t2aPreTransfer],
    ['T2b_burned', t2bBurned],
    ['T2b_pre', t2bPreTransfer],
    ['T3a_dave', t3aDave],
    ['T3a_pre', t3aPreTransfer],
    ['T3b_alice', t3bAlice],
    ['T3b_pre', t3bPreTransfer],
    ['T4a_alice', t4aAlice],
    ['T4a_pre', t4aPreTransfer],
    ['T4b_bob', t4bBob],
    ['T4b_pre', t4bPreTransfer],
  ]);

  const ownersByTokenName = new Map<string, IUser>([
    ['T1a_pre', alice],
    ['T1b_pre', alice],
    ['T2a_carol', carol],
    ['T2a_pre', bob],
    ['T2b_pre', bob],
    ['T3a_dave', dave],
    ['T3a_pre', carol],
    ['T3b_alice', alice],
    ['T3b_pre', carol],
    ['T4a_alice', alice],
    ['T4a_pre', dave],
    ['T4b_bob', bob],
    ['T4b_pre', dave],
  ]);

  const usersByName = new Map<string, IUser>([
    ['Alice', alice],
    ['Bob', bob],
    ['Carol', carol],
    ['Dave', dave],
  ]);

  const t1aAssets = PaymentAssetCollection.create(new Asset(assetId1, 600n), new Asset(assetId2, 1200n));
  const t1bAssets = PaymentAssetCollection.create(new Asset(assetId1, 400n), new Asset(assetId2, 800n));
  const t2aAssets = PaymentAssetCollection.create(new Asset(assetId1, 350n), new Asset(assetId2, 700n));
  const t2bAssets = PaymentAssetCollection.create(new Asset(assetId1, 250n), new Asset(assetId2, 500n));
  const t3aAssets = PaymentAssetCollection.create(new Asset(assetId1, 200n), new Asset(assetId2, 400n));
  const t3bAssets = PaymentAssetCollection.create(new Asset(assetId1, 200n), new Asset(assetId2, 400n));
  const t4aAssets = PaymentAssetCollection.create(new Asset(assetId1, 125n), new Asset(assetId2, 250n));
  const t4bAssets = PaymentAssetCollection.create(new Asset(assetId1, 125n), new Asset(assetId2, 250n));

  const tokenAssets = new Map<string, PaymentAssetCollection>([
    ['T0_burned', t0Assets],
    ['T1a_burned', t1aAssets],
    ['T1a_pre', t1aAssets],
    ['T1b_burned', t1bAssets],
    ['T1b_pre', t1bAssets],
    ['T2a_carol', t2aAssets],
    ['T2a_pre', t2aAssets],
    ['T2b_burned', t2bAssets],
    ['T2b_pre', t2bAssets],
    ['T3a_dave', t3aAssets],
    ['T3a_pre', t3aAssets],
    ['T3b_alice', t3bAssets],
    ['T3b_pre', t3bAssets],
    ['T4a_alice', t4aAssets],
    ['T4a_pre', t4aAssets],
    ['T4b_bob', t4bAssets],
    ['T4b_pre', t4bAssets],
  ]);

  const tokenParsers = new Map<string, (bytes: Uint8Array) => Promise<IPaymentData>>([
    ['T0_burned', parseSimplePaymentData],
    ['T1a_burned', parseSplitPaymentData],
    ['T1a_pre', parseSplitPaymentData],
    ['T1b_burned', parseSplitPaymentData],
    ['T1b_pre', parseSplitPaymentData],
    ['T2a_carol', parseSplitPaymentData],
    ['T2a_pre', parseSplitPaymentData],
    ['T2b_burned', parseSplitPaymentData],
    ['T2b_pre', parseSplitPaymentData],
    ['T3a_dave', parseSplitPaymentData],
    ['T3a_pre', parseSplitPaymentData],
    ['T3b_alice', parseSplitPaymentData],
    ['T3b_pre', parseSplitPaymentData],
    ['T4a_alice', parseSplitPaymentData],
    ['T4a_pre', parseSplitPaymentData],
    ['T4b_bob', parseSplitPaymentData],
    ['T4b_pre', parseSplitPaymentData],
  ]);

  cachedTree = {
    alice,
    assetId1,
    assetId2,
    bob,
    carol,
    dave,
    ownersByTokenName,
    setup,
    t0Burned,
    t1aBurned,
    t1aPreTransfer,
    t1bBurned,
    t1bPreTransfer,
    t2aCarol,
    t2aPreTransfer,
    t2bBurned,
    t2bPreTransfer,
    t3aDave,
    t3aPreTransfer,
    t3bAlice,
    t3bPreTransfer,
    t4aAlice,
    t4aPreTransfer,
    t4bBob,
    t4bPreTransfer,
    tokenAssets,
    tokenParsers,
    tokensByName,
    usersByName,
  };

  return cachedTree;
}
