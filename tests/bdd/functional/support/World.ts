import { World, setWorldConstructor, setDefaultTimeout } from '@cucumber/cucumber';

import { ShardLoadRunner } from './ShardLoadRunner.js';
import { ILoadTestReport, IPreparedOperation } from './ShardLoadTypes.js';
import { AddressingMethod, ITestSetup, IUser } from './TestSetup.js';
import { ITokenTree } from './TokenTreeBuilder.js';
import { CertificationResponse, CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { AssetId } from '../../../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { Token } from '../../../../src/transaction/Token.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { UnicityIdToken } from '../../../../src/unicity-id/UnicityIdToken.js';
import { VerificationResult } from '../../../../src/verification/VerificationResult.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';

export const DEFAULT_STEP_TIMEOUT = 30_000;
export const LOAD_TEST_TIMEOUT = 3_600_000;
export const TREE_BUILD_TIMEOUT = 120_000;

export class TokenWorld extends World {
  public addressingMethod: AddressingMethod = 'pubkey';
  public alice!: IUser;
  public assetId1!: AssetId;
  public assetId2!: AssetId;
  public assetIds: AssetId[] = [];
  public bob!: IUser;
  public bobToken!: Token;
  public burnedToken!: Token;
  public canonicalCborStash?: {
    bytes: Uint8Array;
    stateId: import('../../../../src/api/StateId.js').StateId;
    submitError?: Error;
    submitResponse?: CertificationResponse;
  };
  public canonicalCertDataStash?: { encoded: Uint8Array; reEncoded?: Uint8Array };
  public carol!: IUser;
  public carolToken!: Token;
  public cborData!: Uint8Array;
  public cborEnvelopeStash?: { bytes: Uint8Array; thrownError?: Error };
  public cborRoundtripFirst?: Uint8Array;
  public cborRoundtripSecond?: Uint8Array;
  public certificationStatus!: CertificationStatus | null;
  public certificationStatusTree: CertificationStatus | null = null;
  public currentToken!: Token;
  public dave!: IUser;
  public daveToken!: Token;
  public dupResponseStatus?: CertificationStatus;
  public duplicateCertData?: import('../../../../src/api/CertificationData.js').CertificationData;
  public emptyProofsStash?: {
    decodeError?: Error;
    rewrittenCbor?: Uint8Array;
    thrownError?: Error;
    token?: Token;
  };
  public finalToken!: Token;
  public firstResponse!: CertificationResponse;
  public firstTransferTransaction!: TransferTransaction;
  public importedToken!: Token;
  public inclusionCertStash?: {
    bitmap?: Uint8Array;
    bytes?: Uint8Array;
    cert?: import('../../../../src/api/InclusionCertificate.js').InclusionCertificate;
    decodeError?: Error;
    leafKey?: Uint8Array;
    leafValue?: import('../../../../src/crypto/hash/DataHash.js').DataHash;
    rootHash?: import('../../../../src/crypto/hash/DataHash.js').DataHash;
    siblingCount?: number;
    verifyResult?: boolean;
  };
  public issuerPinStash?: {
    result?: import('../../../../src/verification/VerificationResult.js').VerificationResult<
      import('../../../../src/verification/VerificationStatus.js').VerificationStatus
    >;
    token: import('../../../../src/unicity-id/UnicityIdToken.js').UnicityIdToken;
    trueIssuerPublicKey: Uint8Array;
  };
  public loadTestReport!: ILoadTestReport;
  public loadTestRunner!: ShardLoadRunner;
  public mintCanonicalStash?: {
    encoded: Uint8Array;
    reEncoded?: Uint8Array;
    twin?: MintTransaction;
    twinTokenId?: TokenId;
  };
  public mintError: Error | null = null;
  public mintFieldsStash?: {
    built: MintTransaction;
    decoded?: MintTransaction;
  };
  public mintRespendStash?: {
    firstMint: MintTransaction;
    respendStatus?: CertificationStatus | null;
    respendSubmitError?: Error;
    secondMint?: MintTransaction;
    sharedSalt: import('../../../../src/transaction/TokenSalt.js').TokenSalt;
    sharedTokenType: TokenType;
  };
  public mintTokenId!: TokenId;
  public mintTokenSalt!: import('../../../../src/transaction/TokenSalt.js').TokenSalt;
  public mintTokenType!: TokenType;
  public readonly namedUsers: Map<string, IUser> = new Map();
  public readonly nametags: Map<IUser, UnicityIdToken> = new Map();
  public networkConsistencyStash?: {
    result?: import('../../../../src/verification/VerificationResult.js').VerificationResult<unknown>;
  };
  public networkIdEdgeStash?: {
    baseline?: import('../../../../src/api/NetworkId.js').NetworkId;
    first?: import('../../../../src/api/NetworkId.js').NetworkId;
    roundTripped?: import('../../../../src/api/NetworkId.js').NetworkId;
    second?: import('../../../../src/api/NetworkId.js').NetworkId;
  };
  public networkIdSaltStash?: {
    fixedNetworkId?: import('../../../../src/api/NetworkId.js').NetworkId;
    fixedSalt?: import('../../../../src/transaction/TokenSalt.js').TokenSalt;
    generatedSalt?: import('../../../../src/transaction/TokenSalt.js').TokenSalt;
    mintRoundtrip?: { built: MintTransaction; decoded?: MintTransaction };
    resolvedNetworkId?: import('../../../../src/api/NetworkId.js').NetworkId;
    thrownError?: Error;
    tokenIdPair?: { first: TokenId; second?: TokenId };
  };
  public originalToken!: Token;
  public preparedOperations!: Map<number, IPreparedOperation[]>;
  public registryStash?: {
    result?: import('../../../../src/verification/VerificationResult.js').VerificationResult<
      import('../../../../src/verification/VerificationStatus.js').VerificationStatus
    >;
    service: import('../../../../src/transaction/verification/MintJustificationVerifierService.js').MintJustificationVerifierService;
    stubInvocations: number;
    stubTag?: bigint;
    thrownError?: Error;
  };
  public requestDeterminismStash?: {
    first: { bytes: Uint8Array; stateId: import('../../../../src/api/StateId.js').StateId };
    second: { bytes: Uint8Array; stateId: import('../../../../src/api/StateId.js').StateId };
  };
  public respendSubmitError?: Error;
  public routingPinStash?: {
    pickedShard?: number;
    stateId?: import('../../../../src/api/StateId.js').StateId;
  };
  public routingShardSeen?: Set<number>;
  public routingStash?: {
    pickedShard?: number;
    rejectionError?: Error;
    stateId?: import('../../../../src/api/StateId.js').StateId;
    wrongShardResponseStatus?: string;
  };
  public sealIsolationStash?: {
    mockCert?: import('../../../../src/transaction/CertifiedMintTransaction.js').CertifiedMintTransaction;
    tamperedProof?: import('../../../../src/api/InclusionProof.js').InclusionProof;
  };
  public secondMintTransaction!: MintTransaction;
  public secondResponse!: CertificationResponse;
  public secondTransferTransaction!: TransferTransaction;
  public setup!: ITestSetup;
  public shardCount!: number;
  public shardIdLength!: number;
  public shardIdStash?: {
    bytes: Uint8Array;
    data?: Uint8Array;
    decodeError?: Error;
    decoded?: import('../../../../src/api/bft/ShardId.js').ShardId;
  };
  public shardRoutingMode: 'lsb' | 'msb' = 'lsb';
  public shardRuleStash?: {
    ruleStatus?: string;
    shardIdEncoded?: Uint8Array;
    stateId?: import('../../../../src/api/StateId.js').StateId;
  };
  public signatureRuleStash?: {
    result?: VerificationResult<unknown>;
  };
  public slotPinningStash?: {
    built: MintTransaction;
    decoded?: MintTransaction;
    originalRecipientHex: string;
  };
  public splitError: Error | null = null;
  public splitJustificationStash?: {
    certMint: import('../../../../src/transaction/CertifiedMintTransaction.js').CertifiedMintTransaction;
    decoded: import('../../../../src/payment/SplitMintJustification.js').SplitMintJustification;
    mutatedCert?: import('../../../../src/transaction/CertifiedMintTransaction.js').CertifiedMintTransaction;
    thrownError?: Error;
    verifyResult?: import('../../../../src/verification/VerificationResult.js').VerificationResult<
      import('../../../../src/verification/VerificationStatus.js').VerificationStatus
    >;
  };
  public splitTokens!: Token[];
  public stateIdEncodingStash?: {
    bytes: Uint8Array;
    decodeError?: Error;
    decoded?: import('../../../../src/api/StateId.js').StateId;
  };
  public statusStash?: { mutatedProof?: import('../../../../src/api/InclusionProof.js').InclusionProof };
  public stressMintedTokens?: Token[];
  public subSplitTokens!: Token[];
  public token!: Token;
  public tokenSaltEdgeStash?: {
    generated?: import('../../../../src/transaction/TokenSalt.js').TokenSalt[];
    inputBuffer?: Uint8Array;
    originalHex?: string;
    outputBuffer?: Uint8Array;
    salt?: import('../../../../src/transaction/TokenSalt.js').TokenSalt;
  };
  public tokens!: PaymentAssetCollection;
  public transferError: Error | null = null;
  public transferFieldsStash?: {
    built: TransferTransaction;
    decoded?: TransferTransaction;
  };
  public transferTransaction: TransferTransaction | null = null;
  public transferredToken: Token | null = null;
  public tree!: ITokenTree;
  public uidVerifierStash?: {
    aliceSigningService: import('../../../../src/crypto/secp256k1/SigningService.js').SigningService;
    lockedToken: Token;
    nametag: import('../../../../src/unicity-id/UnicityIdToken.js').UnicityIdToken;
    trueIssuerPublicKey: Uint8Array;
  };
  public unicityIdFieldsStash?: {
    built: import('../../../../src/unicity-id/UnicityIdMintTransaction.js').UnicityIdMintTransaction;
    decoded?: import('../../../../src/unicity-id/UnicityIdMintTransaction.js').UnicityIdMintTransaction;
  };
  public user!: IUser;
  public users!: Map<string, IUser>;
  public verificationResult!: VerificationResult<VerificationStatus>;
  public wireMutationStash?: {
    baseline: MintTransaction;
    tampered?: Uint8Array;
    thrownError?: Error;
  };
}

setWorldConstructor(TokenWorld);
setDefaultTimeout(DEFAULT_STEP_TIMEOUT);
