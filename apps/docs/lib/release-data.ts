export const RELEASE_DATA = {
  sdk: { name: "basin-sdk", version: "0.1.0", node: ">=20.9.0" },
  protocol: { version: "1", chain: "Ethereum Sepolia", chainId: 11155111 },
  deployments: {
    router: "0x38be3a868778df3fc6e37c25ebc4cf29f81077b2",
    activation: "0xC6a2FabD29a80b04b16bd72eFa7c3016213147b1",
    asset: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    basinRegistry: "0x2baf700279609FF4aF2ff473E290DDB219284332",
  },
} as const;
