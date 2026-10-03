// One entry point for every inbound message, real webhook or simulator: dedupe, find or create the
// sender, store the message, then hand it to Noor's side or the guest side.
import type { Ctx } from "./context";
import { handleGuest } from "./guest";
import { handleHost } from "./host";
import type { InboundInput, InboundResult } from "./types";

export async function handleInbound(ctx: Ctx, input: InboundInput): Promise<InboundResult> {
  const { repo } = ctx;
  if (await repo.messageSeen(input.provider_msg_id)) return { ignored: true };

  const by = input.channel === "email" ? "email" : "phone";
  const sender = input.sender.trim().toLowerCase();
  let contact = await repo.findContact(by, sender);
  if (!contact) {
    const name = input.sender_name?.trim() || sender.split("@")[0] || sender;
    contact = await repo.createGuest({
      name,
      ...(by === "email" ? { email: sender } : { phone: sender }),
      language: "en",
    });
  }

  const msg = await repo.insertMessage({
    direction: "in",
    channel: input.channel,
    contact_id: contact.id,
    provider_msg_id: input.provider_msg_id,
    thread_ref: input.thread_ref ?? null,
    text_original: input.text,
    lang: contact.language,
  });
  if (!msg) return { ignored: true }; // the same webhook arrived twice at once

  if (contact.role === "host") {
    const en = await ctx.englishOf(input.text, contact.language);
    if (en) await repo.updateMessage(msg.id, { text_en: en });
    return handleHost(ctx, msg.id, input.text);
  }
  return handleGuest(ctx, contact, msg.id, input.text, input.thread_ref ?? null);
}
