import config from './config.json' with { type: 'json' };
import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { PayToPublicKeyPredicate } from '../../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PredicateVerifier } from '../../../src/predicate/verification/PredicateVerifier.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { PayToScriptHash } from '../../../src/transaction/PayToScriptHash.js';
import { Token } from '../../../src/transaction/Token.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import trustBaseJson from '../trust-base.json' with { type: 'json' };

it('Token minting', async () => {
  const aggregatorClient = new AggregatorClient(config.aggregatorUrl);
  const trustBase = RootTrustBase.fromJSON(trustBaseJson);

  const client = new StateTransitionClient(aggregatorClient);

  const predicateVerifier = PredicateVerifier.create();

  const ownerPrivateKey = HexConverter.decode(config.ownerPrivateKey);
  const ownerSigningService = new SigningService(ownerPrivateKey);
  const ownerPredicate = PayToPublicKeyPredicate.create(ownerSigningService);

  const mintTransaction = await MintTransaction.create(
    await PayToScriptHash.create(ownerPredicate),
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

  console.log(HexConverter.encode(token.toCBOR()));
}, 30000);
