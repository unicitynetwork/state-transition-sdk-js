import trustBaseJson from '../trust-base.json' with { type: 'json' };
import config from './config.json' with { type: 'json' };
import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { PayToPublicKeyPredicate } from '../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PredicateVerifier } from '../../src/predicate/verification/PredicateVerifier.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../src/serialization/HexConverter.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { PayToScriptHash } from '../../src/transaction/PayToScriptHash.js';
import { Token } from '../../src/transaction/Token.js';
import { TransferTransaction } from '../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';

const aggregatorClient = new AggregatorClient('http://localhost:3000');
const trustBase = RootTrustBase.fromJSON(trustBaseJson);
const client = new StateTransitionClient(aggregatorClient);

const predicateVerifier = PredicateVerifier.create();

const ownerPrivateKey = HexConverter.decode(config.ownerPrivateKey);
const ownerSigningService = new SigningService(ownerPrivateKey);
const ownerPredicate = PayToPublicKeyPredicate.create(ownerSigningService);

const tokenCBOR = HexConverter.decode(config.token);

const token = await Token.fromCBOR(tokenCBOR);
const result = await token.verify(trustBase, predicateVerifier);
if (result.status !== VerificationStatus.OK) {
  throw new Error(`Token verification failed: ${result.status}`);
}

const payToScriptHash = PayToScriptHash.fromBytes(HexConverter.decode(config.payToScriptHash));
const transferTransaction = await TransferTransaction.create(
  token,
  ownerPredicate,
  payToScriptHash,
  crypto.getRandomValues(new Uint8Array(32)),
  CborSerializer.encodeTextString('My custom transfer data'),
);

const certificationData = await CertificationData.fromTransferTransaction(
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
