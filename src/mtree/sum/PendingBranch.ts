import { Branch } from './Branch.js';
import { PendingLeafBranch } from './PendingLeafBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';

export type PendingBranch = PendingLeafBranch | PendingNodeBranch | Branch;
