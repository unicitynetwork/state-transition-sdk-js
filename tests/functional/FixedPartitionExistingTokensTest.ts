import { TestPaymentData } from './payment/TestPaymentData.js';
import { TestAggregatorClient } from './TestAggregatorClient.js';
import { TrustBaseHistory } from '../../src/api/bft/trustbase/TrustBaseHistory.js';
import { UnicityCertificateStructureRule } from '../../src/api/bft/verification/rule/UnicityCertificateStructureRule.js';
import { UnicitySealHashMatchesWithRootHashRule } from '../../src/api/bft/verification/rule/UnicitySealHashMatchesWithRootHashRule.js';
import { UnicitySealTrustBaseEntryRule } from '../../src/api/bft/verification/rule/UnicitySealTrustBaseEntryRule.js';
import {
  UnicityCertificateVerificationResult,
  UnicityCertificateVerifier,
} from '../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { InclusionProof } from '../../src/api/InclusionProof.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { Asset } from '../../src/payment/asset/Asset.js';
import { AssetId } from '../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../src/payment/asset/PaymentAssetCollection.js';
import { SplitMintJustification } from '../../src/payment/SplitMintJustification.js';
import { SplitMintJustificationVerifier } from '../../src/payment/SplitMintJustificationVerifier.js';
import { SplitTokenRequest } from '../../src/payment/SplitTokenRequest.js';
import { TokenSplit } from '../../src/payment/TokenSplit.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateUnlockScript } from '../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { Token } from '../../src/transaction/Token.js';
import { IVerificationContext } from '../../src/transaction/verification/IVerificationContext.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';
import { expiresAt } from '../utils/ExpiresAt.js';
import { mintToken, transferToken } from '../utils/TokenUtils.js';
import { createUnicityCertificateVerifier } from '../utils/UnicityCertificateVerifierFixture.js';

/**
 * A verifier that omits the partition and structure rule, to BUILD tokens carrying validly signed certificates of
 * another partition. Everything else (shard path to the seal hash, quorum signatures) is the stock behaviour.
 */
class PermissiveVerifier extends UnicityCertificateVerifier {
  public override async verify(
    trustBase: TrustBaseHistory,
    inclusionProof: InclusionProof,
  ): Promise<UnicityCertificateVerificationResult> {
    const certificate = inclusionProof.unicityCertificate;
    const body = await UnicitySealHashMatchesWithRootHashRule.verify(certificate);
    const placed = UnicitySealTrustBaseEntryRule.verify(trustBase, certificate.unicitySeal);
    if (placed.entry === null) {
      return UnicityCertificateVerificationResult.fail([placed]);
    }
    const quorum = await this.quorumRule.verify(placed.entry, certificate.unicitySeal);
    return body.status === VerificationStatus.OK && quorum.status === VerificationStatus.OK
      ? UnicityCertificateVerificationResult.ok([body, quorum])
      : UnicityCertificateVerificationResult.fail([body, quorum]);
  }
}

