// Repo on Supabase. Server-only: uses the service-role client, which bypasses row-level security.
import type { supabaseAdmin } from "@daraja/db/client.server";
import type { Repo } from "./repo";

type Db = typeof supabaseAdmin;

const CLOSED_STATUSES = "(DECLINED,EXPIRED,CANCELLED,CLOSED)";
const UNIQUE_VIOLATION = "23505";

export function supabaseRepo(db: Db): Repo {
  return {
    async settings() {
      const { data, error } = await db.from("farm_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },

    async contact(id) {
      const { data, error } = await db.from("contacts").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    async findContact(by, value) {
      const { data } = await db.from("contacts").select("*").eq(by, value).maybeSingle();
      return data;
    },
    async createGuest(guest) {
      const { data, error } = await db
        .from("contacts")
        .insert({ role: "guest", ...guest })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async setContactLanguage(id, language) {
      await db.from("contacts").update({ language }).eq("id", id);
    },

    async messageSeen(providerMsgId) {
      const { data } = await db
        .from("messages")
        .select("id")
        .eq("provider_msg_id", providerMsgId)
        .maybeSingle();
      return !!data;
    },
    async insertMessage(message) {
      const { data, error } = await db.from("messages").insert(message).select("id").single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return null;
        throw error;
      }
      return data;
    },
    async updateMessage(id, patch) {
      await db.from("messages").update(patch).eq("id", id);
    },

    async booking(id) {
      const { data, error } = await db.from("bookings").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    async guestBooking(guestId, id) {
      const { data } = await db
        .from("bookings")
        .select("*")
        .eq("id", id)
        .eq("guest_id", guestId)
        .maybeSingle();
      return data;
    },
    async activeBooking(guestId) {
      const { data } = await db
        .from("bookings")
        .select("*")
        .eq("guest_id", guestId)
        .not("status", "in", CLOSED_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
    async latestBooking(guestId) {
      const { data } = await db
        .from("bookings")
        .select("*")
        .eq("guest_id", guestId)
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
    async createBooking(guestId, notes) {
      const { data, error } = await db
        .from("bookings")
        .insert({ guest_id: guestId, status: "INCOMPLETE", notes_original: notes })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async updateBooking(id, patch) {
      const { data, error } = await db
        .from("bookings")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async partySizeBooked(date, slot, excludeId) {
      const { data } = await db
        .from("bookings")
        .select("party_size")
        .eq("date_from", date)
        .eq("slot", slot)
        .in("status", ["CONFIRMED", "PENDING_NOOR"])
        .neq("id", excludeId);
      return (data ?? []).reduce((sum, b) => sum + (b.party_size ?? 0), 0);
    },
    async bookingsWithStatus(status) {
      const { data } = await db.from("bookings").select("*").eq("status", status);
      return data ?? [];
    },

    async openPrompts(now, bookingId) {
      let q = db
        .from("pending_prompts")
        .select("*")
        .is("resolved_at", null)
        .gt("expires_at", now.toISOString())
        .order("sent_at", { ascending: false });
      if (bookingId) q = q.eq("booking_id", bookingId);
      const { data } = await q;
      return data ?? [];
    },
    async unresolvedPrompts(kind) {
      const { data } = await db
        .from("pending_prompts")
        .select("*")
        .is("resolved_at", null)
        .eq("kind", kind);
      return data ?? [];
    },
    async createPrompt(bookingId, kind, options = {}) {
      await db
        .from("pending_prompts")
        .insert({ booking_id: bookingId, kind, options: options as never });
    },
    async resolvePrompt(id, resolution, now) {
      await db
        .from("pending_prompts")
        .update({ resolved_at: now.toISOString(), resolution })
        .eq("id", id);
    },
    async resolvePrompts(bookingId, resolution, now, kinds) {
      let q = db
        .from("pending_prompts")
        .update({ resolved_at: now.toISOString(), resolution })
        .eq("booking_id", bookingId)
        .is("resolved_at", null);
      if (kinds) q = q.in("kind", kinds);
      await q;
    },
    async markNudged(id, now) {
      await db.from("pending_prompts").update({ nudged_at: now.toISOString() }).eq("id", id);
    },

    async logDecision(messageId, d) {
      await db.from("decisions").insert({
        message_id: messageId,
        intent: d.intent,
        confidence: d.confidence,
        entities: (d.entities ?? null) as never,
        model: d.model,
        action_taken: d.action,
        routed_to_human: d.routed,
      });
    },
    async saveFeedback(feedback) {
      await db.from("feedback").insert(feedback);
    },
    async recentFeedback(limit) {
      const { data } = await db
        .from("feedback")
        .select("text_translated, themes, sentiment")
        .order("created_at", { ascending: false })
        .limit(limit);
      return data ?? [];
    },
    async recordReminder(bookingId, kind) {
      const { error } = await db.from("reminders_sent").insert({ booking_id: bookingId, kind });
      return !error;
    },
    async resetDemo() {
      const { error } = await db.rpc("reset_demo");
      if (error) throw error;
    },
  };
}
