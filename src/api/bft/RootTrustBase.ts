import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * JSON representation of a root trust base node information.
 */
interface INodeInfoJson {
  /**
   * Node id.
   */
  readonly nodeId: string;
  /**
   * Signing key.
   */
  readonly sigKey: string;
  /**
   * Staked amount.
   */
  readonly stake: string;
}

/**
 * Root trust base node information.
 */
export class RootTrustBaseNodeInfo {
  /**
   * RootTrustBaseNodeInfo constructor.
   * @param nodeId node id.
   * @param _signingKey signing key.
   * @param stakedAmount staked amount.
   */
  private constructor(
    public readonly nodeId: string,
    private readonly _signingKey: Uint8Array,
    public readonly stakedAmount: bigint,
  ) {
    this._signingKey = new Uint8Array(_signingKey);
  }

  /**
   * Get the signing key.
   */
  public get signingKey(): Uint8Array {
    return new Uint8Array(this._signingKey);
  }

  /**
   * Create a RootTrustBaseNodeInfo from JSON representation.
   * @param input JSON representation.
   * @return RootTrustBaseNodeInfo instance.
   */
  public static fromJSON(input: unknown): RootTrustBaseNodeInfo {
    if (!RootTrustBaseNodeInfo.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }
    return new RootTrustBaseNodeInfo(input.nodeId, HexConverter.decode(input.sigKey), BigInt(input.stake));
  }

  /**
   * Check whether the input is a JSON representation of RootTrustBaseNodeInfo.
   * @param input input to check.
   * @return true if the input is a JSON representation of RootTrustBaseNodeInfo.
   */
  public static isJSON(input: unknown): input is INodeInfoJson {
    return typeof input === 'object' && input !== null && 'nodeId' in input && 'sigKey' in input && 'stake' in input;
  }
}

/**
 * JSON shape of a {@link RootTrustBase}.
 */
interface IRootTrustBaseJson {
  readonly changeRecordHash: string | null;
  readonly epoch: string;
  readonly epochStartRound: string;
  readonly networkId: number;
  readonly previousEntryHash: string | null;
  readonly quorumThreshold: string;
  readonly rootNodes: INodeInfoJson[];
  readonly signatures: { [key: string]: string };
  readonly stateHash: string;
  readonly version: string;
}

/**
 * Root trust base information.
 */
export class RootTrustBase {
  public constructor(
    public readonly version: bigint,
    public readonly networkId: number,
    public readonly epoch: bigint,
    public readonly epochStartRound: bigint,
    public readonly _rootNodes: RootTrustBaseNodeInfo[],
    public readonly quorumThreshold: bigint,
    public readonly _stateHash: Uint8Array,
    public readonly _changeRecordHash: Uint8Array | null,
    public readonly _previousEntryHash: Uint8Array | null,
    private readonly _signatures: Map<string, Uint8Array>,
  ) {
    this._rootNodes = _rootNodes.slice();
    this._stateHash = new Uint8Array(_stateHash);
    this._changeRecordHash = _changeRecordHash ? new Uint8Array(_changeRecordHash) : null;
    this._previousEntryHash = _previousEntryHash ? new Uint8Array(_previousEntryHash) : null;
    this._signatures = new Map(
      Array.from(_signatures.entries()).map((_signature) => [_signature[0], new Uint8Array(_signature[1])]),
    );
  }

  /**
   * Get the change record hash.
   */
  public get changeRecordHash(): Uint8Array | null {
    return this._changeRecordHash ? new Uint8Array(this._changeRecordHash) : null;
  }

  /**
   * Get the previous entry hash.
   */
  public get previousEntryHash(): Uint8Array | null {
    return this._previousEntryHash ? new Uint8Array(this._previousEntryHash) : null;
  }

  /**
   * Get the root nodes.
   */
  public get rootNodes(): RootTrustBaseNodeInfo[] {
    return this._rootNodes.slice();
  }

  /**
   * Get the signatures.
   */
  public get signatures(): Map<string, Uint8Array> {
    return new Map(
      Array.from(this._signatures.entries()).map((_signature) => [_signature[0], new Uint8Array(_signature[1])]),
    );
  }

  /**
   * Get the state hash.
   */
  public get stateHash(): Uint8Array {
    return new Uint8Array(this._stateHash);
  }

  /**
   * Create a root trust base from JSON string.
   *
   * @param input JSON string
   * @return root trust base
   */
  public static fromJSON(input: unknown): RootTrustBase {
    if (!RootTrustBase.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new RootTrustBase(
      BigInt(input.version),
      input.networkId,
      BigInt(input.epoch),
      BigInt(input.epochStartRound),
      input.rootNodes.map((node) => RootTrustBaseNodeInfo.fromJSON(node)),
      BigInt(input.quorumThreshold),
      HexConverter.decode(input.stateHash),
      input.changeRecordHash ? HexConverter.decode(input.changeRecordHash) : null,
      input.previousEntryHash ? HexConverter.decode(input.previousEntryHash) : null,
      new Map(Object.entries(input.signatures).map(([id, signature]) => [id, HexConverter.decode(signature)])),
    );
  }

  /**
   * Check whether the input is a JSON representation of RootTrustBase.
   * @param input input to check.
   * @return true if the input is a JSON representation of RootTrustBase.
   */
  public static isJSON(input: unknown): input is IRootTrustBaseJson {
    return (
      typeof input === 'object' &&
      input !== null &&
      'version' in input &&
      'networkId' in input &&
      'epoch' in input &&
      'epochStartRound' in input &&
      'rootNodes' in input &&
      Array.isArray(input.rootNodes) &&
      'quorumThreshold' in input &&
      'stateHash' in input &&
      'changeRecordHash' in input &&
      'previousEntryHash' in input &&
      'signatures' in input &&
      typeof input.signatures == 'object' &&
      input.signatures !== null
    );
  }

  /**
   * @returns {string} String representation of the trust base.
   */
  public toString(): string {
    return dedent`
    RootTrustBase:
      Version: ${this.version},
      NetworkId: ${this.networkId},
      Epoch: ${this.epoch},
      EpochStartRound: ${this.epochStartRound},
      RootNodes: [${this.rootNodes.map((node) => node.nodeId).join(', ')}],
      QuorumThreshold: ${this.quorumThreshold},
      StateHash: ${HexConverter.encode(this.stateHash)},
      ChangeRecordHash: ${this.changeRecordHash ? HexConverter.encode(this.changeRecordHash) : 'null'},
      PreviousEntryHash: ${this.previousEntryHash ? HexConverter.encode(this.previousEntryHash) : 'null'},
      Signatures: [
        ${Array.from(this.signatures.entries())
          .map(([id, sig]) => `${id}: ${HexConverter.encode(sig)}`)
          .join(', ')}
      ]`;
  }
}
