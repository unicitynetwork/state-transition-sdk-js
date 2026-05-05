import { CertifiedUnicityIdMintTransaction } from './CertifiedUnicityIdMintTransaction.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { TokenId } from '../transaction/TokenId.js';
import { TokenType } from '../transaction/TokenType.js';
import { CertifiedUnicityIdMintTransactionVerificationRule } from '../transaction/verification/rule/CertifiedUnicityIdMintTransactionVerificationRule.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';

export class UnicityIdToken {
  private constructor(public readonly genesis: CertifiedUnicityIdMintTransaction) {}

  public get id(): TokenId {
    return this.genesis.tokenId;
  }

  public get type(): TokenType {
    return this.genesis.tokenType;
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<UnicityIdToken> {
    const data = CborDeserializer.decodeArray(bytes, 1);

    return new UnicityIdToken(await CertifiedUnicityIdMintTransaction.fromCBOR(data[0]));
  }

  public static async mint(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    genesis: CertifiedUnicityIdMintTransaction,
  ): Promise<UnicityIdToken> {
    const token = new UnicityIdToken(genesis);
    const result = await token.verify(trustBase, predicateVerifier);
    if (result.status !== VerificationStatus.OK) {
      throw new VerificationError('Invalid token genesis', result);
    }

    return token;
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.genesis.toCBOR());
  }

  public toString(): string {
    return dedent`
      UnicityIdToken
        ${this.genesis.toString()}`;
  }

  public async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];
    const result = await CertifiedUnicityIdMintTransactionVerificationRule.verify(
      trustBase,
      predicateVerifier,
      this.genesis,
    );
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult('TokenVerification', VerificationStatus.FAIL, '', results);
    }

    return new VerificationResult('TokenVerification', VerificationStatus.OK, '', results);
  }
}
