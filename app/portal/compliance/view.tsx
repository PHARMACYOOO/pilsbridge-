"use client";

import { useCallback, useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { usePortal } from "@/components/portal/store";
import { Btn, Panel, PortalHeading } from "@/components/portal/ui";
import { Badge, type BadgeTone } from "@/components/ui";
import { api, ApiError, apiBlobUrl, type ApiActivity, type ApiCompliance } from "@/lib/api";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const time = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const stateBadge: Record<ApiCompliance["kinds"][number]["state"], [BadgeTone, string]> = {
  valid: ["ok", "Valid"],
  expiring: ["warn", "Renew soon"],
  expired: ["alert", "Expired"],
  missing: ["neutral", "Not on file"],
};
const input = "h-10 w-full border border-line bg-transparent px-3 text-[13px] text-bone placeholder:text-mute focus:border-gold focus:outline-none [color-scheme:dark]";

export default function ComplianceView() {
  const [data, setData] = useState<ApiCompliance | null>(null);
  const [activity, setActivity] = useState<ApiActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([api<ApiCompliance>("/pharmacy/compliance"), api<ApiActivity[]>("/pharmacy/activity?limit=40")]);
      setData(c);
      setActivity(a);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t load compliance records.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PortalHeading eyebrow="Pharmacy" title="Compliance" />
      <p className="mt-3 max-w-[70ch] text-[13.5px] text-mute">
        Keep licences current to stay listed. We text your pharmacists 60, 30 and 7 days before each expiry, and pause the pharmacy
        automatically if the premises licence lapses. Uploads are verified by Pilbridge against the issuing body.
      </p>
      {error && <p className="mt-4 text-[13px] text-alert">{error}</p>}
      {data?.pharmacy.status === "SUSPENDED" && (
        <p className="mt-4 border border-alert/40 bg-alert/10 px-4 py-3 text-[13px] text-bone">
          Your pharmacy is paused on Pilbridge{data.pharmacy.suspendedReason ? `: ${data.pharmacy.suspendedReason}` : ""}. Upload the renewal below and Pilbridge will reinstate you once it&apos;s verified.
        </p>
      )}

      <Panel title="Licences & documents" className="mt-8">
        {!data && !error && <p className="px-5 py-6 text-[13px] text-mute">Loading…</p>}
        <ul className="divide-y divide-line-soft">
          {data?.kinds.map((k) => {
            const [tone, label] = stateBadge[k.state];
            return (
              <li key={k.kind} className="px-5 py-4">
                <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_auto] md:items-center">
                  <div>
                    <p className="text-[14px] text-bone">{k.name}</p>
                    <p className="font-mono text-[11px] text-mute">
                      {k.reference ?? "—"} · {k.current?.issuer ?? k.issuer ?? "—"}
                    </p>
                  </div>
                  <p className="text-[13px] text-stone">{k.expiresAt ? `Expires ${date(k.expiresAt)}` : k.state === "missing" ? "" : "No expiry"}</p>
                  <div className="flex flex-wrap items-center gap-3 md:justify-end">
                    {k.pending ? <Badge tone="neutral">Under verification</Badge> : <Badge tone={tone}>{label}</Badge>}
                    <button
                      onClick={() => setOpen(open === k.kind ? null : k.kind)}
                      className="flex items-center gap-1.5 border border-line px-3 py-2 text-[12.5px] text-bone hover:border-gold hover:text-gold-soft"
                    >
                      <FileUp className="h-3.5 w-3.5" /> {k.state === "missing" ? "Upload" : k.state === "valid" ? "Replace" : "Upload renewal"}
                    </button>
                  </div>
                </div>
                {k.rejected && !k.pending && <p className="mt-2 text-[12.5px] text-alert">Last upload not verified: {k.rejected.reviewNote ?? "see Pilbridge"}</p>}
                {k.current && <ViewFile id={k.current.id} name={k.current.fileName} />}
                {open === k.kind && <UploadForm kind={k.kind} expires={k.expires} issuer={k.issuer} onDone={() => { setOpen(null); load(); }} />}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Activity log" className="mt-6">
        {activity?.length === 0 && <p className="px-5 py-6 text-[13px] text-mute">No activity yet.</p>}
        <ol className="divide-y divide-line-soft">
          {activity?.map((e) => (
            <li key={e.id} className="grid grid-cols-[76px_130px_1fr] gap-3 px-5 py-3 font-mono text-[12px]">
              <span className="text-mute">{time(e.at)}</span>
              <span className="truncate text-gold">{e.who}</span>
              <span className="text-stone">{e.text}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}

function ViewFile({ id, name }: { id: string; name: string | null }) {
  const { notify } = usePortal();
  return (
    <button
      onClick={async () => {
        try {
          const url = await apiBlobUrl(`/pharmacy/compliance/documents/${id}/file`);
          window.open(url, "_blank", "noopener");
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch {
          notify("Couldn’t open the document", "error");
        }
      }}
      className="mt-2 font-mono text-[11px] text-gold hover:text-gold-soft"
    >
      View verified copy{name ? ` · ${name}` : ""}
    </button>
  );
}

function UploadForm({ kind, expires, issuer, onDone }: { kind: string; expires: boolean; issuer: string; onDone: () => void }) {
  const { notify } = usePortal();
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [issuedBy, setIssuedBy] = useState(issuer);
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-4 grid gap-3 border-t border-line-soft pt-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        const form = new FormData();
        form.append("file", file);
        form.append("kind", kind);
        form.append("reference", reference.trim());
        if (issuedBy.trim()) form.append("issuer", issuedBy.trim());
        if (expiresAt) form.append("expiresAt", expiresAt);
        setBusy(true);
        try {
          await api("/pharmacy/compliance/documents", { method: "POST", form });
          notify("Document uploaded — verification usually takes 1–2 working days");
          onDone();
        } catch (err) {
          notify(err instanceof ApiError ? err.message : "Upload failed — try again", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Licence / certificate number" className={input} aria-label="Reference number" />
      <input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="Issued by" className={input} aria-label="Issuer" />
      {expires && <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={input} aria-label="Expiry date" />}
      <input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[12.5px] text-stone file:mr-3 file:border file:border-line file:bg-transparent file:px-3 file:py-2 file:text-bone" aria-label="Document file" />
      <div className="sm:col-span-2">
        <Btn type="submit" variant="gold" disabled={busy || !file || reference.trim().length < 2 || (expires && !expiresAt)}>
          {busy ? "Uploading…" : "Upload for verification"}
        </Btn>
      </div>
    </form>
  );
}
