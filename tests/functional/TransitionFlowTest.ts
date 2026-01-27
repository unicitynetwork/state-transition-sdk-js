import { TestAggregatorClient } from './TestAggregatorClient.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { BuiltInPredicateVerifierFactory } from '../../src/predicate/builtin/BuiltInPredicateVerifierFactory.js';
import { PayToPublicKeyPredicate } from '../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PredicateEngine } from '../../src/predicate/PredicateEngine.js';
import { PredicateVerifier } from '../../src/predicate/verification/PredicateVerifier.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { PayToScriptHash } from '../../src/transaction/PayToScriptHash.js';
import { Token } from '../../src/transaction/Token.js';
import { TokenId } from '../../src/transaction/TokenId.js';
import { TokenType } from '../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';

describe('Transition', () => {
  it('default successful flow', async () => {
    const aggregatorClient = TestAggregatorClient.create();
    const trustBase = aggregatorClient.rootTrustBase;
    const client = new StateTransitionClient(aggregatorClient);
    const predicateVerifier = new PredicateVerifier(
      new Map([[PredicateEngine.BUILT_IN, BuiltInPredicateVerifierFactory.create()]]),
    );

    const signingService = new SigningService(SigningService.generatePrivateKey());
    const predicate = PayToPublicKeyPredicate.create(signingService);

    const mintTransaction = await MintTransaction.create(
      await PayToScriptHash.create(predicate),
      new TokenId(crypto.getRandomValues(new Uint8Array(32))),
      new TokenType(crypto.getRandomValues(new Uint8Array(32))),
      CborSerializer.encodeArray(),
    );
    let certificationData = await CertificationData.fromMintTransaction(mintTransaction);

    let response = await client.submitCertificationRequest(certificationData);
    expect(response.status).toEqual(CertificationStatus.SUCCESS);

    let token = await Token.mint(
      trustBase,
      predicateVerifier,
      await mintTransaction.toCertifiedTransaction(
        trustBase,
        predicateVerifier,
        await waitInclusionProof(trustBase, predicateVerifier, client, mintTransaction),
      ),
    );

    // TODO: Sending to another person besides myself
    const transferTransaction = await TransferTransaction.create(
      token,
      predicate,
      await PayToScriptHash.create(predicate),
      crypto.getRandomValues(new Uint8Array(32)),
      CborSerializer.encodeArray(),
    );

    certificationData = await CertificationData.fromTransferTransaction(
      transferTransaction,
      await PayToPublicKeyPredicate.generateUnlockScript(transferTransaction, signingService),
    );

    response = await client.submitCertificationRequest(certificationData);
    expect(response.status).toEqual(CertificationStatus.SUCCESS);

    // Test double spend attempt
    const doubleSpendTransferTransaction = await TransferTransaction.create(
      token,
      predicate,
      await PayToScriptHash.create(predicate),
      crypto.getRandomValues(new Uint8Array(32)),
      CborSerializer.encodeArray(),
    );

    await expect(async () =>
      client.submitCertificationRequest(
        await CertificationData.fromTransferTransaction(
          doubleSpendTransferTransaction,
          await PayToPublicKeyPredicate.generateUnlockScript(doubleSpendTransferTransaction, signingService),
        ),
      ),
    ).rejects.toThrow();

    // Finish initial transfer
    token = await token.transfer(
      trustBase,
      predicateVerifier,
      await transferTransaction.toCertifiedTransaction(
        trustBase,
        predicateVerifier,
        await waitInclusionProof(trustBase, predicateVerifier, client, transferTransaction),
      ),
    );

    const importedToken = await Token.fromCBOR(token.toCBOR());
    await expect(importedToken.verify(trustBase, predicateVerifier).then((result) => result.status)).resolves.toEqual(
      VerificationStatus.OK,
    );

    // console.log(importedToken.toString());
  }, 30000);
});
