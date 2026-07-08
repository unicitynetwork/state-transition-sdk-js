import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { HexConverter } from '../../src/util/HexConverter.js';

export function createRootTrustBase(publicKey: Uint8Array): RootTrustBase {
  return RootTrustBase.fromJSON({
    changeRecordHash: null,
    epoch: '0',
    epochStartRound: '0',
    networkId: NetworkId.LOCAL.id,
    previousEntryHash: null,
    quorumThreshold: '1',
    rootNodes: [
      {
        nodeId: 'NODE',
        sigKey: HexConverter.encode(publicKey),
        stake: '1',
      },
    ],
    signatures: {},
    stateHash: '00',
    version: '1',
  });
}
