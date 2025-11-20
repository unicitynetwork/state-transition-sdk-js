import { IUserDefinedMintReasonData } from './IUserDefinedMintReasonData.js';

export interface IUserDefinedMintReasonFactory {
  create(bytes: Uint8Array): Promise<IUserDefinedMintReasonData>;
}
