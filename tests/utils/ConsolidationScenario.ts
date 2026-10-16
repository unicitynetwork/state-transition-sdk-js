import { ShardedWorld } from './ShardedWorld.js';
import { mintToken, transferToken } from './TokenUtils.js';
import { createUnicityCertificateVerifier } from './UnicityCertificateVerifierFixture.js';
import { UnicityCertificateVerifier } from '../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../../src/serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';
import { ICborSerializable } from '../../src/serialization/cbor/ICborSerializable.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { CertifiedMintTransaction } from '../../src/transaction/CertifiedMintTransaction.js';
import { Token } from '../../src/transaction/Token.js';
import { IMintJustificationVerifier } from '../../src/transaction/verification/IMintJustificationVerifier.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { VerificationResult } from '../../src/verification/VerificationResult.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';

/** A mint justification that embeds a whole other token, which the verifier hands back for full verification. */
export const NESTED_TAG = 0x7e57n;

export class NestedTokenJustification implements ICborSerializable {
  public constructor(private readonly token: Token) {}

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(NESTED_TAG, CborSerializer.encodeByteString(this.token.toCBOR()));
  }
}

class NestedTokenJustificationVerifier implements IMintJustificationVerifier {
  public get tag(): bigint {
    return NESTED_TAG;
  }

  public async verify(
    transaction: CertifiedMintTransaction,
    collect: (token: Token) => void,
  ): Promise<VerificationResult<VerificationStatus>> {
    const bytes = transaction.justification as Uint8Array;
    collect(await Token.fromCBOR(CborDeserializer.decodeByteString(CborDeserializer.decodeTag(bytes).data)));
    return new VerificationResult('NestedTokenJustificationVerifier', VerificationStatus.OK);
  }
}

export interface IScenario {
  readonly alice: SigningService;
  readonly client: StateTransitionClient;
  readonly context: VerificationContext;
  readonly world: ShardedWorld;
  /** Mint and transfer `transfers` times, every step in its own round. */
  history(transfers: number, justification?: ICborSerializable | null): Promise<Token>;
}

export async function scenario(
  shardBits: number,
  certificateVerifier: UnicityCertificateVerifier = createUnicityCertificateVerifier(),
): Promise<IScenario> {
  const world = await ShardedWorld.create(shardBits);
  const context = new VerificationContext(
    world.trustBase,
    PredicateVerifierService.create(),
    certificateVerifier,
    new MintJustificationVerifierService().register(new NestedTokenJustificationVerifier()),
    new TokenIssuanceVerifierService(false),
  );
  const client = new StateTransitionClient(world.router);
  const alice = SigningService.generate();
  return {
    alice,
    client,
    context,
    async history(transfers, justification = null): Promise<Token> {
      const owners = [alice, ...Array.from({ length: transfers }, () => SigningService.generate())];
      let token = await mintToken(
        client,
        context,
        SignaturePredicate.create(owners[0].publicKey),
        null,
        world.network,
        undefined,
        undefined,
        justification,
      );
      for (let i = 0; i < transfers; i++) {
        token = await transferToken(
          client,
          context,
          token.toCBOR(),
          SignaturePredicate.create(owners[i + 1].publicKey),
          owners[i],
        );
      }
      return token;
    },
    world,
  };
}
