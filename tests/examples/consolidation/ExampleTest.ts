import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { ShardId } from '../../../src/api/bft/ShardId.js';
import { ConsolidationError } from '../../../src/consolidation/ConsolidationError.js';
import { ShardRouting } from '../../../src/consolidation/ShardRouting.js';
import { TokenProofClient } from '../../../src/consolidation/TokenProofClient.js';
import { Token } from '../../../src/transaction/Token.js';
import { IVerificationContext } from '../../../src/transaction/verification/IVerificationContext.js';
import { scenario } from '../../utils/ConsolidationScenario.js';
import { WORLD_PARTITION } from '../../utils/ShardedWorld.js';

/*
 * Explicit proof consolidation, in the two places it is meant for: before an EVM verification (including the
 * internal bridge back) and before a zkVM verification. It is never called by the SDK itself: sending, receiving,
 * verifying and serializing a token never talk to the batch proof service.
 *
 * What consolidation does: it rebuilds the *outer-history* proofs of an ordinary token so that they all share one
 * unicity seal, so a verifier that authenticates that seal once can reuse the result. What it does not do: it does not
 * make the token smaller (every proof is still carried), it does not touch proofs nested inside signed mint
 * justifications, split/burn dependencies or opaque predicate data (those keep their own seals), and it does not make
 * a host verdict evidence for a zkVM guest or an EVM contract: the target verifier authenticates the seal itself.
 */

/** The application's trusted routing, configured once. URLs and API keys never come from a token or a response. */
function configureRouting(): ShardRouting {
  return new ShardRouting({
    // one entry per shard that may take part, each with its own client and credentials
    endpoints: [
      { client: new AggregatorClient('https://shard-0.example.org', 'api-key-0'), shard: shardOf('0') },
      { client: new AggregatorClient('https://shard-1.example.org', 'api-key-1'), shard: shardOf('1') },
    ],
    partitionId: 168496141n,
    // the complete shard prefix topology of the partition
    scheme: [shardOf('0'), shardOf('1')],
  });
}

function shardOf(bits: string): ShardId {
  const bytes = new Uint8Array([bits === '0' ? 0b01000000 : 0b11000000]);
  return ShardId.decode(bytes);
}

/** Application adapters, not part of the SDK: they hand bytes to the target verifier and apply its own limits. */
interface ITargetAdapters {
  /** Admission, encoding and size limits are the adapter's business. */
  encodeForBridgeBack(tokenBytes: Uint8Array): Promise<void>;
  encodeForZkGuest(tokenBytes: Uint8Array): Promise<void>;
}

/** Before EVM verification, including the internal bridge back. */
export async function prepareForEvmBridgeBack(
  proofs: TokenProofClient,
  token: Token,
  adapters: ITargetAdapters,
  signal?: AbortSignal,
): Promise<'consolidated' | 'original'> {
  try {
    const result = await proofs.consolidate(token, { signal, timeoutMs: 10_000 });
    if (result.status === 'consolidated') {
      // A fully verified, newly built token. The EVM adapter still checks its own admission and limits.
      await adapters.encodeForBridgeBack(result.token.toCBOR());
      return 'consolidated';
    }
    // The service cannot provide the material now. `token` is unchanged and nothing is claimed about it; retrying is
    // the caller's choice (`result.retryable`), as is submitting the original token if the verifier's limits allow it.
    console.warn(`Proof preparation unavailable: ${result.reason} (retryable: ${result.retryable})`);
    await adapters.encodeForBridgeBack(token.toCBOR());
    return 'original';
  } catch (e) {
    if (ConsolidationError.is(e)) {
      if (e.retryable) {
        // transport failures and an expired deadline: a new attempt may succeed. Falling back to the original token is
        // the caller's choice and only sound when the verifier's limits allow that token.
        await adapters.encodeForBridgeBack(token.toCBOR());
        return 'original';
      }
      if (e.kind === 'cancelled') {
        throw e; // the caller's own cancellation: not a failure to hide
      }
    }
    // integrity, rejection or invalid response: the service returned material that does not verify, or the request is
    // wrong. Surface it; never retry silently and never present it as "unavailable".
    throw e;
  }
}

/** Before zkVM verification: the host prepares, the guest authenticates the master seal itself. */
export async function prepareForZkVm(
  proofs: TokenProofClient,
  token: Token,
  verificationContext: IVerificationContext,
  adapters: ITargetAdapters,
): Promise<Uint8Array> {
  const result = await proofs.consolidate(token);
  const prepared = result.status === 'consolidated' ? result.token : token;
  // The guest receives the token bytes and the trust base, verifies the seal inside the zkVM and reuses that result
  // across its proofs. The host's verdict above is not evidence for the guest.
  await adapters.encodeForZkGuest(prepared.toCBOR());
  void verificationContext.trustBase;
  return prepared.toCBOR();
}

describe('Consolidation examples', () => {
  const adapters = (): ITargetAdapters & { sent: Uint8Array[] } => {
    const sent: Uint8Array[] = [];
    return {
      encodeForBridgeBack: (bytes) => Promise.resolve(void sent.push(bytes)),
      encodeForZkGuest: (bytes) => Promise.resolve(void sent.push(bytes)),
      sent,
    };
  };

  it('documents a routing configuration', () => {
    expect(configureRouting().scheme).toHaveLength(2);
  });

  it('prepares a token for the EVM bridge back, and falls back explicitly when the service is unavailable', async () => {
    jest.setTimeout(60_000);
    const s = await scenario(1);
    const token = await s.history(3);
    const proofs = new TokenProofClient({
      routing: new ShardRouting({
        endpoints: s.world.bits.map((b) => ({ client: s.world.client(b), shard: shardOf(b) })),
        partitionId: WORLD_PARTITION,
        scheme: s.world.scheme,
      }),
      verificationContext: s.context,
    });

    const target = adapters();
    expect(await prepareForEvmBridgeBack(proofs, token, target)).toEqual('consolidated');
    const consolidated = await Token.fromCBOR(target.sent[0]);
    expect((await consolidated.verify(s.context)).status).toEqual('OK');

    // the service reports publication lag: the original token is passed on unchanged
    for (const bits of s.world.bits) {
      s.world.faults.set(bits, { lag: 1 });
    }
    const lagging = adapters();
    expect(await prepareForEvmBridgeBack(proofs, token, lagging)).toEqual('original');
    expect(lagging.sent[0]).toEqual(token.toCBOR());
  });

  it('prepares a token for a zkVM guest on the host', async () => {
    const s = await scenario(1);
    const token = await s.history(2);
    const proofs = new TokenProofClient({
      routing: new ShardRouting({
        endpoints: s.world.bits.map((b) => ({ client: s.world.client(b), shard: shardOf(b) })),
        partitionId: WORLD_PARTITION,
        scheme: s.world.scheme,
      }),
      verificationContext: s.context,
    });
    const target = adapters();
    const bytes = await prepareForZkVm(proofs, token, s.context, target);
    expect(target.sent[0]).toEqual(bytes);
    expect((await (await Token.fromCBOR(bytes)).verify(s.context)).status).toEqual('OK');
  });
});
