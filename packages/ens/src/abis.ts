import { parseAbi } from "viem";

export const registryAbi = parseAbi([
  "function getState(uint256 anyId) view returns ((uint8 status,uint64 expiry,address latestOwner,uint256 tokenId,uint256 resource) state)",
  "function getResolver(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function getParent() view returns (address parent,string label)",
  "function register(string label,address owner,address registry,address resolver,uint256 roleBitmap,uint64 expiry) returns (uint256)",
  "function roles(uint256 anyId,address account) view returns (uint256)",
  "function roleCount(uint256 anyId) view returns (uint256)",
  "function hasRootRoles(uint256 roleBitmap,address account) view returns (bool)",
  "function isApprovedForAll(address account,address operator) view returns (bool)",
]);

export const resolverAbi = parseAbi([
  "function initialize(address admin,uint256 roleBitmap,bytes[] setters)",
  "function data(bytes32 node,string key) view returns (bytes)",
  "function setData(bytes32 node,string key,bytes value)",
  "function authorizeDataRoles(bytes toName,string key,address account,bool grant) returns (bool)",
  "function multicall(bytes[] calls) returns (bytes[] results)",
  "function revokeRootRoles(uint256 roleBitmap,address account) returns (bool)",
  "function roles(uint256 resource,address account) view returns (uint256)",
  "function roleCount(uint256 resource) view returns (uint256)",
]);

export const factoryAbi = parseAbi([
  "function deployProxy(address implementation,uint256 salt,bytes data) returns (address proxy)",
  "function proxyLogic() view returns (address)",
  "function verifyContract(address proxy) view returns (address implementation)",
  "event ProxyDeployed(address indexed sender,address indexed proxyAddress,uint256 salt,address implementation)",
]);
