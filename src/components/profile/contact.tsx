"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "../ui";
import { useToast } from "../toast";
import { contactUserAction } from "@/app/actions/messages";

export function ContactUserButton({ username }: { username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" loading={pending} onClick={() => start(async () => {
      const r = await contactUserAction(username);
      if (!r.ok) return toast.error(r.error);
      router.push(`/messages/${r.data!.conversationId}`);
    })}>
      <MessageSquare className="h-4 w-4" /> Message
    </Button>
  );
}
