import { IVerificationContext } from './IVerificationContext.js';
import { MintJustificationVerifierService } from './MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from './TokenIssuanceVerifierService.js';
import { RootTrustBase } from '../../api/bft/RootTrustBase.js';
import { PredicateVerifierService } from '../../predicate/verification/PredicateVerifierService.js';

/**
 * Default {@link IVerificationContext} implementation. Only the root trust base is
 * required; the predicate, mint-justification and token-issuance verifiers default to
 * the standard instances. To use custom verifiers, build and populate them before
 * constructing the context and pass them in — the context itself is immutable.
 */
export class VerificationContext implements IVerificationContext {
  /**
   * @param {RootTrustBase} trustBase Root trust base for the network.
   * @param {PredicateVerifierService} predicateVerifier Predicate verifier (defaults to the built-in set).
   * @param {MintJustificationVerifierService} mintJustificationVerifier Mint justification registry (defaults to empty).
   * @param {TokenIssuanceVerifierService} tokenIssuanceVerifier Token issuance registry (defaults to empty).
   */
  public constructor(
    public readonly trustBase: RootTrustBase,
    public readonly predicateVerifier: PredicateVerifierService = PredicateVerifierService.create(),
    public readonly mintJustificationVerifier: MintJustificationVerifierService = new MintJustificationVerifierService(),
    public readonly tokenIssuanceVerifier: TokenIssuanceVerifierService = new TokenIssuanceVerifierService(),
  ) {}
}
