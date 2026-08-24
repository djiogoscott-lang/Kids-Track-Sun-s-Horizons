"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendNotificationAction } from "@/features/presence/ui/actions";
import type { Activity } from "@/server/demo/data";

export function NotificationComposer({ activities }: { activities: Activity[] }) {
  const router = useRouter();
  const [activityId, setActivityId] = useState(activities[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function submit() {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await sendNotificationAction(activityId, message);
      if (result.ok) {
        setMessage("");
        setSent(true);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold">
        Activité concernée
        <select
          value={activityId}
          onChange={(e) => setActivityId(e.target.value)}
          className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4"
        >
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Message
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Ex. : le parent d'Emma a signalé qu'elle sera récupérée à 15h30 exceptionnellement."
          className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 outline-none focus:border-[var(--primary)]"
        />
      </label>
      {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
      {sent ? <p className="text-sm font-semibold text-[var(--success)]">✓ Envoyé</p> : null}
      <Button type="button" disabled={isPending || !message.trim()} onClick={submit}>
        Envoyer
      </Button>
    </div>
  );
}
