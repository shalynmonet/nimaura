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
      collective_contributions: {
        Row: {
          created_at: string
          deployment: string
          drop_id: string
          id: string
          manifestation_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deployment?: string
          drop_id: string
          id?: string
          manifestation_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deployment?: string
          drop_id?: string
          id?: string
          manifestation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collective_contributions_manifestation_id_fkey"
            columns: ["manifestation_id"]
            isOneToOne: true
            referencedRelation: "manifestations"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_milestones: {
        Row: {
          deployment: string
          designation: string
          id: string
          name: string
          ordinal: number
          reflection: string
          symbolism: string
          threshold: number
          unlocked_at: string | null
          veiled_hint: string
        }
        Insert: {
          deployment?: string
          designation: string
          id?: string
          name: string
          ordinal: number
          reflection: string
          symbolism: string
          threshold: number
          unlocked_at?: string | null
          veiled_hint: string
        }
        Update: {
          deployment?: string
          designation?: string
          id?: string
          name?: string
          ordinal?: number
          reflection?: string
          symbolism?: string
          threshold?: number
          unlocked_at?: string | null
          veiled_hint?: string
        }
        Relationships: []
      }
      credit_redemptions: {
        Row: {
          created_at: string
          id: string
          manifestation_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          manifestation_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          manifestation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_redemptions_manifestation_id_fkey"
            columns: ["manifestation_id"]
            isOneToOne: true
            referencedRelation: "manifestations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_drops: {
        Row: {
          clue: string
          ends_at: string
          entity_id: string
          id: string
          number: number
          sigil: string
          starts_at: string
        }
        Insert: {
          clue: string
          ends_at: string
          entity_id: string
          id?: string
          number: number
          sigil: string
          starts_at: string
        }
        Update: {
          clue?: string
          ends_at?: string
          entity_id?: string
          id?: string
          number?: number
          sigil?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_drops_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          archetype: string
          created_at: string
          designation: string
          id: string
          meditation: Json
          name: string
          reflections: Json
          slug: string
          symbolism: string
        }
        Insert: {
          archetype: string
          created_at?: string
          designation: string
          id?: string
          meditation?: Json
          name: string
          reflections?: Json
          slug: string
          symbolism: string
        }
        Update: {
          archetype?: string
          created_at?: string
          designation?: string
          id?: string
          meditation?: Json
          name?: string
          reflections?: Json
          slug?: string
          symbolism?: string
        }
        Relationships: []
      }
      mainnet_payouts: {
        Row: {
          amount_luna: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          network: string
          payment_quote_id: string
          reference: string
          reserve_destination: string
          status: string
          treasury_sender: string
          tx_hash: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount_luna: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          network?: string
          payment_quote_id: string
          reference: string
          reserve_destination: string
          status?: string
          treasury_sender: string
          tx_hash?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount_luna?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          network?: string
          payment_quote_id?: string
          reference?: string
          reserve_destination?: string
          status?: string
          treasury_sender?: string
          tx_hash?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mainnet_payouts_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mainnet_payouts_payment_quote_id_fkey"
            columns: ["payment_quote_id"]
            isOneToOne: true
            referencedRelation: "nimiq_payment_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mainnet_payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manifestations: {
        Row: {
          config: Json
          created_at: string
          drop_id: string
          entity_id: string
          id: string
          intention: string
          mainnet_quote_id: string | null
          payment_id: string | null
          seed: number
          source: string
          testnet_quote_id: string | null
          user_id: string
        }
        Insert: {
          config: Json
          created_at?: string
          drop_id: string
          entity_id: string
          id?: string
          intention: string
          mainnet_quote_id?: string | null
          payment_id?: string | null
          seed: number
          source: string
          testnet_quote_id?: string | null
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          drop_id?: string
          entity_id?: string
          id?: string
          intention?: string
          mainnet_quote_id?: string | null
          payment_id?: string | null
          seed?: number
          source?: string
          testnet_quote_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manifestations_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "daily_drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manifestations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manifestations_mainnet_quote_id_fkey"
            columns: ["mainnet_quote_id"]
            isOneToOne: false
            referencedRelation: "nimiq_payment_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manifestations_testnet_quote_id_fkey"
            columns: ["testnet_quote_id"]
            isOneToOne: false
            referencedRelation: "nimiq_payment_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      nimiq_payment_quotes: {
        Row: {
          amount_luna: number
          candidate_tx_hash: string | null
          config: Json
          created_at: string
          drop_id: string
          expires_at: string
          id: string
          intention: string
          manifestation_id: string | null
          network: string
          payment_attempt_id: string | null
          rate: number
          recipient: string
          reserve_address_snapshot: string | null
          savings_luna: number
          seed: number
          sender: string
          status: string
          submission_detail: string | null
          submission_outcome: string
          submission_started_at: string | null
          tx_hash: string | null
          user_id: string
          validity_start_height: number
          verified_at: string | null
        }
        Insert: {
          amount_luna: number
          candidate_tx_hash?: string | null
          config: Json
          created_at?: string
          drop_id: string
          expires_at: string
          id?: string
          intention: string
          manifestation_id?: string | null
          network: string
          payment_attempt_id?: string | null
          rate: number
          recipient: string
          reserve_address_snapshot?: string | null
          savings_luna: number
          seed: number
          sender: string
          status?: string
          submission_detail?: string | null
          submission_outcome?: string
          submission_started_at?: string | null
          tx_hash?: string | null
          user_id: string
          validity_start_height: number
          verified_at?: string | null
        }
        Update: {
          amount_luna?: number
          candidate_tx_hash?: string | null
          config?: Json
          created_at?: string
          drop_id?: string
          expires_at?: string
          id?: string
          intention?: string
          manifestation_id?: string | null
          network?: string
          payment_attempt_id?: string | null
          rate?: number
          recipient?: string
          reserve_address_snapshot?: string | null
          savings_luna?: number
          seed?: number
          sender?: string
          status?: string
          submission_detail?: string | null
          submission_outcome?: string
          submission_started_at?: string | null
          tx_hash?: string | null
          user_id?: string
          validity_start_height?: number
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nimiq_payment_quotes_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "daily_drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nimiq_payment_quotes_manifestation_id_fkey"
            columns: ["manifestation_id"]
            isOneToOne: false
            referencedRelation: "manifestations"
            referencedColumns: ["id"]
          },
        ]
      }
      nimiq_rpc_coordination: {
        Row: {
          expires_at: string | null
          key: string
          lease_token: string | null
          lease_until: string | null
          next_at: string
          payload: Json | null
        }
        Insert: {
          expires_at?: string | null
          key: string
          lease_token?: string | null
          lease_until?: string | null
          next_at?: string
          payload?: Json | null
        }
        Update: {
          expires_at?: string | null
          key?: string
          lease_token?: string | null
          lease_until?: string | null
          next_at?: string
          payload?: Json | null
        }
        Relationships: []
      }
      nimiq_wallet_challenges: {
        Row: {
          address: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          message: string
          network: string
          purpose: string
          user_id: string
        }
        Insert: {
          address: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          message: string
          network: string
          purpose: string
          user_id: string
        }
        Update: {
          address?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          message?: string
          network?: string
          purpose?: string
          user_id?: string
        }
        Relationships: []
      }
      nimiq_wallet_links: {
        Row: {
          address: string
          id: string
          is_reserve: boolean
          network: string
          public_key: string
          user_id: string
          verified_at: string
        }
        Insert: {
          address: string
          id?: string
          is_reserve?: boolean
          network: string
          public_key: string
          user_id: string
          verified_at?: string
        }
        Update: {
          address?: string
          id?: string
          is_reserve?: boolean
          network?: string
          public_key?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
      payment_attempts: {
        Row: {
          created_at: string
          drop_id: string
          id: string
          idempotency_key: string
          intention: string
          is_simulated: boolean
          network_fee_nim: number | null
          nim_amount: number | null
          nim_usd_rate: number | null
          savings_nim: number | null
          status: string
          tx_hash: string | null
          usd_amount: number
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          drop_id: string
          id?: string
          idempotency_key: string
          intention: string
          is_simulated?: boolean
          network_fee_nim?: number | null
          nim_amount?: number | null
          nim_usd_rate?: number | null
          savings_nim?: number | null
          status?: string
          tx_hash?: string | null
          usd_amount?: number
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          drop_id?: string
          id?: string
          idempotency_key?: string
          intention?: string
          is_simulated?: boolean
          network_fee_nim?: number | null
          nim_amount?: number | null
          nim_usd_rate?: number | null
          savings_nim?: number | null
          status?: string
          tx_hash?: string | null
          usd_amount?: number
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "daily_drops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          credits: number
          display_name: string | null
          id: string
          reserve_address: string | null
          savings_goal_nim: number | null
          sound_enabled: boolean
        }
        Insert: {
          created_at?: string
          credits?: number
          display_name?: string | null
          id: string
          reserve_address?: string | null
          savings_goal_nim?: number | null
          sound_enabled?: boolean
        }
        Update: {
          created_at?: string
          credits?: number
          display_name?: string | null
          id?: string
          reserve_address?: string | null
          savings_goal_nim?: number | null
          sound_enabled?: boolean
        }
        Relationships: []
      }
      savings_transfers: {
        Row: {
          created_at: string
          id: string
          is_simulated: boolean
          nim_amount: number
          payment_id: string
          status: string
          to_address: string
          tx_hash: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_simulated?: boolean
          nim_amount: number
          payment_id: string
          status?: string
          to_address: string
          tx_hash?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_simulated?: boolean
          nim_amount?: number
          payment_id?: string
          status?: string
          to_address?: string
          tx_hash?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_transfers_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      testnet_hub_requests: {
        Row: {
          challenge_id: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          kind: string
          payout_id: string | null
          user_id: string
        }
        Insert: {
          challenge_id?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          kind: string
          payout_id?: string | null
          user_id: string
        }
        Update: {
          challenge_id?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          payout_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "testnet_hub_requests_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "nimiq_wallet_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testnet_hub_requests_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "testnet_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testnet_hub_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      testnet_hub_signed_payouts: {
        Row: {
          broadcast_attempted_at: string
          payout_id: string
          request_id: string
          signed_bytes: string
          tx_hash: string
        }
        Insert: {
          broadcast_attempted_at?: string
          payout_id: string
          request_id: string
          signed_bytes: string
          tx_hash: string
        }
        Update: {
          broadcast_attempted_at?: string
          payout_id?: string
          request_id?: string
          signed_bytes?: string
          tx_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "testnet_hub_signed_payouts_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: true
            referencedRelation: "testnet_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testnet_hub_signed_payouts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "testnet_hub_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      testnet_payouts: {
        Row: {
          amount_luna: number
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          network: string
          payment_quote_id: string
          reference: string
          reserve_destination: string
          status: string
          treasury_sender: string
          tx_hash: string | null
          user_id: string
          validity_start_height: number | null
          verified_at: string | null
        }
        Insert: {
          amount_luna: number
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          network?: string
          payment_quote_id: string
          reference: string
          reserve_destination: string
          status?: string
          treasury_sender: string
          tx_hash?: string | null
          user_id: string
          validity_start_height?: number | null
          verified_at?: string | null
        }
        Update: {
          amount_luna?: number
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          network?: string
          payment_quote_id?: string
          reference?: string
          reserve_destination?: string
          status?: string
          treasury_sender?: string
          tx_hash?: string | null
          user_id?: string
          validity_start_height?: number | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testnet_payouts_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testnet_payouts_payment_quote_id_fkey"
            columns: ["payment_quote_id"]
            isOneToOne: true
            referencedRelation: "nimiq_payment_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testnet_payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
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
      accept_testnet_hub_result: {
        Args: {
          _bytes: string
          _hash: string
          _id: string
          _key: string
          _user: string
        }
        Returns: boolean
      }
      claim_nimiq_rpc_cache: { Args: { _key: string }; Returns: string }
      claim_testnet_payout: {
        Args: {
          _expires: string
          _height: number
          _id: string
          _operator: string
        }
        Returns: {
          amount_luna: number
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          network: string
          payment_quote_id: string
          reference: string
          reserve_destination: string
          status: string
          treasury_sender: string
          tx_hash: string | null
          user_id: string
          validity_start_height: number | null
          verified_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "testnet_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      collective_count: { Args: { _manifestation: string }; Returns: undefined }
      collective_state: { Args: { _deployment?: string }; Returns: Json }
      complete_testnet_payout: {
        Args: { _hash: string; _id: string; _operator: string; _token: string }
        Returns: string
      }
      consume_nimiq_wallet_challenge: {
        Args: { _id: string; _public_key: string; _user_id: string }
        Returns: string
      }
      defer_nimiq_rpc: {
        Args: { _key: string; _until: string }
        Returns: undefined
      }
      fulfill_mainnet_payment: {
        Args: { _hash: string; _id: string; _user_id: string }
        Returns: string
      }
      fulfill_testnet_payment: {
        Args: { _hash: string; _id: string; _user_id: string }
        Returns: string
      }
      fulfill_verified_nimiq_payment: {
        Args: { _id: string; _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_collector_submission: {
        Args: {
          _detail?: string
          _hash?: string
          _id: string
          _outcome: string
          _user_id: string
        }
        Returns: undefined
      }
      release_unmatched_collector_purchase: {
        Args: { _id: string; _user_id: string }
        Returns: undefined
      }
      reopen_unbroadcast_testnet_payout: {
        Args: { _id: string; _operator: string }
        Returns: boolean
      }
      reserve_nimiq_rpc_slot: {
        Args: { _cost: number; _key: string }
        Returns: string
      }
      simulate_paid_unseal: {
        Args: {
          _config: Json
          _drop_id: string
          _idem: string
          _intention: string
          _rate: number
          _seed: number
        }
        Returns: string
      }
      unseal_with_credit: {
        Args: {
          _config: Json
          _drop_id: string
          _intention: string
          _seed: number
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
