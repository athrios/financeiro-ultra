export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          new_data: Json | null;
          old_data: Json | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          active: boolean;
          cnpj: string;
          created_at: string;
          default_amount: number;
          distribution_mode: Database["public"]["Enums"]["distribution_mode"];
          id: string;
          name: string;
          normalized_cnpj: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          cnpj: string;
          created_at?: string;
          default_amount: number;
          distribution_mode?: Database["public"]["Enums"]["distribution_mode"];
          id?: string;
          name: string;
          normalized_cnpj?: never;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          cnpj?: string;
          created_at?: string;
          default_amount?: number;
          distribution_mode?: Database["public"]["Enums"]["distribution_mode"];
          id?: string;
          name?: string;
          normalized_cnpj?: never;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_indicators: {
        Row: {
          company_id: string;
          created_at: string;
          custom_percentage: number | null;
          id: string;
          indicator_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          created_at?: string;
          custom_percentage?: number | null;
          id?: string;
          indicator_id: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          custom_percentage?: number | null;
          id?: string;
          indicator_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_indicators_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_indicators_indicator_id_fkey";
            columns: ["indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
        ];
      };
      competencies: {
        Row: {
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
          id: string;
          opened_at: string;
          opened_by: string | null;
          reference_month: string;
          status: Database["public"]["Enums"]["competency_status"];
        };
        ComputedFields: never;
        Insert: {
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          id?: string;
          opened_at?: string;
          opened_by?: string | null;
          reference_month: string;
          status?: Database["public"]["Enums"]["competency_status"];
        };
        Update: {
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          id?: string;
          opened_at?: string;
          opened_by?: string | null;
          reference_month?: string;
          status?: Database["public"]["Enums"]["competency_status"];
        };
        Relationships: [
          {
            foreignKeyName: "competencies_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competencies_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      competency_companies: {
        Row: {
          company_id: string;
          competency_id: string;
          created_at: string;
          expected_amount: number;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          company_id: string;
          competency_id: string;
          created_at?: string;
          expected_amount: number;
          id?: string;
        };
        Update: {
          company_id?: string;
          competency_id?: string;
          created_at?: string;
          expected_amount?: number;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "competency_companies_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competency_companies_competency_id_fkey";
            columns: ["competency_id"];
            isOneToOne: false;
            referencedRelation: "competencies";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_settings: {
        Row: {
          created_at: string;
          id: string;
          updated_at: string;
          use_custom_default_percentages: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          use_custom_default_percentages?: boolean;
        };
        Update: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          use_custom_default_percentages?: boolean;
        };
        Relationships: [];
      };
      indicator_receipt_aliases: {
        Row: {
          active: boolean;
          alias: string;
          created_at: string;
          id: string;
          indicator_id: string;
          normalized_alias: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          alias: string;
          created_at?: string;
          id?: string;
          indicator_id: string;
          normalized_alias?: never;
        };
        Update: {
          active?: boolean;
          alias?: string;
          created_at?: string;
          id?: string;
          indicator_id?: string;
          normalized_alias?: never;
        };
        Relationships: [
          {
            foreignKeyName: "indicator_receipt_aliases_indicator_id_fkey";
            columns: ["indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
        ];
      };
      indicators: {
        Row: {
          active: boolean;
          created_at: string;
          default_percentage: number | null;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          default_percentage?: number | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          default_percentage?: number | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          full_name: string | null;
          id: string;
          indicator_id: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          full_name?: string | null;
          id: string;
          indicator_id?: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          indicator_id?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_indicator_id_fkey";
            columns: ["indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
        ];
      };
      receipt_allocations: {
        Row: {
          amount: number;
          created_at: string;
          distribution_source: Database["public"]["Enums"]["distribution_source"];
          id: string;
          indicator_id: string;
          percentage: number;
          receipt_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          distribution_source: Database["public"]["Enums"]["distribution_source"];
          id?: string;
          indicator_id: string;
          percentage: number;
          receipt_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          distribution_source?: Database["public"]["Enums"]["distribution_source"];
          id?: string;
          indicator_id?: string;
          percentage?: number;
          receipt_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "receipt_allocations_indicator_id_fkey";
            columns: ["indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipt_allocations_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "receipts";
            referencedColumns: ["id"];
          },
        ];
      };
      receipts: {
        Row: {
          amount: number;
          company_id: string | null;
          company_identification_method: Database["public"]["Enums"]["company_identification_method"];
          competency_id: string;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          extracted_amount: number | null;
          extracted_payer_cnpj: string | null;
          extracted_payer_name: string | null;
          extracted_receiver_name: string | null;
          id: string;
          mime_type: string | null;
          original_file_name: string | null;
          payment_date: string | null;
          receiver_identification_method: Database["public"]["Enums"]["receiver_identification_method"];
          receiving_indicator_id: string | null;
          status: Database["public"]["Enums"]["receipt_status"];
          storage_path: string | null;
          uploaded_by: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          company_id?: string | null;
          company_identification_method?: Database["public"]["Enums"]["company_identification_method"];
          competency_id: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          extracted_amount?: number | null;
          extracted_payer_cnpj?: string | null;
          extracted_payer_name?: string | null;
          extracted_receiver_name?: string | null;
          id?: string;
          mime_type?: string | null;
          original_file_name?: string | null;
          payment_date?: string | null;
          receiver_identification_method?: Database["public"]["Enums"]["receiver_identification_method"];
          receiving_indicator_id?: string | null;
          status?: Database["public"]["Enums"]["receipt_status"];
          storage_path?: string | null;
          uploaded_by: string;
        };
        Update: {
          amount?: number;
          company_id?: string | null;
          company_identification_method?: Database["public"]["Enums"]["company_identification_method"];
          competency_id?: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          extracted_amount?: number | null;
          extracted_payer_cnpj?: string | null;
          extracted_payer_name?: string | null;
          extracted_receiver_name?: string | null;
          id?: string;
          mime_type?: string | null;
          original_file_name?: string | null;
          payment_date?: string | null;
          receiver_identification_method?: Database["public"]["Enums"]["receiver_identification_method"];
          receiving_indicator_id?: string | null;
          status?: Database["public"]["Enums"]["receipt_status"];
          storage_path?: string | null;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "receipts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_competency_company_fkey";
            columns: ["competency_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "competency_companies";
            referencedColumns: ["competency_id", "company_id"];
          },
          {
            foreignKeyName: "receipts_competency_id_fkey";
            columns: ["competency_id"];
            isOneToOne: false;
            referencedRelation: "competencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_receiving_indicator_id_fkey";
            columns: ["receiving_indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      settlements: {
        Row: {
          amount: number;
          competency_id: string;
          created_at: string;
          created_by: string;
          from_indicator_id: string;
          id: string;
          notes: string | null;
          proof_storage_path: string | null;
          settlement_date: string;
          to_indicator_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          competency_id: string;
          created_at?: string;
          created_by?: string;
          from_indicator_id: string;
          id?: string;
          notes?: string | null;
          proof_storage_path?: string | null;
          settlement_date: string;
          to_indicator_id: string;
        };
        Update: {
          amount?: number;
          competency_id?: string;
          created_at?: string;
          created_by?: string;
          from_indicator_id?: string;
          id?: string;
          notes?: string | null;
          proof_storage_path?: string | null;
          settlement_date?: string;
          to_indicator_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_competency_id_fkey";
            columns: ["competency_id"];
            isOneToOne: false;
            referencedRelation: "competencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_from_indicator_id_fkey";
            columns: ["from_indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_to_indicator_id_fkey";
            columns: ["to_indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      financial_ledger: {
        Row: {
          amount: number | null;
          competency_id: string | null;
          entry_date: string | null;
          entry_type: string | null;
          indicator_id: string | null;
          receipt_id: string | null;
          reference_month: string | null;
          settlement_id: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
    };
    Functions: {
      confirm_receipt: {
        Args: {
          p_allocations: Json;
          p_distribution_source: Database["public"]["Enums"]["distribution_source"];
          p_receipt_id: string;
        };
        Returns: undefined;
      };
      open_competency: {
        Args: { p_reference_month: string };
        Returns: {
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
          id: string;
          opened_at: string;
          opened_by: string | null;
          reference_month: string;
          status: Database["public"]["Enums"]["competency_status"];
        };
        SetofOptions: {
          from: "*";
          to: "competencies";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      resolve_receiver_indicator: { Args: { p_receiver_name: string }; Returns: string };
      save_company_distribution: {
        Args: {
          p_company_id: string;
          p_distribution_mode: Database["public"]["Enums"]["distribution_mode"];
          p_indicators: Json;
        };
        Returns: undefined;
      };
      set_default_distribution: {
        Args: { p_percentages?: Json; p_use_custom_default_percentages: boolean };
        Returns: undefined;
      };
    };
    Enums: {
      company_identification_method: "CNPJ" | "NAME" | "MANUAL" | "UNIDENTIFIED";
      competency_status: "OPEN" | "CLOSED";
      distribution_mode: "INHERIT" | "EQUAL" | "CUSTOM";
      distribution_source: "EQUAL" | "DEFAULT_PERCENTAGE" | "COMPANY_CUSTOM";
      receipt_status:
        | "RECEIVED"
        | "PROCESSING"
        | "AWAITING_RECEIVER"
        | "AWAITING_COMPANY"
        | "AWAITING_CONFIRMATION"
        | "CONFIRMED"
        | "READ_ERROR";
      receiver_identification_method: "ALIAS" | "MANUAL" | "UNIDENTIFIED";
      user_role: "ADMIN_FINANCEIRO" | "SOCIO";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      company_identification_method: ["CNPJ", "NAME", "MANUAL", "UNIDENTIFIED"],
      competency_status: ["OPEN", "CLOSED"],
      distribution_mode: ["INHERIT", "EQUAL", "CUSTOM"],
      distribution_source: ["EQUAL", "DEFAULT_PERCENTAGE", "COMPANY_CUSTOM"],
      receipt_status: [
        "RECEIVED",
        "PROCESSING",
        "AWAITING_RECEIVER",
        "AWAITING_COMPANY",
        "AWAITING_CONFIRMATION",
        "CONFIRMED",
        "READ_ERROR",
      ],
      receiver_identification_method: ["ALIAS", "MANUAL", "UNIDENTIFIED"],
      user_role: ["ADMIN_FINANCEIRO", "SOCIO"],
    },
  },
} as const;
