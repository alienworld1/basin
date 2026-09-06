"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { requestBootstrap, readBootstrap } from "./bootstrap-client";
import { LandingContent } from "./landing-content";
import { LandingLoading } from "./landing-loading";
import { useBasinAuth } from "./auth-provider";

export function LandingAuthGate() {
  const auth = useBasinAuth();
  const router = useRouter();
  const [openError, setOpenError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!auth.ready || !auth.authenticated) return;
    let active = true;
    void Promise.resolve()
      .then(() => requestBootstrap(auth.getAccessToken))
      .then(async (response) => {
        if (!active) return;
        if (!response?.ok) {
          setOpenError(true);
          return;
        }
        const result = await readBootstrap(response);
        const href =
          result.workspaces.length === 1
            ? `/app?workspace=${result.workspaces[0].id}`
            : "/app";
        router.replace(href);
      })
      .catch(() => {
        if (active) {
          setOpenError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [auth.authenticated, auth.getAccessToken, auth.ready, retryCount, router]);

  if (!auth.ready || (auth.authenticated && !openError))
    return <LandingLoading />;

  if (auth.authenticated) {
    return (
      <LandingContent
        onOpen={() => {
          setOpenError(false);
          setRetryCount((count) => count + 1);
        }}
        disabled={false}
        unavailable={false}
        signInFailed={false}
        openFailed
      />
    );
  }

  return (
    <LandingContent
      onOpen={auth.login}
      disabled={!auth.configured || !auth.ready}
      unavailable={!auth.configured || openError}
      signInFailed={auth.loginError}
    />
  );
}
