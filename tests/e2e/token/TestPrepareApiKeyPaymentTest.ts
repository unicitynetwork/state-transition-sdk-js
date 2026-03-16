import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { v4 as uuidv4 } from 'uuid';

import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../src/bft/RootTrustBase.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { TransferCommitment, AddressFactory, SigningService, MaskedPredicate } from '../../../src/token/index.js';
import { mintToken, createMintData } from '../../../src/token/TokenUtils';

// Optional: you can import UnicityObjectMapper equivalent if needed
// For now we use JSON.stringify()

describe('Prepare API Key Payment', () => {
  let trustBase: RootTrustBase;
  let client: StateTransitionClient;

  const ALICE_SECRET = new TextEncoder().encode('Alice');
  const url = 'http://localhost:3000';

  beforeAll(async () => {
    // Load trust base from JSON (same as Java)
    const trustBaseJsonString = fs.readFileSync(path.join(__dirname, 'trust-base.json'), 'utf-8');
    trustBase = RootTrustBase.fromJSON(JSON.parse(trustBaseJsonString));
    client = new StateTransitionClient(new AggregatorClient(url));
  });

  it('should prepare API key payment payload', async () => {
    // 1️⃣ Mint a token for Alice
    const FIXED_TOKEN_TYPE_HEX = 'f8aa13834268d29355ff12183066f0cb902003629bbc5eb9ef0efbe397867509';
    const FIXED_COIN_ID_HEX = '455ad8720656b08e8dbd5bac1f3c73eeea5431565f6c1c3af742b1aa12d41d89';

    function hexToBytes(hex: string): Uint8Array {
      return Uint8Array.from(Buffer.from(hex, 'hex'));
    }

    function fixedTokenType(): TokenType {
      return new TokenType(hexToBytes(FIXED_TOKEN_TYPE_HEX));
    }

    function fixedCoinData(amount: bigint): TokenCoinData {
      const coinId = new CoinId(hexToBytes(FIXED_COIN_ID_HEX));
      return TokenCoinData.create([[coinId, amount]]);
    }

    const aliceToken = await mintToken(trustBase, client, {
      secret: initialOwnerSecret,
      tokenId: new TokenId(crypto.getRandomValues(new Uint8Array(32))),
      type: fixedTokenType(),
      coinData: fixedCoinData(1000n),
      data: crypto.getRandomValues(new Uint8Array(32)),
      nonce: crypto.getRandomValues(new Uint8Array(32)),
    });

    const verified = await aliceToken.verify(trustBase);
    expect(verified.isSuccessful).toBeTruthy();

    // 2️⃣ Generate salt and sessionId
    const salt = randomBytes(32); // 256-bit salt
    const saltString = Buffer.from(salt).toString('base64');
    const sessionId = '88b9e706-54f4-40eb-8a69-1e34f15422a5';

    // 3️⃣ Alice prepares transfer commitment
    const directAddress = 'DIRECT://0000dff25f1ece89241fc6c00350766a162d5b1a66a01df65457d7c79dad7ed1328e421167fd';

    const aliceMaskedPredicate = aliceToken.state.predicate as MaskedPredicate;
    const signingService = await SigningService.createFromMaskedSecret(ALICE_SECRET, aliceMaskedPredicate.nonce);

    const transferCommitment = await TransferCommitment.create(
      aliceToken,
      await AddressFactory.createAddress(directAddress),
      randomBytes(32),
      null,
      null,
      signingService,
    );

    // 4️⃣ Build JSON payload
    const payload = {
      sessionId,
      salt: saltString,
      transferCommitmentJson: JSON.stringify(transferCommitment.toJSON()),
      sourceTokenJson: JSON.stringify(aliceToken.toJSON()),
    };

    // 5️⃣ Print compact JSON
    console.log('Compact JSON Payload:\n', JSON.stringify(payload));

    // 6️⃣ Pretty-print JSON
    console.log('Pretty JSON Payload:\n', JSON.stringify(payload, null, 2));

    // Optional: save to file for inspection
    fs.writeFileSync(path.join(__dirname, 'api-key-payment-payload.json'), JSON.stringify(payload, null, 2));

    // Basic assertions
    expect(payload.sessionId).toBeDefined();
    expect(payload.salt).toHaveLength(44); // base64 of 32 bytes = 44 chars
    expect(payload.transferCommitmentJson).toContain('recipient');
  }, 15000);
});
