import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { PayToPublicKeyPredicate } from '../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PayToPublicKeyPredicateUnlockScript } from '../../src/predicate/builtin/PayToPublicKeyPredicateUnlockScript.js';
import { IUnlockScript } from '../../src/predicate/IUnlockScript.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { Address } from '../../src/transaction/Address.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { Token } from '../../src/transaction/Token.js';
import { TokenId } from '../../src/transaction/TokenId.js';
import { TokenType } from '../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';

export async function mintToken(
  client: StateTransitionClient,
  trustBase: RootTrustBase,
  predicateVerifier: PredicateVerifierService,
  recipient: Address,
  tokenId: TokenId = TokenId.generate(),
  tokenType: TokenType = TokenType.generate(),
  data: Uint8Array = CborSerializer.encodeArray(),
): Promise<Token> {
  const transaction = await MintTransaction.create(recipient, tokenId, tokenType, data);

  const certificationData = await CertificationData.fromMintTransaction(transaction);

  const response = await client.submitCertificationRequest(certificationData);
  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Certification Request failed with status '${response.status}'`);
  }

  return Token.mint(
    trustBase,
    predicateVerifier,
    await transaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      await waitInclusionProof(client, trustBase, predicateVerifier, transaction),
    ),
  );
}

export async function transferToken(
  client: StateTransitionClient,
  trustBase: RootTrustBase,
  predicateVerifier: PredicateVerifierService,
  tokenBytes: Uint8Array,
  recipient: Address,
  signingService: SigningService,
): Promise<Token> {
  const token = await Token.fromCBOR(tokenBytes);
  const result = await token.verify(trustBase, predicateVerifier);

  if (result.status !== VerificationStatus.OK) {
    throw new Error(`Token verification failed: ${result.status}`);
  }

  const x = crypto.getRandomValues(new Uint8Array(32));

  const transaction = await TransferTransaction.create(
    token,
    PayToPublicKeyPredicate.fromSigningService(signingService),
    recipient,
    x,
    CborSerializer.encodeArray(),
  );

  return transferTokenWithTransaction(
    client,
    trustBase,
    predicateVerifier,
    token,
    transaction,
    await PayToPublicKeyPredicateUnlockScript.create(transaction, signingService),
  );
}

export async function transferTokenWithTransaction(
  client: StateTransitionClient,
  trustBase: RootTrustBase,
  predicateVerifier: PredicateVerifierService,
  token: Token,
  transaction: TransferTransaction,
  unlockScript: IUnlockScript,
): Promise<Token> {
  const response = await client.submitCertificationRequest(
    await CertificationData.fromTransaction(transaction, unlockScript),
  );

  if (response.status !== CertificationStatus.SUCCESS) {
    throw new Error(`Certification Request failed with status '${response.status}'`);
  }

  return token.transfer(
    trustBase,
    predicateVerifier,
    await transaction.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      await waitInclusionProof(client, trustBase, predicateVerifier, transaction),
    ),
  );
}
