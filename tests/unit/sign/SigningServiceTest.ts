import { DataHash } from '../../../src/hash/DataHash.js';
import { SigningService } from '../../../src/sign/SigningService.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('SigningService', () => {
  it('should sign and verify', async () => {
    const signingService = new SigningService(
      HexConverter.decode('0000000000000000000000000000000000000000000000000000000000000001'),
    );
    const hash = DataHash.fromImprint(new Uint8Array(34));
    const signature = await signingService.sign(hash);
    await expect(signingService.verify(hash, signature)).resolves.toBeTruthy();
    await expect(
      SigningService.verifyWithPublicKey(hash, signature.bytes, signingService.publicKey),
    ).resolves.toBeTruthy();
  });
});
