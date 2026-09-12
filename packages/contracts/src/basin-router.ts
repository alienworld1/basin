import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export const BASIN_ROUTER_VERSION = "1";
export const BASIN_ROUTER_CHAIN_ID = 11155111n;

export const basinRouterAbi = [
  {
    type: "function",
    name: "VERSION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "ensVerifier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "consumedPaymentIds",
    stateMutability: "view",
    inputs: [{ name: "paymentId", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getObligation",
    stateMutability: "view",
    inputs: [{ name: "obligationId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "organization", type: "address" },
          { name: "relationshipNamehash", type: "bytes32" },
          { name: "relationshipTokenId", type: "uint256" },
          { name: "payeeId", type: "bytes32" },
          { name: "securityRootCommitment", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "relationshipExpiry", type: "uint256" },
          { name: "maxAmount", type: "uint256" },
          { name: "remainingAmount", type: "uint256" },
          { name: "validUntil", type: "uint256" },
          { name: "metadataHash", type: "bytes32" },
          { name: "exists", type: "bool" },
          { name: "cancelled", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "executeObligation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "obligationId", type: "bytes32" },
      {
        name: "descriptor",
        type: "tuple",
        components: [
          { name: "version", type: "uint8" },
          { name: "chainId", type: "uint256" },
          { name: "asset", type: "address" },
          { name: "destination", type: "address" },
          { name: "settlementEpoch", type: "uint256" },
          { name: "validFrom", type: "uint256" },
        ],
      },
      { name: "amount", type: "uint256" },
      { name: "paymentId", type: "bytes32" },
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
    name: "createObligation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "obligationId", type: "bytes32" },
      {
        name: "approvedPayee",
        type: "tuple",
        components: [
          { name: "organization", type: "address" },
          { name: "relationshipNamehash", type: "bytes32" },
          { name: "relationshipTokenId", type: "uint256" },
          { name: "payeeId", type: "bytes32" },
          { name: "securityRootCommitment", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "expiry", type: "uint256" },
        ],
      },
      { name: "maxAmount", type: "uint256" },
      { name: "validUntil", type: "uint256" },
      { name: "metadataHash", type: "bytes32" },
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
    type: "event",
    name: "ObligationCreated",
    inputs: [
      { name: "obligationId", type: "bytes32", indexed: true },
      { name: "organization", type: "address", indexed: true },
      { name: "relationshipNamehash", type: "bytes32", indexed: true },
      { name: "relationshipTokenId", type: "uint256", indexed: false },
      { name: "payeeId", type: "bytes32", indexed: false },
      { name: "maxAmount", type: "uint256", indexed: false },
      { name: "remainingAmount", type: "uint256", indexed: false },
      { name: "asset", type: "address", indexed: false },
      { name: "validUntil", type: "uint256", indexed: false },
      { name: "metadataHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ObligationExecuted",
    inputs: [
      { name: "paymentId", type: "bytes32", indexed: true },
      { name: "obligationId", type: "bytes32", indexed: true },
      { name: "organization", type: "address", indexed: true },
      { name: "relationshipNamehash", type: "bytes32", indexed: false },
      { name: "relationshipTokenId", type: "uint256", indexed: false },
      { name: "payeeId", type: "bytes32", indexed: false },
      { name: "settlementEpoch", type: "uint256", indexed: false },
      { name: "settlementCommitment", type: "bytes32", indexed: false },
      { name: "destination", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "asset", type: "address", indexed: false },
      { name: "metadataHash", type: "bytes32", indexed: false },
      { name: "remainingAmount", type: "uint256", indexed: false },
    ],
  },
] as const;

const metadataParameters = [
  { type: "uint8" },
  { type: "uint256" },
  { type: "address" },
  { type: "bytes32" },
  { type: "uint256" },
  { type: "bytes32" },
  { type: "address" },
  { type: "uint256" },
  { type: "address" },
  { type: "string" },
  { type: "bool" },
  { type: "string" },
  { type: "uint256" },
] as const;
const obligationParameters = [
  { type: "uint8" },
  { type: "address" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint256" },
] as const;

export type ObligationMetadataV1 = {
  router: Address;
  organization: Address;
  relationshipNamehash: Hex;
  relationshipTokenId: bigint;
  payeeId: Hex;
  asset: Address;
  amount: bigint;
  purpose: string;
  reference?: string;
  expectedPaymentId: bigint;
};

export function obligationMetadataHash(value: ObligationMetadataV1): Hex {
  return keccak256(
    encodeAbiParameters(metadataParameters, [
      1,
      BASIN_ROUTER_CHAIN_ID,
      value.router,
      value.relationshipNamehash,
      value.relationshipTokenId,
      value.payeeId,
      value.asset,
      value.amount,
      value.organization,
      value.purpose.trim(),
      value.reference != null,
      value.reference?.trim() ?? "",
      value.expectedPaymentId,
    ]),
  );
}

export function obligationId(value: {
  router: Address;
  organization: Address;
  expectedPaymentId: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(obligationParameters, [
      1,
      value.router,
      BASIN_ROUTER_CHAIN_ID,
      value.organization,
      value.expectedPaymentId,
    ]),
  );
}
