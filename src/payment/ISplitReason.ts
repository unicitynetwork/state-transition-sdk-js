import { IReason } from './IReason.js';
import { SparseMerkleTreePath } from '../smt/plain/SparseMerkleTreePath.js';
import { AssetId } from './asset/AssetId.js';
import { SparseMerkleSumTreePath } from '../smt/sum/SparseMerkleSumTreePath.js';
import { Token } from '../transaction/Token.js';

export interface ISplitReason extends IReason {
  readonly proofs: {
    readonly aggregationPath: SparseMerkleTreePath;
    readonly assetId: AssetId;
    readonly coinTreePath: SparseMerkleSumTreePath;
  };
  readonly token: Token;
}