// Regression: tokens that already exist (decoded from their bytes) are verified with the stock verifier, so the
// recursive path (genesis, every transfer, the nested burned source of a split) rejects a certificate of partition 8.
describe('Existing tokens with a certificate of another partition do not verify', () => {
  const alice = SigningService.generate();
  const bob = SigningService.generate();
  const mintJustifications = new MintJustificationVerifierService();
  mintJustifications.register(new SplitMintJustificationVerifier(TestPaymentData.decode));

  function setup(): {
    aggregator: TestAggregatorClient;
    client: StateTransitionClient;
    permissive: IVerificationContext;
    stock: IVerificationContext;
  } {
    const aggregator = TestAggregatorClient.create();
    const make = (verifier: UnicityCertificateVerifier): IVerificationContext =>
      new VerificationContext(
        aggregator.rootTrustBase,
        PredicateVerifierService.create(),
        verifier,
        mintJustifications,
        new TokenIssuanceVerifierService(false),
      );
    const rule = createUnicityCertificateVerifier().quorumRule;
    return {
      aggregator,
      client: new StateTransitionClient(aggregator),
      permissive: make(new PermissiveVerifier(rule)),
      stock: make(createUnicityCertificateVerifier()),
    };
  }

  const verify = async (context: IVerificationContext, token: Token): Promise<VerificationStatus> =>
    (await (await Token.fromCBOR(token.toCBOR())).verify(context)).status;

  it('control: the permissive verifier is only permissive about the partition', async () => {
    const { client, permissive, stock } = setup();
    const token = await mintToken(client, permissive, SignaturePredicate.create(alice.publicKey));
    expect(await verify(stock, token)).toEqual(VerificationStatus.OK);
    expect(UnicityCertificateStructureRule.failure(token.genesis.inclusionProof.unicityCertificate)).toBeNull();
  }, 30000);

  it('a partition 8 genesis', async () => {
    const { aggregator, client, permissive, stock } = setup();
    aggregator.setCertificateOptions({ partition: 8n });
    const token = await mintToken(client, permissive, SignaturePredicate.create(alice.publicKey));
    expect(await verify(permissive, token)).toEqual(VerificationStatus.OK);
    expect(await verify(stock, token)).toEqual(VerificationStatus.FAIL);
  }, 30000);

  it('a partition 8 transfer, also after the same stock context verified a good token (warm caches)', async () => {
    const { aggregator, client, permissive, stock } = setup();
    const good = await mintToken(client, permissive, SignaturePredicate.create(alice.publicKey));
    expect(await verify(stock, good)).toEqual(VerificationStatus.OK);

    aggregator.setCertificateOptions({}); // the genesis stays under 7
    const minted = await mintToken(client, permissive, SignaturePredicate.create(alice.publicKey));
    aggregator.setCertificateOptions({ partition: 8n });
    const moved = await transferToken(
      client,
      permissive,
      minted.toCBOR(),
      SignaturePredicate.create(bob.publicKey),
      alice,
      expiresAt(),
    );
    expect(await verify(stock, good)).toEqual(VerificationStatus.OK);
    expect(await verify(stock, moved)).toEqual(VerificationStatus.FAIL);
  }, 30000);

  it('a split output whose burned source token has a partition 8 genesis', async () => {
    const { aggregator, client, permissive, stock } = setup();
    const predicate = SignaturePredicate.fromSigningService(alice);
    const assets = [new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(10))), 500n)];
    const mint = await MintTransaction.create(NetworkId.LOCAL, predicate, {
      data: await new TestPaymentData(PaymentAssetCollection.create(...assets)).encode(),
      expiresAt: expiresAt(),
    });
    const certify = async (
      transaction: MintTransaction,
    ): Promise<ReturnType<MintTransaction['toCertifiedTransaction']>> => {
      const response = await client.submitCertificationRequest(
        await CertificationData.fromMintTransaction(transaction),
      );
      expect(response.status).toEqual(CertificationStatus.SUCCESS);
      return transaction.toCertifiedTransaction(
        permissive.trustBase,
        permissive.predicateVerifier,
        permissive.unicityCertificateVerifier,
        await waitInclusionProof(
          client,
          permissive.trustBase,
          permissive.predicateVerifier,
          permissive.unicityCertificateVerifier,
          transaction,
        ),
      );
    };

    // the source token: genesis certified under partition 8
    aggregator.setCertificateOptions({ partition: 8n });
    const source = await Token.mint(await certify(mint), permissive);
    // everything after it is certified under partition 7
    aggregator.setCertificateOptions({});

    const split = await TokenSplit.split(
      source,
      TestPaymentData.decode,
      [SplitTokenRequest.create(predicate, new TestPaymentData(PaymentAssetCollection.create(...assets)))],
      { expiresAt: expiresAt() },
    );
    const burn = split.burn.transaction;
    expect(
      (
        await client.submitCertificationRequest(
          await CertificationData.fromTransaction(burn, await SignaturePredicateUnlockScript.create(burn, alice)),
        )
      ).status,
    ).toEqual(CertificationStatus.SUCCESS);
    const burned = await source.transfer(
      await burn.toCertifiedTransaction(
        permissive.trustBase,
        permissive.predicateVerifier,
        permissive.unicityCertificateVerifier,
        await waitInclusionProof(
          client,
          permissive.trustBase,
          permissive.predicateVerifier,
          permissive.unicityCertificateVerifier,
          burn,
        ),
      ),
      permissive,
    );
    const output = split.tokens[0];
    const outputMint = await MintTransaction.create(output.networkId, output.recipient, {
      data: await output.paymentData.encode(),
      expiresAt: expiresAt(),
      justification: SplitMintJustification.create(burned, output.proofs).toCBOR(),
      salt: output.salt,
      tokenType: output.tokenType,
    });
    const splitToken = await Token.mint(await certify(outputMint), permissive);

    // its own proofs are under 7; only the nested source is not
    expect(UnicityCertificateStructureRule.failure(splitToken.genesis.inclusionProof.unicityCertificate)).toBeNull();
    expect(await verify(permissive, splitToken)).toEqual(VerificationStatus.OK);
    expect(await verify(stock, splitToken)).toEqual(VerificationStatus.FAIL);
  }, 60000);
});
