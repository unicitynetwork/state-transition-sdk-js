import { When } from '@cucumber/cucumber';

import { transferToken } from '../support/TestSetup.js';
import { TokenWorld, TREE_BUILD_TIMEOUT } from '../support/World.js';

When(
  /^the token is transferred (\d+) times between "(\w+)" and "(\w+)"$/,
  { timeout: TREE_BUILD_TIMEOUT },
  async function (this: TokenWorld, countStr: string, userName1: string, userName2: string): Promise<void> {
    const count = parseInt(countStr, 10);
    const user1 = this.users.get(userName1);
    const user2 = this.users.get(userName2);
    if (!user1) {
      throw new Error(`User ${userName1} not found in registry`);
    }
    if (!user2) {
      throw new Error(`User ${userName2} not found in registry`);
    }

    for (let i = 0; i < count; i++) {
      const from = i % 2 === 0 ? user1 : user2;
      const to = i % 2 === 0 ? user2 : user1;
      this.currentToken = await transferToken(
        this.setup,
        this.currentToken ?? this.token,
        from.predicate,
        from.signingService,
        to.predicate,
      );
    }
  },
);
