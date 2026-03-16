import { Given } from '@cucumber/cucumber';

import { buildTokenTree } from '../support/TokenTreeBuilder.js';
import { TokenWorld, TREE_BUILD_TIMEOUT } from '../support/World.js';

Given(
  'the 4-level token tree is built',
  { timeout: TREE_BUILD_TIMEOUT },
  async function (this: TokenWorld): Promise<void> {
    this.tree = await buildTokenTree();
  },
);
