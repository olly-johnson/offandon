/**
 * Hand-rolled Supabase Database types: mirror of supabase/migrations/.
 *
 * Maintained manually until the Supabase CLI is wired up. When that lands,
 * regenerate with:
 *   supabase gen types typescript --linked > src/lib/shared/supabase/types.ts
 *
 * Convention here matches what `supabase gen types` produces, so the swap is
 * a no-op for callers.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          handle: string | null;
          display_name: string | null;
          data_policy_accepted: boolean;
          data_policy_accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          handle?: string | null;
          display_name?: string | null;
          data_policy_accepted?: boolean;
          data_policy_accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          handle?: string | null;
          display_name?: string | null;
          data_policy_accepted?: boolean;
          data_policy_accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      scripts: {
        Row: {
          id: string;
          user_id: string;
          batch_id: string | null;
          title: string | null;
          hook: string | null;
          body: string;
          voice_dna_snapshot: Json | null;
          source: "generated" | "rewrite" | "imported";
          status: "draft" | "published" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          batch_id?: string | null;
          title?: string | null;
          hook?: string | null;
          body: string;
          voice_dna_snapshot?: Json | null;
          source?: "generated" | "rewrite" | "imported";
          status?: "draft" | "published" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          batch_id?: string | null;
          title?: string | null;
          hook?: string | null;
          body?: string;
          voice_dna_snapshot?: Json | null;
          source?: "generated" | "rewrite" | "imported";
          status?: "draft" | "published" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      script_batches: {
        Row: {
          id: string;
          user_id: string;
          status: "pending" | "running" | "complete" | "failed";
          voice_dna_snapshot: Json;
          count_requested: number;
          count_generated: number;
          failure_reason: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: "pending" | "running" | "complete" | "failed";
          voice_dna_snapshot: Json;
          count_requested?: number;
          count_generated?: number;
          failure_reason?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: "pending" | "running" | "complete" | "failed";
          voice_dna_snapshot?: Json;
          count_requested?: number;
          count_generated?: number;
          failure_reason?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          role?: "user" | "assistant" | "system";
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ideas: {
        Row: {
          id: string;
          user_id: string;
          content: string;
          pillar: string | null;
          source: "chat" | "manual";
          conversation_id: string | null;
          message_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          pillar?: string | null;
          source: "chat" | "manual";
          conversation_id?: string | null;
          message_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          content?: string;
          pillar?: string | null;
          source?: "chat" | "manual";
          conversation_id?: string | null;
          message_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_methodology: {
        Row: {
          user_id: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_memories: {
        Row: {
          id: string;
          user_id: string;
          fact: string;
          category:
            | "ongoing_project"
            | "creator_context"
            | "preference"
            | "recent_topic";
          priority: number;
          source_conversation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          fact: string;
          category:
            | "ongoing_project"
            | "creator_context"
            | "preference"
            | "recent_topic";
          priority?: number;
          source_conversation_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          fact?: string;
          category?:
            | "ongoing_project"
            | "creator_context"
            | "preference"
            | "recent_topic";
          priority?: number;
          source_conversation_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      voice_dna: {
        Row: {
          id: string;
          user_id: string;
          dna: Json;
          source_answers: Json;
          source_questionnaire_hash: string;
          generated_at: string;
          superseded_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          dna: Json;
          source_answers: Json;
          source_questionnaire_hash: string;
          generated_at?: string;
          superseded_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          dna?: Json;
          source_answers?: Json;
          source_questionnaire_hash?: string;
          generated_at?: string;
          superseded_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      replace_voice_dna: {
        Args: {
          p_dna: Json;
          p_source_answers: Json;
          p_source_questionnaire_hash: string;
        };
        Returns: undefined;
      };
      delete_user_data: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
