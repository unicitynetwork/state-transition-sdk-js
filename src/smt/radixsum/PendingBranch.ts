import { FinalizedBranch } from './FinalizedBranch.js';
import { PendingLeafBranch } from './PendingLeafBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';

export type PendingBranch = PendingLeafBranch | PendingNodeBranch | FinalizedBranch;
