import type { Address, Hash } from "viem";

export type IdentityAvailability = {
  label: string;
  name: string;
  status: "AVAILABLE" | "OWNED_BY_REQUESTER" | "UNAVAILABLE" | "UNKNOWN";
  owner?: Address;
  checkedAtBlock: string;
};

export type PermissionProfile = {
  valid: true;
  hash: Hash;
  controllerCanSetIdentityRecord: true;
  transferDisabled: true;
  resolverBootstrapAuthorityRemoved: true;
  registryDangerousAuthorityAbsent: true;
};

export type VerifiedIdentityState = {
  name: string;
  label: string;
  namehash: Hash;
  payeeId: Hash;
  registryAddress: Address;
  tokenId: string;
  registryState: "REGISTERED";
  controllerAddress: Address;
  resolverAddress: Address;
  resolverImplementationAddress: Address;
  recordVersion: 1;
  identityEpoch: string;
  permissionProfile: PermissionProfile;
  transactionHash?: Hash;
  blockNumber: string;
  blockTimestamp: Date;
  verifiedAt: string;
  isTransferable: false;
  profileValid: true;
};

export type RegistrationSubmission = {
  name: string;
  transactionHash: Hash;
  resolverAddress: Address;
};
