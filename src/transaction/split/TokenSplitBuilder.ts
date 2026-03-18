import { DataHasher } from '../../hash/DataHasher.js';
import { DataHasherFactory } from '../../hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { SparseMerkleTree } from '../../mtree/plain/SparseMerkleTree.js';
import { SparseMerkleSumTree } from '../../mtree/sum/SparseMerkleSumTree.js';
import { SparseMerkleSumTreeRootNode } from '../../mtree/sum/SparseMerkleSumTreeRootNode.js';
import { BurnPredicate } from '../../predicate/embedded/BurnPredicate.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { SigningService } from '../../sign/SigningService.js';
import { CoinId } from '../../token/fungible/CoinId.js';
import { SplitMintReasonProof } from '../../token/fungible/SplitMintReasonProof.js';
import { TokenCoinData } from '../../token/fungible/TokenCoinData.js';
import { ITokenJson, Token } from '../../token/Token.js';
import { TokenId } from '../../token/TokenId.js';
import { HexConverter } from '../../util/HexConverter.js';
import { IMintTransactionReason } from '../IMintTransactionReason.js';
import { ITransferCommitmentJson, TransferCommitment } from '../TransferCommitment.js';

type IProofMapEntryJson = [string, unknown[]];

interface ITokenSplitJson {
  readonly predicate: string;
  readonly commitment: ITransferCommitmentJson;
  readonly proofs: IProofMapEntryJson[];
  readonly token: ITokenJson;
}

class ProofMapEntry {
  private constructor(
    public readonly tokenId: TokenId,
    private readonly _proofs: SplitMintReasonProof[],
  ) {
    this._proofs = _proofs.slice();
  }

  public get proofs(): SplitMintReasonProof[] {
    return this._proofs.slice();
  }

  public static create(tokenId: TokenId, proofs: SplitMintReasonProof[]): ProofMapEntry {
    return new ProofMapEntry(tokenId, proofs);
  }

  public static fromCBOR(bytes: Uint8Array): ProofMapEntry {
    const data = CborDeserializer.readArray(bytes);
    return new ProofMapEntry(
      TokenId.fromCBOR(data[0]),
      CborDeserializer.readArray(data[1]).map((proof) => SplitMintReasonProof.fromCBOR(proof)),
    );
  }

  public static isJSON(input: unknown): input is IProofMapEntryJson {
    return (
      typeof input === 'object' &&
      input !== null &&
      Array.isArray(input) &&
      input.length === 2 &&
      typeof input[0] === 'string' &&
      Array.isArray(input[1])
    );
  }

  public static fromJSON(input: unknown): ProofMapEntry {
    if (!ProofMapEntry.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new ProofMapEntry(
      TokenId.fromJSON(input[0]),
      input[1].map((proof) => SplitMintReasonProof.fromJSON(proof)),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.tokenId.toCBOR(),
      CborSerializer.encodeArray(...this._proofs.map((proof) => proof.toCBOR())),
    );
  }

  public toJSON(): IProofMapEntryJson {
    return [this.tokenId.toJSON(), this._proofs.map((proof) => proof.toJSON())];
  }
}

class ProofMap {
  private constructor(private readonly _proofs: Map<string, ProofMapEntry>) {}

  public static create(data: [TokenId, SplitMintReasonProof[]][]): ProofMap {
    return new ProofMap(
      new Map(
        data.map(([tokenId, proofs]) => [HexConverter.encode(tokenId.bytes), ProofMapEntry.create(tokenId, proofs)]),
      ),
    );
  }

  public static fromCBOR(bytes: Uint8Array): ProofMap {
    return new ProofMap(
      new Map(
        CborDeserializer.readArray(bytes)
          .map((entry) => ProofMapEntry.fromCBOR(entry))
          .map((entry) => [HexConverter.encode(entry.tokenId.bytes), entry]),
      ),
    );
  }

  public static fromJSON(input: unknown): ProofMap {
    if (!Array.isArray(input)) {
      throw new InvalidJsonStructureError();
    }

    return new ProofMap(
      new Map(
        input
          .map((entry) => ProofMapEntry.fromJSON(entry))
          .map((entry) => [HexConverter.encode(entry.tokenId.bytes), entry]),
      ),
    );
  }

  public get(id: TokenId): ProofMapEntry | null {
    return this._proofs.get(HexConverter.encode(id.bytes)) ?? null;
  }

  public size(): number {
    return this._proofs.size;
  }

  public keys(): TokenId[] {
    return Array.from(this._proofs.values()).map((entry) => entry.tokenId);
  }

