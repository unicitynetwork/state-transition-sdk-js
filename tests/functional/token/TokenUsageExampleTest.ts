import { RootTrustBase } from '../../../src/bft/RootTrustBase.js';
import { HashAlgorithm } from '../../../src/hash/HashAlgorithm.js';
import { MaskedPredicate } from '../../../src/predicate/embedded/MaskedPredicate.js';
import { SigningService } from '../../../src/sign/SigningService.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { Token } from '../../../src/token/Token.js';
import { TokenState } from '../../../src/token/TokenState.js';
import { MintTransactionReasonFactory } from '../../../src/transaction/MintTransactionReasonFactory.js';
import { createMintData, mintToken, sendToken } from '../../MintTokenUtils.js';
import {
  testOfflineTransferFlow,
  testSplitFlow,
  testSplitFlowAfterTransfer,
  testTransferFlow,
} from '../../token/CommonTestFlow.js';
import { TestAggregatorClient } from '../../unit/TestAggregatorClient.js';

describe('Transition', function () {
  let client: StateTransitionClient;
  let trustBase: RootTrustBase;

  beforeEach(() => {
    const aggregatorClient = TestAggregatorClient.create();
    client = new StateTransitionClient(aggregatorClient);
    trustBase = aggregatorClient.rootTrustBase;
  });

  it('should verify the token transfer', async () => {
    await testTransferFlow(trustBase, client);
  }, 15000);

  it('should verify the token offline transfer', async () => {
    await testOfflineTransferFlow(trustBase, client);
  }, 30000);

  it('should split tokens', async () => {
    await testSplitFlow(trustBase, client);
  }, 15000);

  it('should split tokens after transfer', async () => {
    await testSplitFlowAfterTransfer(trustBase, client);
  }, 15000);

  it('should fail to update token', async () => {
    const mintReasonFactory = MintTransactionReasonFactory.standard();

    const data = createMintData();
    const token = await mintToken(new Uint8Array(32), trustBase, mintReasonFactory, client, data);
    const signingService = await SigningService.createFromSecret(new Uint8Array(32), data.nonce);

    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const predicate = MaskedPredicate.create(token.id, token.type, signingService, HashAlgorithm.SHA256, nonce);
    const reference = await predicate.getReference();
    const transaction = await sendToken(
      trustBase,
      client,
      token,
      signingService,
      await reference.toAddress(),
      'test data',
    );

    await expect(
      token.update(
        trustBase,
        mintReasonFactory,
        new TokenState(predicate, new TextEncoder().encode('test data')),
        transaction,
      ),
    ).resolves.toBeInstanceOf(Token);

    await expect(
      token.update(
        trustBase,
        mintReasonFactory,
        new TokenState(predicate, new TextEncoder().encode('test')),
        transaction,
      ),
    ).rejects.toThrow('Recipient data verification failed');

    await expect(
      token.update(
        trustBase,
        mintReasonFactory,
        new TokenState(
          MaskedPredicate.create(token.id, token.type, signingService, HashAlgorithm.SHA256, new Uint8Array(30)),
          new TextEncoder().encode('test data'),
        ),
        transaction,
      ),
    ).rejects.toThrow('Recipient verification failed');
  });
});
