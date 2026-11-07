"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { simulateInboundAction } from "./actions";
import { PRESETS } from "./presets";
import type { SimChannel } from "./schema";

export function Simulator() {
  const [state, action, pending] = useActionState(simulateInboundAction, undefined);
  const [channel, setChannel] = useState<SimChannel>("email");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const errs = state?.fieldErrors;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-small font-semibold">Presets</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setChannel(p.channel);
                setName(p.name);
                setContact(p.contact);
                setMessage(p.message);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <form action={action} className="flex flex-col gap-4" noValidate>
        <Select
          name="channel"
          label="Channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as SimChannel)}
          error={errs?.channel}
        >
          <option value="email">Email (Postmark shape)</option>
          <option value="whatsapp">WhatsApp (Meta Cloud API shape)</option>
        </Select>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            name="name"
            label="Sender name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errs?.name}
            autoComplete="off"
          />
          <Input
            name="contact"
            label={channel === "email" ? "Sender email" : "Sender phone"}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={channel === "email" ? "guest@example.com" : "+919000000000"}
            error={errs?.contact}
            autoComplete="off"
          />
        </div>
        <Textarea
          name="message"
          label="Message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          error={errs?.message}
        />
        {state?.error ? (
          <p role="alert" className="text-small text-danger">
            {state.error}
          </p>
        ) : null}
        {state?.sent ? (
          <p role="status" className="text-small text-success">
            Created <strong className="font-semibold">{state.sent.enquiryId}</strong> via{" "}
            {state.sent.channel} (HTTP {state.sent.status}).
          </p>
        ) : null}
        <Button type="submit" loading={pending} className="self-start">
          Send through webhook
        </Button>
      </form>
    </div>
  );
}
