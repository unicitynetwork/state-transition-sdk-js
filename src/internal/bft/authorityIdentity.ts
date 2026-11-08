import { RootTrustBaseV2 } from '../../api/bft/trustbase/RootTrustBaseV2.js';
import { HexConverter } from '../../util/HexConverter.js';

let authorityIdentityBuilds = 0;

/**
 * @returns {number} Number of authority identities built so far (a hardware-independent work counter).
 */
export function authorityIdentityBuildCount(): number {
  return authorityIdentityBuilds;
}

/**
 * Canonical text identity of everything the quorum verdict depends on: the complete tagged encoding of the trust-base entry (network, epoch, start
 * round, quorum threshold, the members with their keys and weights). Entries are immutable, so no snapshot is needed to keep a verdict and its key
 * from disagreeing.
 *
 * @param {RootTrustBaseV2} entry Trust-base entry.
 * @returns {string} Identity text.
 */
export function authorityIdentity(entry: RootTrustBaseV2): string {
  authorityIdentityBuilds++;
  return HexConverter.encode(entry.encode());
}
