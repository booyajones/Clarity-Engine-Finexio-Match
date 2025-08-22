export function StatusPill({ status }: { status: "queued" | "running" | "review" | "done" | "failed" | "enriching" | "completed" | "processing" }) {
  const map = {
    queued: { label: "Queued", cls: "bg-slate-100 text-slate-700" },
    running: { label: "Running", cls: "bg-blue-100 text-blue-700" },
    processing: { label: "Processing", cls: "bg-blue-100 text-blue-700" },
    enriching: { label: "Enriching", cls: "bg-indigo-100 text-indigo-700" },
    review: { label: "Needs review", cls: "bg-amber-100 text-amber-700" },
    done: { label: "Complete", cls: "bg-emerald-100 text-emerald-700" },
    completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
    failed: { label: "Failed", cls: "bg-rose-100 text-rose-700" },
  } as const;
  
  const config = map[status] || map.queued;
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${config.cls}`}>
      {config.label}
    </span>
  );
}