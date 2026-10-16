/**
 * Hardware-independent work counters of partition view handling. They only ever count; tests read the difference
 * around an operation and assert how the count grows with the parameter being swept.
 */
export interface IPartitionViewMetrics {
  /** UC derivations for a shard (tree certificate, leaf, shared partition path and seal). */
  certificateDerivations: number;
  /** Decodes of one encoded leaf (with its input record). */
  leafDecodes: number;
  /** Decodes of a whole encoded view. */
  viewDecodes: number;
}

export const partitionViewMetrics: IPartitionViewMetrics = {
  certificateDerivations: 0,
  leafDecodes: 0,
  viewDecodes: 0,
};

/**
 * @returns {IPartitionViewMetrics} Copy of the counters now.
 */
export function snapshotPartitionViewMetrics(): IPartitionViewMetrics {
  return { ...partitionViewMetrics };
}
