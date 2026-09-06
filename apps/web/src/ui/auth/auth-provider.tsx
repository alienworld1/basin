"use client";

import {
  getEmbeddedConnectedWallet,
  PrivyProvider,
  useCreateWallet,
  useLogin,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type BasinAuth = {
  configured: boolean;
  ready: boolean;
  authenticated: boolean;
  loginError: boolean;
  login: () => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  walletStatus: "LOADING" | "READY" | "MISSING";
  prepareWallet: () => Promise<string>;
};

const AuthContext = createContext<BasinAuth | null>(null);

const unavailableAuth: BasinAuth = {
  configured: false,
  ready: true,
  authenticated: false,
  loginError: false,
  login: () => {},
  logout: async () => {},
  getAccessToken: async () => null,
  walletStatus: "MISSING",
  prepareWallet: async () => {
    throw new Error("Authentication is unavailable.");
  },
};

function PrivyAuthBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, logout, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const [loginError, setLoginError] = useState(false);
  const { login } = useLogin({
    onComplete: () => setLoginError(false),
    onError: () => setLoginError(true),
  });
  const embeddedWallet = getEmbeddedConnectedWallet(wallets);
  const readAccessToken = useCallback(
    () => (authenticated ? getAccessToken() : Promise.resolve(null)),
    [authenticated, getAccessToken],
  );

  const value = useMemo<BasinAuth>(
    () => ({
      configured: true,
      ready,
      authenticated,
      loginError,
      login: () => {
        setLoginError(false);
        login();
      },
      logout,
      getAccessToken: readAccessToken,
      walletStatus: !walletsReady
        ? "LOADING"
        : embeddedWallet
          ? "READY"
          : "MISSING",
      prepareWallet: async () => {
        if (!walletsReady) throw new Error("Wallets are still loading.");
        if (embeddedWallet) return embeddedWallet.address;
        return (await createWallet()).address;
      },
    }),
    [
      authenticated,
      createWallet,
      embeddedWallet,
      login,
      loginError,
      logout,
      readAccessToken,
      ready,
      walletsReady,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function BasinAuthProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

  if (!appId) {
    return <AuthContext value={unavailableAuth}>{children}</AuthContext>;
  }

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId || undefined}
      config={{
        loginMethods: ["email"],
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          showWalletUIs: false,
        },
      }}
    >
      <PrivyAuthBridge>{children}</PrivyAuthBridge>
    </PrivyProvider>
  );
}

export function useBasinAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("BasinAuthProvider is missing.");
  return value;
}
