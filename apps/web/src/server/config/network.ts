export const networkConfig = {
  chainId: 11155111,
  networkName: "Ethereum Sepolia",
  explorerBaseUrl: "https://sepolia.etherscan.io",
} as const;

export type NetworkConfig = typeof networkConfig & {
  rpcUrl?: string;
};
