import { loadMaxEntry } from './MaxEntryFixture.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseError } from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseHistory } from '../../../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

describe('the maximum-size entry through the history', () => {
  const fixture = loadMaxEntry();
  const genesis = (): RootTrustBaseV2 => RootTrustBaseV2.decode(HexConverter.decode(fixture.genesis));
  const successor = (): RootTrustBaseV2 => RootTrustBaseV2.decode(HexConverter.decode(fixture.entry));

  it('verifies the successor, signed by all 256 members of the genesis, against the pinned genesis', async () => {
    const history = TrustBaseHistory.create(HexConverter.decode(fixture.genesisId));
    await expect(history.append(genesis())).resolves.toBe('appended');
    await expect(history.append(successor())).resolves.toBe('appended');
    expect(history.tip?.epoch).toBe(2n);
    expect(HexConverter.encode(await (history.tip as RootTrustBaseV2).entryId())).toBe(fixture.entryId);
  });

  it('control: the successor alone, without its genesis, is refused', async () => {
    const history = TrustBaseHistory.create(HexConverter.decode(fixture.genesisId));
    await expect(history.append(successor())).rejects.toBeInstanceOf(TrustBaseError);
  });

  it('control: a genesis that is not the pinned one is refused', async () => {
    const history = TrustBaseHistory.create(HexConverter.decode(fixture.entryId));
    await expect(history.append(genesis())).rejects.toBeInstanceOf(TrustBaseError);
  });
});
