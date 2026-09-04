"use client";

import { ErrorState } from "@/src/ui/error-state";

type WorkspaceErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function WorkspaceError({ reset }: WorkspaceErrorProps) {
  return (
    <ErrorState
      title="We couldn't open your workspace."
      description="The workspace is still available. Try opening it again, or return home."
      onRetry={reset}
      showHomeLink
    />
  );
}
