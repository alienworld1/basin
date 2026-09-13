"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main><h1>We couldn&apos;t load this documentation.</h1><p>Try again, or return to Docs home.</p><button onClick={reset}>Try again</button><Link href="/">Docs home</Link></main>;
}
