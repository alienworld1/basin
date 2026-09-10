import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  type Address,
  type Hex,
} from "viem";

export const BASIN_ROUTER_ACTIVATION_VERSION = "1";

export const basinRouterActivationAbi = [
  {
    type: "function",
    name: "nextNonce",
    stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "activateApprovedPayee",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "acceptance",
        type: "tuple",
        components: [
          { name: "organization", type: "address" },
          { name: "relationshipNamehash", type: "bytes32" },
          { name: "relationshipTokenId", type: "uint256" },
          { name: "payeeId", type: "bytes32" },
          { name: "securityRootCommitment", type: "bytes32" },
          { name: "expiry", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      { name: "recipient", type: "address" },
      { name: "signature", type: "bytes" },
      {
        name: "context",
        type: "tuple",
        components: [
          { name: "identityLabel", type: "string" },
          { name: "organizationLabel", type: "string" },
          { name: "relationshipRegistry", type: "address" },
          { name: "resolver", type: "address" },
          { name: "identityEpoch", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "acceptedRoot",
    stateMutability: "view",
    inputs: [
      { name: "organization", type: "address" },
      { name: "relationshipNamehash", type: "bytes32" },
      { name: "relationshipTokenId", type: "uint256" },
    ],
    outputs: [
      { name: "commitment", type: "bytes32" },
      { name: "payeeId", type: "bytes32" },
      { name: "expiry", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "ApprovedPayeeActivated",
    inputs: [
      { name: "organization", type: "address", indexed: true },
      { name: "relationshipNamehash", type: "bytes32", indexed: true },
      { name: "relationshipTokenId", type: "uint256", indexed: true },
      { name: "payeeId", type: "bytes32", indexed: false },
      { name: "securityRootCommitment", type: "bytes32", indexed: false },
      { name: "expiry", type: "uint256", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
    ],
  },
] as const;

export type SecurityRootV1 = {
  payeeId: Hex;
  identityController: Address;
  identityEpoch: bigint;
  relationshipRegistry: Address;
  relationshipTokenId: bigint;
  resolverProxy: Address;
  resolverImplementation: Address;
  resolverImplementationCodeHash: Hex;
  resolverPermissionProfileHash: Hex;
  registryPermissionProfileHash: Hex;
};

export type ApprovedPayeeAcceptance = {
  organization: Address;
  relationshipNamehash: Hex;
  relationshipTokenId: bigint;
  payeeId: Hex;
  securityRootCommitment: Hex;
  expiry: bigint;
  nonce: bigint;
};

export const securityRootParameters = [
  { name: "payeeId", type: "bytes32" },
  { name: "identityController", type: "address" },
  { name: "identityEpoch", type: "uint256" },
  { name: "relationshipRegistry", type: "address" },
  { name: "relationshipTokenId", type: "uint256" },
  { name: "resolverProxy", type: "address" },
  { name: "resolverImplementation", type: "address" },
  { name: "resolverImplementationCodeHash", type: "bytes32" },
  { name: "resolverPermissionProfileHash", type: "bytes32" },
  { name: "registryPermissionProfileHash", type: "bytes32" },
] as const;

export function securityRootCommitment(root: SecurityRootV1) {
  return keccak256(
    encodeAbiParameters(securityRootParameters, [
      root.payeeId,
      root.identityController,
      root.identityEpoch,
      root.relationshipRegistry,
      root.relationshipTokenId,
      root.resolverProxy,
      root.resolverImplementation,
      root.resolverImplementationCodeHash,
      root.resolverPermissionProfileHash,
      root.registryPermissionProfileHash,
    ]),
  );
}

export const acceptanceTypes = {
  AcceptApprovedPayee: [
    { name: "organization", type: "address" },
    { name: "relationshipNamehash", type: "bytes32" },
    { name: "relationshipTokenId", type: "uint256" },
    { name: "payeeId", type: "bytes32" },
    { name: "securityRootCommitment", type: "bytes32" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export function acceptanceMessageHash(
  verifyingContract: Address,
  message: ApprovedPayeeAcceptance,
) {
  return hashTypedData({
    domain: {
      name: "BasinRouter",
      version: BASIN_ROUTER_ACTIVATION_VERSION,
      chainId: 11155111,
      verifyingContract,
    },
    types: acceptanceTypes,
    primaryType: "AcceptApprovedPayee",
    message,
  });
}
