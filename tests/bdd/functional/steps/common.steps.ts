import { Given } from '@cucumber/cucumber';

import { createTestSetup, createUser, mintToken } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

Given('a mock aggregator client is set up', function (this: TokenWorld): void {
  this.setup = createTestSetup();
});

Given('Alice has a minted token', async function (this: TokenWorld): Promise<void> {
  this.alice = createUser();
  this.token = await mintToken(this.setup, this.alice);
});

Given('Bob is a registered user', function (this: TokenWorld): void {
  this.bob = createUser();
});
