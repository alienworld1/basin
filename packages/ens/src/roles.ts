import {
  concatHex,
  encodeAbiParameters,
  keccak256,
  stringToHex,
  toHex,
} from "viem";
import { packetToBytes } from "viem/ens";

export const ROLE_REGISTRAR = 1n << 0n;
export const ROLE_UNREGISTER = 1n << 12n;
export const ROLE_SET_SUBREGISTRY = 1n << 20n;
export const ROLE_SET_RESOLVER = 1n << 24n;
export const ROLE_CAN_TRANSFER_ADMIN = (1n << 28n) << 128n;
export const ROLE_SET_DATA = 1n << 36n;
export const ROLE_CLEAR = 1n << 32n;
export const ROLE_SET_ALIAS = 1n << 28n;
export const ROLE_UPGRADE = 1n << 124n;
export const ADMIN_SHIFT = 128n;

export const REGISTRY_DANGEROUS_ROLES =
  ROLE_UNREGISTER |
  ROLE_SET_SUBREGISTRY |
  ROLE_SET_RESOLVER |
  ROLE_CAN_TRANSFER_ADMIN |
  ROLE_UPGRADE |
  ((ROLE_UNREGISTER |
    ROLE_SET_SUBREGISTRY |
    ROLE_SET_RESOLVER |
    ROLE_UPGRADE) <<
    ADMIN_SHIFT);

export function dnsEncodeName(name: string) {
  return toHex(packetToBytes(name));
}

export function resolverNameResource(node: `0x${string}`) {
  return BigInt(keccak256(concatHex([node, toHex(0n, { size: 32 })])));
}

export function resolverDataResource(node: `0x${string}`, key: string) {
  return BigInt(keccak256(concatHex([node, keccak256(stringToHex(key))])));
}

export function ownedResolverSalt(owner: `0x${string}`, version = 0n) {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [keccak256(stringToHex("OwnedResolver")), owner, version],
      ),
    ),
  );
}

export function roleCountMask(roles: bigint) {
  let mask = 0n;
  for (let offset = 0n; offset < 256n; offset += 4n) {
    if ((roles & (1n << offset)) !== 0n) mask |= 0xfn << offset;
  }
  return mask;
}
