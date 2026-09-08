export type IdentityTechnicalDetails = {
  receiving?: import("./settlement-types").ReceivingStatusDto;
  networkName: "Ethereum Sepolia";
  chainId: 11155111;
  name: string;
  controllerAddress: string;
  registryAddress: string;
  resolverAddress: string;
  resolverImplementationAddress: string;
  recordVersion: 1;
  identityEpoch: string;
  transactionHash?: string;
  blockNumber: string;
  checkedAt: string;
  transferDisabled: true;
  controllerCanSetIdentityRecord: true;
  bootstrapAuthorityRemoved: true;
  permissionProfileHash: string;
};

export type ActiveIdentityDto = {
  status: "ACTIVE";
  name: string;
  label: string;
  payeeId: string;
  identityEpoch: string;
  technical: IdentityTechnicalDetails;
};

export type IdentityStatusDto =
  | ActiveIdentityDto
  | {
      status: "PENDING" | "FAILED" | "COLLISION" | "NEEDS_REVIEW";
      name: string;
      message: string;
    };
