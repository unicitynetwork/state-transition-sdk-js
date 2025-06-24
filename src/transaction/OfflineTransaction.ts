import {ISerializable} from "../ISerializable.js";
import {TransactionData} from "./TransactionData.js";
import {Token} from "../token/Token.js";
import {OfflineCommitment} from "./OfflineCommitment.js";

/**
 * Represents a transaction with its commitment for offline processing.
 */
export class OfflineTransaction implements ISerializable {
    /**
     * @param commitment  The commitment for the transaction
     * @param token
     */
    public constructor(
        public readonly commitment: OfflineCommitment,
        public readonly token: Token<any>,
    ) {
    }

    static fromJson(json: unknown): OfflineTransaction {
        throw new Error("Method not implemented.");
    }

    toCBOR(): Uint8Array {
        throw new Error("Method not implemented.");
    }

    toJSON(): unknown {
        throw new Error("Method not implemented.");
    }
}
