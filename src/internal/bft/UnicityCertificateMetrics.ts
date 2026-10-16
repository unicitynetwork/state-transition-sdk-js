/**
 * Hardware-independent work counter of wire certificate decoding: it counts only actual parses, never interned hits.
 */
export const unicityCertificateMetrics = { decodes: 0 };
