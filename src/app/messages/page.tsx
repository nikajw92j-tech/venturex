import { MessageSquare } from "lucide-react";
import { getI18n } from "@/i18n/server";

export default async function MessagesIndex() {
  const { t } = await getI18n();
  return (
    <div className="grid h-full min-h-[50vh] place-items-center p-8 text-center">
      <div>
        <MessageSquare className="mx-auto h-10 w-10 text-slate-600" />
        <p className="mt-3 text-slate-400">{t("msg.select")}</p>
      </div>
    </div>
  );
}
