"use client";

import { Check, Mail } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button, Field, Form } from "@graphical";

import { captureEvent } from "@/lib/analytics";
import { contactEmail, endpoint, mailtoHref, maxLengths, sendContact, validateContact } from "@/lib/contact";
import type { ContactErrors, ContactField, ContactPayload, ContactResult } from "@/lib/contact";

type Status = { kind: "editing" } | { kind: "sending" } | { kind: "sent"; email: string } | Exclude<ContactResult, { kind: "sent" }>;

const empty: ContactPayload = { company: "", name: "", email: "", website: "", message: "", hp: "" };

const link = "focus-ring rounded-xs text-accent underline decoration-dotted underline-offset-4 hover:text-neutral-10";
const Email = () => (
  <a className={link} href={mailtoHref}>
    {contactEmail}
  </a>
);

/** What went wrong, in a sentence, with the address to write to instead. */
function Problem({ status }: { status: Exclude<Status, { kind: "editing" | "sending" | "sent" }> }) {
  switch (status.kind) {
    case "rejected":
      return (
        <>
          The form wasn&apos;t accepted{status.reason ? `: ${status.reason.replace(/\.$/, "")}` : ""}. Check the fields and send it again, or email <Email />.
        </>
      );
    case "failed":
      return (
        <>
          Something went wrong on our side (error {status.status}). Try again in a minute, or email <Email />.
        </>
      );
    case "network":
      return (
        <>
          We couldn&apos;t reach the server. Check your connection and try again, or email <Email />.
        </>
      );
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

const inputClass = "w-full";

function TextField({
  name,
  label,
  hint,
  value,
  error,
  onChange,
  autoComplete,
  inputMode,
  multiline = false,
}: {
  name: ContactField;
  label: string;
  hint?: string;
  value: string;
  error: string | undefined;
  onChange: (name: ContactField, value: string) => void;
  autoComplete: string;
  inputMode?: "email" | "url" | "text";
  multiline?: boolean;
}) {
  return (
    <Field.Root name={name} invalid={error !== undefined} className={multiline ? "sm:col-span-2" : undefined}>
      <Form.Label className="flex items-baseline gap-xs text-s font-medium text-neutral-10">
        {label}
        {hint ? <span className="text-xs font-normal text-neutral-7">{hint}</span> : null}
      </Form.Label>
      {multiline ? (
        <Form.Control
          className={`${inputClass} min-h-36 resize-y`}
          value={value}
          maxLength={maxLengths[name] + 100}
          onChange={(e) => onChange(name, e.currentTarget.value)}
          render={<textarea rows={6} autoComplete={autoComplete} />}
        />
      ) : (
        <Form.Control className={inputClass} type="text" value={value} inputMode={inputMode} autoComplete={autoComplete} maxLength={maxLengths[name] + 100} onChange={(e) => onChange(name, e.currentTarget.value)} />
      )}
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </Field.Root>
  );
}

/** The panel shown in place of the form, for a sent message or a build with no endpoint. */
function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex max-w-[60ch] flex-col gap-xs">
      <p className="flex items-center gap-xs text-m font-medium text-neutral-10">
        {icon}
        {title}
      </p>
      <div className="text-s text-pretty text-neutral-8">{children}</div>
    </div>
  );
}

/**
 * The private benchmarks contact form. Posts JSON to the console site's
 * /contact endpoint (lib/contact.ts); a build without that URL offers email instead.
 */
export function ContactForm({ url = endpoint }: { url?: string | null }) {
  const [values, setValues] = useState<ContactPayload>(empty);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "editing" });
  const statusRef = useRef<HTMLParagraphElement>(null);

  if (url === null)
    return (
      <Panel icon={<Mail aria-hidden className="size-4 text-neutral-7" />} title="Email us">
        <p>
          Write to <Email />{" "}with your company, the regions you care about and what you&apos;d like measured.
        </p>
      </Panel>
    );

  if (status.kind === "sent")
    return (
      <div role="status">
        <Panel icon={<Check aria-hidden className="size-4 text-success" />} title="Message sent">
          <p>Thanks. We&apos;ll reply to {status.email}.</p>
        </Panel>
      </div>
    );

  const change = (name: ContactField, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => {
      if (!e[name]) return e;
      const { [name]: _cleared, ...rest } = e;
      return rest;
    });
  };

  const submit = async () => {
    if (status.kind === "sending") return;
    const checked = validateContact(values);
    if (checked.kind === "invalid") {
      setErrors(checked.errors);
      captureEvent("private_benchmarks_contact_submitted", { outcome: "invalid" });
      // Move to the first field that needs attention, in form order.
      const first = (["company", "name", "email", "website", "message"] as const).find((f) => checked.errors[f]);
      if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    setStatus({ kind: "sending" });
    const result = await sendContact({ url, payload: checked.payload });
    captureEvent("private_benchmarks_contact_submitted", { outcome: result.kind, ...(result.kind === "failed" ? { status: result.status } : {}) });
    setStatus(result.kind === "sent" ? { kind: "sent", email: checked.payload.email } : result);
    if (result.kind !== "sent") requestAnimationFrame(() => statusRef.current?.focus());
  };

  const sending = status.kind === "sending";
  const count = Object.keys(errors).length;
  // A plain form, not the themed Form: that one runs Base UI's validation on submit and paints every
  // field it passes green, an empty optional website included. The checks here are validateContact's.
  return (
    <form
      noValidate
      aria-label="Private benchmarks contact form"
      className="flex flex-col gap-l"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-m sm:grid-cols-2">
        <TextField name="company" label="Company" value={values.company} error={errors.company} onChange={change} autoComplete="organization" />
        <TextField name="name" label="Name" value={values.name} error={errors.name} onChange={change} autoComplete="name" />
        <TextField name="email" label="Work email" value={values.email} error={errors.email} onChange={change} autoComplete="email" inputMode="email" />
        <TextField name="website" label="Website" hint="optional" value={values.website} error={errors.website} onChange={change} autoComplete="url" inputMode="url" />
        <TextField
          name="message"
          label="Message"
          hint="regions, tests, anything we should know"
          value={values.message}
          error={errors.message}
          onChange={change}
          autoComplete="off"
          multiline
        />
      </div>

      {/* The honeypot: off screen and out of the tab order, so only a bot fills it. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Leave this empty
          <input type="text" name="hp" tabIndex={-1} autoComplete="off" value={values.hp} onChange={(e) => setValues((v) => ({ ...v, hp: e.currentTarget.value }))} />
        </label>
      </div>

      <div className="flex flex-col gap-s sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" disabled={sending} className="self-start">
          {sending ? "Sending…" : "Send"}
        </Button>
        {count > 0 ? (
          <p role="alert" className="text-s text-error">
            {count === 1 ? "One field needs attention." : `${count} fields need attention.`}
          </p>
        ) : null}
      </div>

      {status.kind === "rejected" || status.kind === "failed" || status.kind === "network" ? (
        <p ref={statusRef} tabIndex={-1} role="alert" className="focus-ring max-w-[60ch] rounded-s bg-error-transparent px-m py-s text-s text-pretty text-neutral-10">
          <Problem status={status} />
        </p>
      ) : null}
    </form>
  );
}
