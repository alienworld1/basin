import { ErrorState } from "@/src/ui/error-state";

export default function NotFound() {
  return (
    <ErrorState title="We couldn't find that page." showHomeLink />
  );
}
