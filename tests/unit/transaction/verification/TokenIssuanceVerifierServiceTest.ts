import { CertifiedMintTransaction } from '../../../../src/transaction/CertifiedMintTransaction.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { ITokenIssuanceVerifier } from '../../../../src/transaction/verification/ITokenIssuanceVerifier.js';
import { TokenIssuanceVerifierService } from '../../../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationResult } from '../../../../src/verification/VerificationResult.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';

const tokenType = new TokenType(new Uint8Array(32).fill(1));
const genesis = { tokenType } as unknown as CertifiedMintTransaction;

function createTokenIssuanceVerifier(status: VerificationStatus): ITokenIssuanceVerifier {
  return {
    tokenType,
    verify: () => Promise.resolve(new VerificationResult('Test', status)),
  };
}

describe('TokenIssuanceVerifierService', () => {
  it('should reject an unregistered token type by default', async () => {
    expect((await new TokenIssuanceVerifierService().verify(genesis)).status).toBe(VerificationStatus.FAIL);
  });

  it('should accept an unregistered token type when fail-open', async () => {
    expect((await new TokenIssuanceVerifierService(false).verify(genesis)).status).toBe(VerificationStatus.OK);
  });

  it('should run the registered verifier for a token type', async () => {
    const accepted = await new TokenIssuanceVerifierService(true)
      .register(createTokenIssuanceVerifier(VerificationStatus.OK))
      .verify(genesis);
    expect(accepted.status).toBe(VerificationStatus.OK);

    const rejected = await new TokenIssuanceVerifierService()
      .register(createTokenIssuanceVerifier(VerificationStatus.FAIL))
      .verify(genesis);
    expect(rejected.status).toBe(VerificationStatus.FAIL);
  });

  it('should reject duplicate registration for the same token type', () => {
    const service = new TokenIssuanceVerifierService().register(createTokenIssuanceVerifier(VerificationStatus.OK));
    expect(() => service.register(createTokenIssuanceVerifier(VerificationStatus.OK))).toThrow(
      'Duplicate token issuance verifier',
    );
  });
});
