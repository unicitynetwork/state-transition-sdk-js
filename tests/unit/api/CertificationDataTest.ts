import { CertificationData } from '../../../src/api/CertificationData.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../src/predicate/EncodedPredicate.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenId } from '../../../src/transaction/TokenId.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('CertificationData', () => {
  it('should encode and decode to exactly same object', async () => {
    const certificationData = await CertificationData.fromMintTransaction(
      await MintTransaction.create(
        SignaturePredicate.create(
          HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026'),
        ),
        new TokenId(new Uint8Array(32)),
        new TokenType(new Uint8Array(32)),
      ),
    );
    expect(HexConverter.encode(certificationData.toCBOR())).toStrictEqual(
      'd998778501d9987883014101582103b00b30dcd21feaa837132ccd4b7b9595f704c9714ac66eed085f52bc396f9050582080201eff2f0c27ea9c8433eb999b4fd0fa5bfb4fe47fa2690859f0c83651604e5820076034611bb432b9a4ac3ee573ed0f687ae22d15d36dad9502cfabe6c31e0357584104e4b1681cee95339004cce2cbee141a745ca06ec4629d4d8bb8dabf32242942420fe93f900a6609e8d0c7788e7bef492110eacc7910362b375a93112b7cb41900',
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
