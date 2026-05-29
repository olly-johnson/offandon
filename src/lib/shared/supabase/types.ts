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

export type MethodologySlice = "house" | "chat" | "scripts" | "analyst";

export type Database = {
  public: {
    Tables: {
      methodology_rules: {
        Row: {
          id: string;
          slice: MethodologySlice;
          rule: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          slice: MethodologySlice;
          rule: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          slice?: MethodologySlice;
          rule?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      house_methodology: {
        Row: {
          slice: MethodologySlice;
          content: string;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          slice: MethodologySlice;
          content: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          slice?: MethodologySlice;
          content?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      house_methodology_versions: {
        Row: {
          id: string;
          slice: MethodologySlice;
          content: string;
          summary: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          slice: MethodologySlice;
          content: string;
          summary: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          slice?: MethodologySlice;
          content?: string;
          summary?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      house_methodology_proposals: {
        Row: {
          id: string;
          slice: MethodologySlice;
          new_content: string;
          summary: string;
          status: "pending" | "applied" | "discarded";
          proposed_by: string | null;
          decided_by: string | null;
          decided_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          slice: MethodologySlice;
          new_content: string;
          summary: string;
          status?: "pending" | "applied" | "discarded";
          proposed_by?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          slice?: MethodologySlice;
          new_content?: string;
          summary?: string;
          status?: "pending" | "applied" | "discarded";
          proposed_by?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      master_bot_messages: {
        Row: {
          id: string;
          author_id: string | null;
          role: "user" | "assistant" | "system";
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id?: string | null;
          role: "user" | "assistant" | "system";
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string | null;
          role?: "user" | "assistant" | "system";
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
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
          angle: string | null;
          pillar: string | null;
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
          angle?: string | null;
          pillar?: string | null;
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
          angle?: string | null;
          pillar?: string | null;
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
          source: "chat" | "manual" | "research";
          conversation_id: string | null;
          message_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          pillar?: string | null;
          source: "chat" | "manual" | "research";
          conversation_id?: string | null;
          message_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          content?: string;
          pillar?: string | null;
          source?: "chat" | "manual" | "research";
          conversation_id?: string | null;
          message_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      client_assets: {
        Row: {
          id: string;
          user_id: string;
          asset_type: "story" | "viral_reference" | "past_script" | "template";
          title: string;
          body: string;
          metadata: Json;
          source_file: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          asset_type: "story" | "viral_reference" | "past_script" | "template";
          title: string;
          body: string;
          metadata?: Json;
          source_file?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          asset_type?: "story" | "viral_reference" | "past_script" | "template";
          title?: string;
          body?: string;
          metadata?: Json;
          source_file?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_usage: {
        Row: {
          id: string;
          user_id: string | null;
          surface:
            | "chat"
            | "voice_dna"
            | "memory_extract"
            | "script"
            | "imf"
            | "hooks"
            | "single_script"
            | "script_refine"
            | "media_analysis"
            | "competitor_analysis"
            | "other";
          model: string;
          input_tokens: number;
          output_tokens: number;
          cache_creation_tokens: number;
          cache_read_tokens: number;
          stop_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          surface:
            | "chat"
            | "voice_dna"
            | "memory_extract"
            | "script"
            | "imf"
            | "hooks"
            | "single_script"
            | "script_refine"
            | "media_analysis"
            | "competitor_analysis"
            | "other";
          model: string;
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_tokens?: number;
          cache_read_tokens?: number;
          stop_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          surface?:
            | "chat"
            | "voice_dna"
            | "memory_extract"
            | "script"
            | "imf"
            | "hooks"
            | "single_script"
            | "script_refine"
            | "media_analysis"
            | "competitor_analysis"
            | "other";
          model?: string;
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_tokens?: number;
          cache_read_tokens?: number;
          stop_reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_invites: {
        Row: {
          id: string;
          invited_by: string;
          email: string;
          status: "sent" | "accepted" | "revoked" | "failed";
          error: string | null;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          invited_by: string;
          email: string;
          status?: "sent" | "accepted" | "revoked" | "failed";
          error?: string | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          invited_by?: string;
          email?: string;
          status?: "sent" | "accepted" | "revoked" | "failed";
          error?: string | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Relationships: [];
      };
      competitor_media_analysis: {
        Row: {
          media_id: string;
          competitor_id: string;
          user_id: string;
          transcript: string;
          hook: string | null;
          hook_type:
            | "STORYTELLING"
            | "CONFRONTATIONAL"
            | "VULNERABILITY"
            | "CURIOSITY"
            | "PROOF"
            | "EDUCATIONAL"
            | null;
          structure: string | null;
          pillar_match: string | null;
          performance_label: string | null;
          performance_score: number | null;
          what_worked: string | null;
          what_to_repeat: string | null;
          llm_model: string;
          transcript_model: string;
          analyzed_at: string;
        };
        Insert: {
          media_id: string;
          competitor_id: string;
          user_id: string;
          transcript: string;
          hook?: string | null;
          hook_type?:
            | "STORYTELLING"
            | "CONFRONTATIONAL"
            | "VULNERABILITY"
            | "CURIOSITY"
            | "PROOF"
            | "EDUCATIONAL"
            | null;
          structure?: string | null;
          pillar_match?: string | null;
          performance_label?: string | null;
          performance_score?: number | null;
          what_worked?: string | null;
          what_to_repeat?: string | null;
          llm_model: string;
          transcript_model: string;
          analyzed_at?: string;
        };
        Update: {
          media_id?: string;
          competitor_id?: string;
          user_id?: string;
          transcript?: string;
          hook?: string | null;
          hook_type?:
            | "STORYTELLING"
            | "CONFRONTATIONAL"
            | "VULNERABILITY"
            | "CURIOSITY"
            | "PROOF"
            | "EDUCATIONAL"
            | null;
          structure?: string | null;
          pillar_match?: string | null;
          performance_label?: string | null;
          performance_score?: number | null;
          what_worked?: string | null;
          what_to_repeat?: string | null;
          llm_model?: string;
          transcript_model?: string;
          analyzed_at?: string;
        };
        Relationships: [];
      };
      competitor_media: {
        Row: {
          id: string;
          competitor_id: string;
          user_id: string;
          media_type: "VIDEO" | "REELS" | "IMAGE" | "CAROUSEL_ALBUM";
          caption: string | null;
          permalink: string | null;
          media_url: string | null;
          thumbnail_url: string | null;
          posted_at: string | null;
          like_count: number | null;
          comments_count: number | null;
          view_count: number | null;
          duration_seconds: number | null;
          scrape_run_id: string | null;
          synced_at: string;
          analysis_failed_reason: string | null;
          analysis_pending: boolean;
        };
        Insert: {
          id: string;
          competitor_id: string;
          user_id: string;
          media_type: "VIDEO" | "REELS" | "IMAGE" | "CAROUSEL_ALBUM";
          caption?: string | null;
          permalink?: string | null;
          media_url?: string | null;
          thumbnail_url?: string | null;
          posted_at?: string | null;
          like_count?: number | null;
          comments_count?: number | null;
          view_count?: number | null;
          duration_seconds?: number | null;
          scrape_run_id?: string | null;
          synced_at?: string;
          analysis_failed_reason?: string | null;
          analysis_pending?: boolean;
        };
        Update: {
          id?: string;
          competitor_id?: string;
          user_id?: string;
          media_type?: "VIDEO" | "REELS" | "IMAGE" | "CAROUSEL_ALBUM";
          caption?: string | null;
          permalink?: string | null;
          media_url?: string | null;
          thumbnail_url?: string | null;
          posted_at?: string | null;
          like_count?: number | null;
          comments_count?: number | null;
          view_count?: number | null;
          duration_seconds?: number | null;
          scrape_run_id?: string | null;
          synced_at?: string;
          analysis_failed_reason?: string | null;
          analysis_pending?: boolean;
        };
        Relationships: [];
      };
      competitor_accounts: {
        Row: {
          id: string;
          user_id: string;
          username: string;
          platform: "instagram" | "tiktok" | "youtube_shorts";
          display_name: string | null;
          note: string | null;
          added_at: string;
          last_synced_at: string | null;
          last_sync_error: string | null;
          sync_pending: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          username: string;
          platform?: "instagram" | "tiktok" | "youtube_shorts";
          display_name?: string | null;
          note?: string | null;
          added_at?: string;
          last_synced_at?: string | null;
          last_sync_error?: string | null;
          sync_pending?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          username?: string;
          platform?: "instagram" | "tiktok" | "youtube_shorts";
          display_name?: string | null;
          note?: string | null;
          added_at?: string;
          last_synced_at?: string | null;
          last_sync_error?: string | null;
          sync_pending?: boolean;
        };
        Relationships: [];
      };
      instagram_connections: {
        Row: {
          user_id: string;
          access_token: string;
          ig_user_id: string;
          ig_username: string | null;
          followers_count: number | null;
          follows_count: number | null;
          media_count: number | null;
          ig_profile_picture_url: string | null;
          last_synced_at: string | null;
          last_sync_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          access_token: string;
          ig_user_id: string;
          ig_username?: string | null;
          followers_count?: number | null;
          follows_count?: number | null;
          media_count?: number | null;
          ig_profile_picture_url?: string | null;
          last_synced_at?: string | null;
          last_sync_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          access_token?: string;
          ig_user_id?: string;
          ig_username?: string | null;
          followers_count?: number | null;
          follows_count?: number | null;
          media_count?: number | null;
          ig_profile_picture_url?: string | null;
          last_synced_at?: string | null;
          last_sync_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      instagram_media: {
        Row: {
          id: string;
          user_id: string;
          media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS";
          caption: string | null;
          permalink: string | null;
          media_url: string | null;
          thumbnail_url: string | null;
          posted_at: string | null;
          like_count: number | null;
          comments_count: number | null;
          reach: number | null;
          plays: number | null;
          saved: number | null;
          shares: number | null;
          synced_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS";
          caption?: string | null;
          permalink?: string | null;
          media_url?: string | null;
          thumbnail_url?: string | null;
          posted_at?: string | null;
          like_count?: number | null;
          comments_count?: number | null;
          reach?: number | null;
          plays?: number | null;
          saved?: number | null;
          shares?: number | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS";
          caption?: string | null;
          permalink?: string | null;
          media_url?: string | null;
          thumbnail_url?: string | null;
          posted_at?: string | null;
          like_count?: number | null;
          comments_count?: number | null;
          reach?: number | null;
          plays?: number | null;
          saved?: number | null;
          shares?: number | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      instagram_follower_history: {
        Row: {
          user_id: string;
          captured_on: string;
          followers_count: number;
          captured_at: string;
        };
        Insert: {
          user_id: string;
          captured_on: string;
          followers_count: number;
          captured_at?: string;
        };
        Update: {
          user_id?: string;
          captured_on?: string;
          followers_count?: number;
          captured_at?: string;
        };
        Relationships: [];
      };
      instagram_media_analysis: {
        Row: {
          media_id: string;
          user_id: string;
          transcript: string;
          hook: string | null;
          hook_type:
            | "STORYTELLING"
            | "CONFRONTATIONAL"
            | "VULNERABILITY"
            | "CURIOSITY"
            | "PROOF"
            | "EDUCATIONAL"
            | null;
          structure: string | null;
          pillar_match: string | null;
          performance_label: string | null;
          performance_score: number | null;
          what_worked: string | null;
          what_to_repeat: string | null;
          llm_model: string;
          transcript_model: string;
          analyzed_at: string;
        };
        Insert: {
          media_id: string;
          user_id: string;
          transcript: string;
          hook?: string | null;
          hook_type?:
            | "STORYTELLING"
            | "CONFRONTATIONAL"
            | "VULNERABILITY"
            | "CURIOSITY"
            | "PROOF"
            | "EDUCATIONAL"
            | null;
          structure?: string | null;
          pillar_match?: string | null;
          performance_label?: string | null;
          performance_score?: number | null;
          what_worked?: string | null;
          what_to_repeat?: string | null;
          llm_model: string;
          transcript_model: string;
          analyzed_at?: string;
        };
        Update: {
          media_id?: string;
          user_id?: string;
          transcript?: string;
          hook?: string | null;
          hook_type?:
            | "STORYTELLING"
            | "CONFRONTATIONAL"
            | "VULNERABILITY"
            | "CURIOSITY"
            | "PROOF"
            | "EDUCATIONAL"
            | null;
          structure?: string | null;
          pillar_match?: string | null;
          performance_label?: string | null;
          performance_score?: number | null;
          what_worked?: string | null;
          what_to_repeat?: string | null;
          llm_model?: string;
          transcript_model?: string;
          analyzed_at?: string;
        };
        Relationships: [];
      };
      research_analysis_runs: {
        Row: {
          id: string;
          user_id: string;
          media_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          media_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          media_id?: string;
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
      client_documents: {
        Row: {
          id: string;
          user_id: string;
          source_type: "fathom_transcript" | "questionnaire" | "note" | "long_form";
          title: string;
          body: string;
          captured_at: string;
          source_path: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_type: "fathom_transcript" | "questionnaire" | "note" | "long_form";
          title: string;
          body: string;
          captured_at?: string;
          source_path?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_type?: "fathom_transcript" | "questionnaire" | "note" | "long_form";
          title?: string;
          body?: string;
          captured_at?: string;
          source_path?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      weekly_checkins: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          raw_responses: Json;
          submitted_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          week_start: string;
          raw_responses?: Json;
          submitted_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_start?: string;
          raw_responses?: Json;
          submitted_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      client_document_chunks: {
        Row: {
          id: string;
          document_id: string;
          user_id: string;
          chunk_index: number;
          chunk_text: string;
          embedding: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          user_id: string;
          chunk_index: number;
          chunk_text: string;
          embedding: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          user_id?: string;
          chunk_index?: number;
          chunk_text?: string;
          embedding?: string;
          metadata?: Json;
          created_at?: string;
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
      match_client_chunks: {
        Args: {
          query_embedding: string;
          match_user_id: string;
          match_count?: number;
        };
        Returns: Array<{
          chunk_id: string;
          document_id: string;
          chunk_index: number;
          chunk_text: string;
          source_type: string;
          document_title: string;
          captured_at: string;
          similarity: number;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
