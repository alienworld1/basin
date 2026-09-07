"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LandingContent } from "./landing-content";
import { LandingLoading } from "./landing-loading";
import { useBasinAuth } from "./auth-provider";

export function LandingAuthGate() {
  const auth = useBasinAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.ready || !auth.authenticated) return;
    router.replace("/app");
  }, [auth.authenticated, auth.ready, router]);

  if (!auth.ready || auth.authenticated) return <LandingLoading />;

  return (
    <LandingContent
      onOpen={auth.login}
      disabled={!auth.configured || !auth.ready}
      unavailable={!auth.configured}
      signInFailed={auth.loginError}
    />
  );
}
