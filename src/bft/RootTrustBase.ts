import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { HexConverter } from '../util/HexConverter.js';

interface INodeInfoJson {
  readonly nodeId: string;
  readonly sigKey: string;
  readonly stake: string;
}

export class RootTrustBaseNodeInfo {
  public constructor(
    public readonly nodeId: string,
    private readonly _signingKey: Uint8Array,
    public readonly stakedAmount: bigint,
  ) {
    this._signingKey = new Uint8Array(_signingKey);
  }

  public get signingKey(): Uint8Array {
    return new Uint8Array(this._signingKey);
  }

  public static isJSON(input: unknown): input is INodeInfoJson {
    return typeof input === 'object' && input !== null && 'nodeId' in input && 'sigKey' in input && 'stake' in input;
  }

  public static fromJSON(input: unknown): RootTrustBaseNodeInfo {
    if (!RootTrustBaseNodeInfo.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }
    return new RootTrustBaseNodeInfo(input.nodeId, HexConverter.decode(input.sigKey), BigInt(input.stake));
  }
}

interface IRootTrustBaseJson {
  readonly version: string;
  readonly networkId: number;
  readonly epoch: string;
  readonly epochStartRound: string;
  readonly rootNodes: INodeInfoJson[];
  readonly quorumThreshold: string;
  readonly stateHash: string;
  readonly changeRecordHash: string | null;
  readonly previousEntryHash: string | null;
  readonly signatures: { [key: string]: string };
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

  public get rootNodes(): RootTrustBaseNodeInfo[] {
    return this._rootNodes.slice();
  }

  public get stateHash(): Uint8Array {
    return new Uint8Array(this._stateHash);
  }

  public get changeRecordHash(): Uint8Array | null {
    return this._changeRecordHash ? new Uint8Array(this._changeRecordHash) : null;
  }

  public get previousEntryHash(): Uint8Array | null {
    return this._previousEntryHash ? new Uint8Array(this._previousEntryHash) : null;
  }

  public get signatures(): Map<string, Uint8Array> {
    return new Map(
      Array.from(this._signatures.entries()).map((_signature) => [_signature[0], new Uint8Array(_signature[1])]),
    );
  }

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
}
