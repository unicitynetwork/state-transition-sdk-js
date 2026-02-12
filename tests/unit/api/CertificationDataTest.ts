import { CertificationData } from '../../../src/api/CertificationData.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { PayToScriptHash } from '../../../src/transaction/PayToScriptHash.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
import { TokenType } from '../../../src/transaction/TokenType.js';

describe('CertificationData', () => {
  it('should encode and decode to exactly same object', async () => {
    const certificationData = await CertificationData.fromMintTransaction(
      await MintTransaction.create(
        PayToScriptHash.fromBytes(new Uint8Array(32)),
        new TokenId(new Uint8Array(32)),
        new TokenType(new Uint8Array(32)),
        new Uint8Array(0),
      ),
    );
    expect(HexConverter.encode(certificationData.toCBOR())).toStrictEqual(
      '8483014101582103b00b30dcd21feaa837132ccd4b7b9595f704c9714ac66eed085f52bc396f9050582080201eff2f0c27ea9c8433eb999b4fd0fa5bfb4fe47fa2690859f0c83651604e5820d3428d83066c996da3b3ec8a68851dfe1e0df6065bac29fce57a95b35360cecc584159613057b2c04cbf774d53325912cd9840db04c1dea4dd0ba1debf4a0e37a11a696f9c31ceec1898ea7bb83bc6d959d31f24b5810653064639883470f930deb100',
    );
    const result = CertificationData.fromCBOR(certificationData.toCBOR());

    expect(result.lockScript.toCBOR()).toStrictEqual(certificationData.lockScript.toCBOR());
    expect(result.sourceStateHash.imprint).toStrictEqual(certificationData.sourceStateHash.imprint);
    expect(result.transactionHash.imprint).toStrictEqual(certificationData.transactionHash.imprint);
    expect(HexConverter.encode(result.unlockScript)).toStrictEqual(HexConverter.encode(certificationData.unlockScript));
  });
});
