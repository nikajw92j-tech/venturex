"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, ImagePlus, Lock, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Uploaded = { id: string; url: string; name: string; mime: string };

export function uploadFile(file: File, purpose: string, onProgress?: (p: number) => void): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    form.append("purpose", purpose);
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(json);
        else reject(new Error(json.error ?? "Upload failed"));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}

export function Uploader({
  label,
  purpose,
  files,
  onChange,
  multiple = true,
  max = 10,
  accept,
  privateNote,
  onError,
}: {
  label: string;
  purpose: "listing-image" | "evidence" | "message" | "dispute" | "verification" | "avatar";
  files: Uploaded[];
  onChange: (f: Uploaded[]) => void;
  multiple?: boolean;
  max?: number;
  accept?: string;
  privateNote?: string;
  onError?: (msg: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const isImage = purpose === "listing-image" || purpose === "avatar";

  async function handle(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).slice(0, Math.max(0, max - files.length));
    let current = [...files];
    await Promise.all(
      picked.map(async (f) => {
        const key = `${f.name}-${f.size}`;
        setProgress((p) => ({ ...p, [key]: 0 }));
        try {
          const up = await uploadFile(f, purpose, (v) => setProgress((p) => ({ ...p, [key]: v })));
          current = multiple ? [...current, up] : [up];
          onChange(current);
        } catch (e) {
          onError?.(`${f.name}: ${(e as Error).message}`);
        } finally {
          setProgress((p) => {
            const n = { ...p };
            delete n[key];
            return n;
          });
        }
      }),
    );
  }

  return (
    <div>
      <div className="label flex items-center gap-2">{label} {privateNote && <span className="flex items-center gap-1 text-xs font-normal text-emerald-300"><Lock className="h-3 w-3" /> {privateNote}</span>}</div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition", drag ? "border-electric-400 bg-electric/10" : "border-white/10 bg-white/[0.02] hover:border-white/20")}
      >
        {isImage ? <ImagePlus className="h-7 w-7 text-electric-400" /> : <UploadCloud className="h-7 w-7 text-electric-400" />}
        <div className="text-sm text-slate-300">Drop files or <span className="text-electric-400">browse</span></div>
        <div className="text-xs text-slate-500">{isImage ? "PNG, JPG, WEBP · up to 8 MB" : "PDF, images, CSV, XLSX, DOCX · up to 20 MB"}</div>
        <input ref={input} type="file" hidden multiple={multiple} accept={accept ?? (isImage ? "image/png,image/jpeg,image/webp,image/gif" : ".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.docx")} onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
      </div>
      {Object.keys(progress).length > 0 && (
        <div className="mt-2 space-y-1">
          {Object.entries(progress).map(([k, v]) => (
            <div key={k} className="h-1 overflow-hidden rounded-full bg-white/5"><motion.div className="h-full bg-brand" animate={{ width: `${Math.round(v * 100)}%` }} /></div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={cn("mt-3", isImage ? "grid grid-cols-3 gap-2 sm:grid-cols-4" : "space-y-2")}>
          <AnimatePresence>
            {files.map((f) => (
              <motion.div key={f.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className={cn("group relative overflow-hidden ring-1 ring-white/10", isImage ? "aspect-video rounded-xl" : "flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-sm text-slate-300")}>
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <FileText className="h-4 w-4 text-electric-400" />
                    <span className="truncate">{f.name}</span>
                  </>
                )}
                <button type="button" onClick={(e) => { e.stopPropagation(); onChange(files.filter((x) => x.id !== f.id)); }} className={cn("grid h-6 w-6 place-items-center rounded-full bg-ink-950/80 text-white", isImage ? "absolute top-1 right-1 opacity-0 transition group-hover:opacity-100" : "ml-auto")} aria-label="Remove">
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
