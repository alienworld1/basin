import {
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  maxUint256,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";

export const BASIN_SETTLEMENT_RECORD_KEY = "basin.settlement";
export const settlementDescriptorParameters = [
  { type: "uint8" },
  { type: "uint256" },
  { type: "address" },
  { type: "address" },
  { type: "uint256" },
  { type: "uint256" },
] as const;
const recordParameters = [
  { type: "uint8" },
  { type: "uint256" },
  { type: "bytes32" },
] as const;
export type SettlementDescriptorV1 = {
  version: 1;
  chainId: bigint;
  asset: Address;
  destination: Address;
  settlementEpoch: bigint;
  validFrom: bigint;
};
export type SettlementRecordV1 = {
  version: 1;
  settlementEpoch: bigint;
  commitment: Hex;
};

export function receivingAddress(
  input: string,
  forbidden: readonly string[] = [],
): Address {
  const value = input.trim();
  if (!isAddress(value, { strict: true }))
    throw new Error("Enter a valid Ethereum receiving address.");
  if (value.toLowerCase() === zeroAddress)
    throw new Error("Choose a receiving account other than the zero address.");
  if (forbidden.some((item) => item.toLowerCase() === value.toLowerCase()))
    throw new Error("Choose a receiving account, not a Basin contract.");
  return value.toLowerCase() as Address;
}
export const checksumReceivingAddress = (value: string) =>
  getAddress(receivingAddress(value));
function uint(value: bigint) {
  if (typeof value !== "bigint" || value < 0n || value > maxUint256)
    throw new Error("Invalid settlement integer.");
  return value;
}
export function nextSettlementEpoch(current: bigint | null) {
  return current === null ? 0n : uint(uint(current) + 1n);
}
export function encodeSettlementDescriptor(value: SettlementDescriptorV1): Hex {
  if (value.version !== 1 || value.chainId !== 11155111n)
    throw new Error("Unsupported settlement descriptor.");
  return encodeAbiParameters(settlementDescriptorParameters, [
    1,
    value.chainId,
    receivingAddress(value.asset),
    receivingAddress(value.destination),
    uint(value.settlementEpoch),
    uint(value.validFrom),
  ]);
}
function exactBytes(value: Hex, length: number) {
  if (!new RegExp(`^0x[0-9a-fA-F]{${length * 2}}$`).test(value))
    throw new Error("Malformed settlement bytes.");
}
export function decodeSettlementDescriptor(bytes: Hex): SettlementDescriptorV1 {
  exactBytes(bytes, 192);
  const [version, chainId, asset, destination, settlementEpoch, validFrom] =
    decodeAbiParameters(settlementDescriptorParameters, bytes);
  const value = {
    version,
    chainId,
    asset: receivingAddress(asset),
    destination: receivingAddress(destination),
    settlementEpoch,
    validFrom,
  } as SettlementDescriptorV1;
  if (encodeSettlementDescriptor(value) !== bytes.toLowerCase())
    throw new Error("Noncanonical settlement descriptor.");
  return value;
}
export function settlementCommitment(value: SettlementDescriptorV1) {
  return keccak256(encodeSettlementDescriptor(value));
}
export function encodeSettlementRecord(value: SettlementRecordV1): Hex {
  exactBytes(value.commitment, 32);
  if (value.version !== 1 || value.commitment.toLowerCase() === zeroHash)
    throw new Error("Unsupported settlement record.");
  return encodeAbiParameters(recordParameters, [
    1,
    uint(value.settlementEpoch),
    value.commitment,
  ]);
}
export function decodeSettlementRecord(bytes: Hex): SettlementRecordV1 {
  exactBytes(bytes, 96);
  const [version, settlementEpoch, commitment] = decodeAbiParameters(
    recordParameters,
    bytes,
  );
  const value = { version, settlementEpoch, commitment } as SettlementRecordV1;
  if (encodeSettlementRecord(value) !== bytes.toLowerCase())
    throw new Error("Noncanonical settlement record.");
  return value;
}
export function descriptorRecord(value: SettlementDescriptorV1) {
  return encodeSettlementRecord({
    version: 1,
    settlementEpoch: value.settlementEpoch,
    commitment: settlementCommitment(value),
  });
}
export function verifyDescriptorRecord(
  descriptor: SettlementDescriptorV1,
  record: Hex,
) {
  decodeSettlementRecord(record);
  if (descriptorRecord(descriptor) !== record.toLowerCase())
    throw new Error("Receiving details do not match their commitment.");
}
