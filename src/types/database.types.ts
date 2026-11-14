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
      bookings: {
        Row: {
          attendees: number
          created_at: string
          ends_at: string
          id: string
          note: string | null
          owner_id: string
          resource_id: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          status_token_hash: string
          updated_at: string
          visitor_email: string
          visitor_name: string
          visitor_phone: string | null
        }
        Insert: {
          attendees: number
          created_at?: string
          ends_at: string
          id?: string
          note?: string | null
          owner_id: string
          resource_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          status_token_hash: string
          updated_at?: string
          visitor_email: string
          visitor_name: string
          visitor_phone?: string | null
        }
        Update: {
          attendees?: number
          created_at?: string
          ends_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          resource_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          status_token_hash?: string
          updated_at?: string
          visitor_email?: string
          visitor_name?: string
          visitor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_resource_owner_fkey"
            columns: ["resource_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      embed_configurations: {
        Row: {
          background_color: string | null
          layout: Database["public"]["Enums"]["embed_layout"]
          theme: Database["public"]["Enums"]["embed_theme"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          background_color?: string | null
          layout?: Database["public"]["Enums"]["embed_layout"]
          theme?: Database["public"]["Enums"]["embed_theme"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          background_color?: string | null
          layout?: Database["public"]["Enums"]["embed_layout"]
          theme?: Database["public"]["Enums"]["embed_theme"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "embed_configurations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_usage: {
        Row: {
          booking_count: number
          month: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          booking_count?: number
          month: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          booking_count?: number
          month?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_usage_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          max_monthly_bookings: number
          max_resources: number
          max_workspaces: number
          plan: Database["public"]["Enums"]["plan_type"]
        }
        Insert: {
          max_monthly_bookings: number
          max_resources: number
          max_workspaces: number
          plan: Database["public"]["Enums"]["plan_type"]
        }
        Update: {
          max_monthly_bookings?: number
          max_resources?: number
          max_workspaces?: number
          plan?: Database["public"]["Enums"]["plan_type"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      rate_limit_attempts: {
        Row: {
          attempted_at: string
          id: number
          ip_hash: string
          workspace_id: string
        }
        Insert: {
          attempted_at?: string
          id?: never
          ip_hash: string
          workspace_id: string
        }
        Update: {
          attempted_at?: string
          id?: never
          ip_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_attempts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_availability: {
        Row: {
          closes_at: string
          id: string
          opens_at: string
          resource_id: string
          weekday: number
        }
        Insert: {
          closes_at: string
          id?: string
          opens_at: string
          resource_id: string
          weekday: number
        }
        Update: {
          closes_at?: string
          id?: string
          opens_at?: string
          resource_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "resource_availability_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          capacity: number
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          is_available: boolean
          is_locked: boolean
          name: string
          owner_id: string
          slot_minutes: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          capacity: number
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_available?: boolean
          is_locked?: boolean
          name: string
          owner_id: string
          slot_minutes: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          capacity?: number
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_available?: boolean
          is_locked?: boolean
          name?: string
          owner_id?: string
          slot_minutes?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_workspace_owner_fkey"
            columns: ["workspace_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string | null
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          owner_id: string
          plan: Database["public"]["Enums"]["plan_type"]
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          owner_id: string
          plan?: Database["public"]["Enums"]["plan_type"]
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          owner_id?: string
          plan?: Database["public"]["Enums"]["plan_type"]
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_fkey"
            columns: ["plan"]
            isOneToOne: false
            referencedRelation: "plan_limits"
            referencedColumns: ["plan"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_locked: boolean
          name: string
          owner_id: string
          slug: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_locked?: boolean
          name: string
          owner_id: string
          slug: string
          time_zone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_locked?: boolean
          name?: string
          owner_id?: string
          slug?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_downgrade_selection: {
        Args: {
          p_owner_id: string
          p_resource_ids: string[]
          p_workspace_id: string
        }
        Returns: undefined
      }
      check_rate_limit: {
        Args: { p_ip_hash: string; p_workspace_id: string }
        Returns: boolean
      }
      claim_stripe_event: {
        Args: { p_event_id: string; p_event_type: string }
        Returns: string
      }
      current_plan: {
        Args: { p_owner_id: string }
        Returns: Database["public"]["Enums"]["plan_type"]
      }
      mark_stripe_event_processed: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      reconcile_locks: { Args: { p_owner_id: string }; Returns: undefined }
      set_resource_image: {
        Args: { p_owner_id: string; p_path: string; p_resource_id: string }
        Returns: undefined
      }
      submit_booking: {
        Args: {
          p_attendees: number
          p_note: string
          p_resource_id: string
          p_starts_at: string
          p_status_token_hash: string
          p_visitor_email: string
          p_visitor_name: string
          p_visitor_phone: string
        }
        Returns: {
          booking_ends_at: string
          booking_id: string
          booking_starts_at: string
        }[]
      }
    }
    Enums: {
      booking_status: "pending" | "approved" | "rejected" | "cancelled"
      embed_layout: "list" | "grid"
      embed_theme: "light" | "dark"
      plan_type: "free" | "pro"
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
    Enums: {
      booking_status: ["pending", "approved", "rejected", "cancelled"],
      embed_layout: ["list", "grid"],
      embed_theme: ["light", "dark"],
      plan_type: ["free", "pro"],
    },
  },
} as const
