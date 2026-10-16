import { RootTrustBase } from '../../api/bft/RootTrustBase.js';
import { HexConverter } from '../../util/HexConverter.js';

let authorityIdentityBuilds = 0;

/**
 * @returns {number} Number of authority identities built so far (a hardware-independent work counter).
 */
export function authorityIdentityBuildCount(): number {
  return authorityIdentityBuilds;
}

/**
 * Canonical text identity of everything the quorum verdict depends on: network, epoch, quorum threshold and the
 * actual signer lookup entries (map key, node id, signing key, stake) as {@link RootTrustBase.rootNodes} resolves
 * them. The trust base JSON is not enough: it lists the node values only, while signatures are resolved by map key,
 * and the map is publicly mutable.
 *
 * @param {RootTrustBase} trustBase Trust base.
 * @returns {string} Identity text.
 */
export function authorityIdentity(trustBase: RootTrustBase): string {
  authorityIdentityBuilds++;
  const nodes = Array.from(trustBase.rootNodes.entries())
    .map(([key, node]) => [key, node.nodeId, HexConverter.encode(node.signingKey), node.stakedAmount.toString()])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([
    trustBase.networkId.id,
    trustBase.epoch.toString(),
    trustBase.epochStartRound.toString(),
    trustBase.quorumThreshold.toString(),
    nodes,
    JSON.stringify(trustBase.toJSON()),
  ]);
}
