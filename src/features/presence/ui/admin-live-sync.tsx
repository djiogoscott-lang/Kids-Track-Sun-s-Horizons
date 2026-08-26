"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Silent — renders nothing. Just keeps one SSE connection open for the
 * admin's whole session and refreshes the current screen's server data
 * whenever a monitor changes a presence, a departure, or closes a session,
 * so the admin never has to manually reload to see it.
 */
export function AdminLiveSync() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/admin/stream");
    source.onmessage = () => router.refresh();
    return () => source.close();
  }, [router]);

  return null;
}
