import { CertificationData } from '../../../src/api/CertificationData.js';
import { PayToPublicKeyPredicate } from '../../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { HexConverter } from '../../../src/serialization/HexConverter.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
import { TokenType } from '../../../src/transaction/TokenType.js';

describe('CertificationData', () => {
  it('should encode and decode to exactly same object', async () => {
    const certificationData = await CertificationData.fromMintTransaction(
      await MintTransaction.create(
        PayToPublicKeyPredicate.create(
          HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026'),
        ),
        new TokenId(new Uint8Array(32)),
        new TokenType(new Uint8Array(32)),
        new Uint8Array(0),
      ),
    );
    expect(HexConverter.encode(certificationData.toCBOR())).toStrictEqual(
      'd998778501d9987883014101582103b00b30dcd21feaa837132ccd4b7b9595f704c9714ac66eed085f52bc396f9050582080201eff2f0c27ea9c8433eb999b4fd0fa5bfb4fe47fa2690859f0c83651604e5820e3dbf286359442349ae4485b65248988032068cf929ca0d6d977d9a1d52ecaa45841e2bdc16e13490073c815f85c0d1661b33806647784c65851539e3a82e91ca10106f5d96203e6461cf9504accda9daabd98e290fb18c885d511ba772176316b6500',
    );
    const result = CertificationData.fromCBOR(certificationData.toCBOR());

    expect(EncodedPredicate.fromPredicate(result.lockScript).toCBOR()).toStrictEqual(
      EncodedPredicate.fromPredicate(certificationData.lockScript).toCBOR(),
    );
    expect(result.sourceStateHash.imprint).toStrictEqual(certificationData.sourceStateHash.imprint);
    expect(result.transactionHash.imprint).toStrictEqual(certificationData.transactionHash.imprint);
    expect(HexConverter.encode(result.unlockScript)).toStrictEqual(HexConverter.encode(certificationData.unlockScript));
  });
});
