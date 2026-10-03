export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_calls: {
        Row: {
          booking_id: number | null
          cached_tokens: number
          created_at: string
          id: string
          input_tokens: number
          latency_ms: number
          message_id: string | null
          model: string
          ok: boolean
          output_tokens: number
          reasoning_tokens: number
          source: string
          task: string
        }
        Insert: {
          booking_id?: number | null
          cached_tokens?: number
          created_at?: string
          id?: string
          input_tokens?: number
          latency_ms?: number
          message_id?: string | null
          model: string
          ok?: boolean
          output_tokens?: number
          reasoning_tokens?: number
          source: string
          task: string
        }
        Update: {
          booking_id?: number | null
          cached_tokens?: number
          created_at?: string
          id?: string
          input_tokens?: number
          latency_ms?: number
          message_id?: string | null
          model?: string
          ok?: boolean
          output_tokens?: number
          reasoning_tokens?: number
          source?: string
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_calls_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          date_from: string | null
          date_to: string | null
          guest_id: string
          id: number
          notes_original: string | null
          notes_translated: string | null
          party_size: number | null
          referred_by: string | null
          slot: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          guest_id: string
          id?: number
          notes_original?: string | null
          notes_translated?: string | null
          party_size?: number | null
          referred_by?: string | null
          slot?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          guest_id?: string
          id?: number
          notes_original?: string | null
          notes_translated?: string | null
          party_size?: number | null
          referred_by?: string | null
          slot?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          language: string
          name: string
          phone: string | null
          referral_code: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          language?: string
          name: string
          phone?: string | null
          referral_code?: string | null
          role: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          language?: string
          name?: string
          phone?: string | null
          referral_code?: string | null
          role?: string
        }
        Relationships: []
      }
      decisions: {
        Row: {
          action_taken: string | null
          confidence: number | null
          created_at: string
          entities: Json | null
          id: string
          intent: string | null
          message_id: string | null
          model: string | null
          routed_to_human: boolean
        }
        Insert: {
          action_taken?: string | null
          confidence?: number | null
          created_at?: string
          entities?: Json | null
          id?: string
          intent?: string | null
          message_id?: string | null
          model?: string | null
          routed_to_human?: boolean
        }
        Update: {
          action_taken?: string | null
          confidence?: number | null
          created_at?: string
          entities?: Json | null
          id?: string
          intent?: string | null
          message_id?: string | null
          model?: string | null
          routed_to_human?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "decisions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      farm_settings: {
        Row: {
          currency: string
          directions: string
          host_id: string | null
          id: number
          max_per_slot: number
          price_per_person: number
          slots: string[]
        }
        Insert: {
          currency: string
          directions: string
          host_id?: string | null
          id?: number
          max_per_slot: number
          price_per_person: number
          slots: string[]
        }
        Update: {
          currency?: string
          directions?: string
          host_id?: string | null
          id?: number
          max_per_slot?: number
          price_per_person?: number
          slots?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "farm_settings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          booking_id: number | null
          created_at: string
          id: string
          ideas: Json
          lang: string | null
          points: Json
          sentiment: string | null
          source: string
          text_original: string
          text_translated: string | null
          themes: string[]
        }
        Insert: {
          booking_id?: number | null
          created_at?: string
          id?: string
          ideas?: Json
          lang?: string | null
          points?: Json
          sentiment?: string | null
          source?: string
          text_original: string
          text_translated?: string | null
          themes?: string[]
        }
        Update: {
          booking_id?: number | null
          created_at?: string
          id?: string
          ideas?: Json
          lang?: string | null
          points?: Json
          sentiment?: string | null
          source?: string
          text_original?: string
          text_translated?: string | null
          themes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "feedback_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_reports: {
        Row: {
          created_at: string
          id: string
          report: Json
          review_count: number
          sms_lines: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          report: Json
          review_count: number
          sms_lines?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          report?: Json
          review_count?: number
          sms_lines?: string[]
        }
        Relationships: []
      }
      messages: {
        Row: {
          booking_id: number | null
          channel: string
          contact_id: string | null
          created_at: string
          direction: string
          id: string
          lang: string | null
          provider_msg_id: string | null
          text_en: string | null
          text_original: string
          text_translated: string | null
          thread_ref: string | null
        }
        Insert: {
          booking_id?: number | null
          channel: string
          contact_id?: string | null
          created_at?: string
          direction: string
          id?: string
          lang?: string | null
          provider_msg_id?: string | null
          text_en?: string | null
          text_original: string
          text_translated?: string | null
          thread_ref?: string | null
        }
        Update: {
          booking_id?: number | null
          channel?: string
          contact_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          lang?: string | null
          provider_msg_id?: string | null
          text_en?: string | null
          text_original?: string
          text_translated?: string | null
          thread_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_prompts: {
        Row: {
          booking_id: number | null
          expires_at: string
          id: string
          kind: string
          nudged_at: string | null
          options: Json
          resolution: string | null
          resolved_at: string | null
          sent_at: string
        }
        Insert: {
          booking_id?: number | null
          expires_at?: string
          id?: string
          kind: string
          nudged_at?: string | null
          options?: Json
          resolution?: string | null
          resolved_at?: string | null
          sent_at?: string
        }
        Update: {
          booking_id?: number | null
          expires_at?: string
          id?: string
          kind?: string
          nudged_at?: string | null
          options?: Json
          resolution?: string | null
          resolved_at?: string | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_prompts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders_sent: {
        Row: {
          booking_id: number
          kind: string
        }
        Insert: {
          booking_id: number
          kind: string
        }
        Update: {
          booking_id?: number
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_sent_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reset_demo: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
