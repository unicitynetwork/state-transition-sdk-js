import { Given, When } from '@cucumber/cucumber';

import { CborDeserializer } from '../../../../src/serialization/cbor/CborDeserializer.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { TokenWorld } from '../support/World.js';

type Decoder = 'array' | 'map' | 'unsigned-int';

// Reuses cborEnvelopeStash + the existing Then steps from cbor-envelope.steps.ts
// ('a CborError is thrown with message containing {string}' / 'no CborError is thrown').
function getStash(world: TokenWorld): { bytes: Uint8Array; thrownError?: Error } {
  if (!world.cborEnvelopeStash) {
    world.cborEnvelopeStash = { bytes: new Uint8Array() };
  }
  return world.cborEnvelopeStash;
}

Given('a hand-crafted CBOR payload {string}', function (this: TokenWorld, hex: string): void {
  const stash = getStash(this);
  stash.bytes = HexConverter.decode(hex);
  stash.thrownError = undefined;
});

When('it is decoded as a {word}', function (this: TokenWorld, decoderRaw: string): void {
  const stash = getStash(this);
  const decoder = decoderRaw as Decoder;
  try {
    switch (decoder) {
      case 'array':
        CborDeserializer.decodeArray(stash.bytes);
        break;
      case 'map':
        CborDeserializer.decodeMap(stash.bytes);
        break;
      case 'unsigned-int':
        CborDeserializer.decodeUnsignedInteger(stash.bytes);
        break;
      default:
        throw new Error(`Unknown decoder: ${decoderRaw}`);
    }
  } catch (e) {
    stash.thrownError = e as Error;
  }
});