  public entries(): ProofMapEntry[] {
    return Array.from(this._proofs.values());
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(...this.entries().map((entry) => entry.toCBOR()));
  }

  public toJSON(): IProofMapEntryJson[] {
    return this.entries().map((entry) => entry.toJSON());
  }
}

/**
 * Token split request object.
 */
export class TokenSplit {
  public constructor(
    public readonly predicate: BurnPredicate,
    public readonly commitment: TransferCommitment,
    public readonly proofs: ProofMap,
    public readonly token: Token<IMintTransactionReason>,
  ) {}

  public static async fromCBOR(bytes: Uint8Array): Promise<TokenSplit> {
    const data = CborDeserializer.readArray(bytes);
    return new TokenSplit(
      BurnPredicate.fromCBOR(data[0]),
      await TransferCommitment.fromCBOR(data[1]),
      ProofMap.fromCBOR(data[2]),
      await Token.fromCBOR(data[3]),
    );
  }

  public static isJSON(input: unknown): input is ITokenSplitJson {
    return (
      typeof input === 'object' &&
      input !== null &&
      'predicate' in input &&
      typeof input.predicate === 'string' &&
      'commitment' in input &&
      'proofs' in input &&
      'token' in input
    );
  }

  public static async fromJSON(input: unknown): Promise<TokenSplit> {
    if (!TokenSplit.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new TokenSplit(
      BurnPredicate.fromCBOR(HexConverter.decode(input.predicate)),
      await TransferCommitment.fromJSON(input.commitment),
      ProofMap.fromJSON(input.proofs),
      await Token.fromJSON(input.token),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.predicate.encodeParameters(),
      this.commitment.toCBOR(),
      this.proofs.toCBOR(),
      this.token.toCBOR(),
    );
  }

  public toJSON(): ITokenSplitJson {
    return {
      commitment: this.commitment.toJSON(),
      predicate: HexConverter.encode(this.predicate.encodeParameters()),
      proofs: this.proofs.toJSON(),
      token: this.token.toJSON(),
    };
  }
}

/**
 * Token splitting builder.
 */
export class TokenSplitBuilder {
  /**
   * Split old token to new tokens.
   *
   * @param token token to be used for split
   * @param splitTokens
   * @param salt
   * @param signingService
   * @return token split object for submitting info
   */
  public static async split(
    token: Token<IMintTransactionReason>,
    splitTokens: [TokenId, TokenCoinData][],
    salt: Uint8Array,
    signingService: SigningService,
  ): Promise<TokenSplit> {
    const trees = new Map<string, [CoinId, SparseMerkleSumTree]>();

    for (const [id, coinData] of splitTokens) {
      for (const [coinId, amount] of coinData.coins) {
        let tree = trees.get(coinId.toJSON())?.[1];
        if (!tree) {
          tree = new SparseMerkleSumTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher));
          trees.set(coinId.toJSON(), [coinId, tree]);
        }

        await tree.addLeaf(id.toBitString().toBigInt(), coinId.bytes, amount);
      }
    }

    if (trees.size !== token.coins?.length) {
      throw new Error('Token has different number of coins than expected');
    }

    const aggregationTree = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher));
    const coinRoots = new Map<string, SparseMerkleSumTreeRootNode>();
    for (const [coinId, tree] of trees.values()) {
      const coinsInToken = token.coins.get(coinId);
      const root = await tree.calculateRoot();
      if (root.value !== coinsInToken) {
        throw new Error(
          `Token contained ${coinsInToken ?? 0} coins of id '${HexConverter.encode(coinId.bytes)}', but tree has ${root.value}`,
        );
      }

      coinRoots.set(coinId.toJSON(), root);
      await aggregationTree.addLeaf(coinId.toBitString().toBigInt(), root.hash.imprint);
    }

    const aggregationRoot = await aggregationTree.calculateRoot();

    const proofs: [TokenId, SplitMintReasonProof[]][] = [];

    for (const [id, coinData] of splitTokens) {
      proofs.push([
        id,
        coinData!.coins.map(
          ([coinId]) =>
            new SplitMintReasonProof(
              coinId,
              aggregationRoot.getPath(coinId.toBitString().toBigInt()),
              coinRoots.get(coinId.toJSON())!.getPath(id.toBitString().toBigInt()),
            ),
        ),
      ]);
    }

    const burnPredicate = new BurnPredicate(token.id, token.type, aggregationRoot.hash);
    return new TokenSplit(
      burnPredicate,
      await TransferCommitment.create(
        token,
        await burnPredicate.getReference().then((reference) => reference.toAddress()),
        salt,
        null,
        null,
        signingService,
      ),
      ProofMap.create(proofs),
      token,
    );
  }
}
