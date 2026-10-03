import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Booking, Contact, Message } from "./types";

/** Contacts, messages and bookings, kept live through Supabase Realtime. */
export function useLive() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const load = async () => {
    const [c, m, b] = await Promise.all([
      supabase.from("contacts").select("*").order("created_at"),
      supabase.from("messages").select("*").order("created_at"),
      supabase.from("bookings").select("*").order("id", { ascending: false }),
    ]);
    setContacts(c.data ?? []);
    setMessages(m.data ?? []);
    setBookings(b.data ?? []);
  };
  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(t);
      t = setTimeout(load, 150);
    };
    const ch = supabase
      .channel("sim")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, debounced)
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, []);
  return { contacts, messages, bookings, reload: load };
}
