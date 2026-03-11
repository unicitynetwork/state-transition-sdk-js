import config from './config.json' with { type: 'json' };
import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { PayToPublicKeyPredicate } from '../../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PredicateVerifier } from '../../../src/predicate/verification/PredicateVerifier.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { Address } from '../../../src/transaction/Address.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { Token } from '../../../src/transaction/Token.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';
import trustBaseJson from '../trust-base.json' with { type: 'json' };

async function receiveToken(client: StateTransitionClient, trustBase: RootTrustBase): Promise<string> {
  const predicateVerifier = PredicateVerifier.create();

  const ownerPrivateKey = HexConverter.decode(config.ownerPrivateKey);
  const ownerSigningService = new SigningService(ownerPrivateKey);
  const ownerPredicate = PayToPublicKeyPredicate.fromSigningService(ownerSigningService);

  const mintTransaction = await MintTransaction.create(
    await Address.fromPredicate(ownerPredicate),
    new TokenId(crypto.getRandomValues(new Uint8Array(32))),
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    CborSerializer.encodeTextString('My custom data'),
  );
  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);

  await client.submitCertificationRequest(certificationData);

  const token = await Token.mint(
    trustBase,
    predicateVerifier,
    await mintTransaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      await waitInclusionProof(trustBase, predicateVerifier, client, mintTransaction),
    ),
  );

  return HexConverter.encode(token.toCBOR());
}

it('Token transfer', async () => {
  const aggregatorClient = new AggregatorClient(config.aggregatorUrl);
  const trustBase = RootTrustBase.fromJSON(trustBaseJson);
  const client = new StateTransitionClient(aggregatorClient);
  const predicateVerifier = PredicateVerifier.create();

  const ownerPrivateKey = HexConverter.decode(config.ownerPrivateKey);
  const ownerSigningService = new SigningService(ownerPrivateKey);
  const ownerPredicate = PayToPublicKeyPredicate.fromSigningService(ownerSigningService);

  const tokenCBOR = HexConverter.decode(await receiveToken(client, trustBase));

  const token = await Token.fromCBOR(tokenCBOR);
  const result = await token.verify(trustBase, predicateVerifier);
  if (result.status !== VerificationStatus.OK) {
    throw new Error(`Token verification failed: ${result.status}`);
  }

  const payToScriptHash = Address.fromBytes(HexConverter.decode(config.payToScriptHash));
  const transferTransaction = await TransferTransaction.create(
    token,
    ownerPredicate,
    payToScriptHash,
    crypto.getRandomValues(new Uint8Array(32)),
    CborSerializer.encodeTextString('My custom transfer data'),
  );

  const certificationData = await CertificationData.fromTransaction(
    transferTransaction,
    await PayToPublicKeyPredicate.generateUnlockScript(transferTransaction, ownerSigningService),
  );

  const response = await client.submitCertificationRequest(certificationData);

  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Token certification failed: ${response.status}`);
  }

  const transferToken = await token.transfer(
    trustBase,
    predicateVerifier,
    await transferTransaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      await waitInclusionProof(trustBase, predicateVerifier, client, transferTransaction),
    ),
  );

  console.log(HexConverter.encode(transferToken.toCBOR()));
}, 30000);
