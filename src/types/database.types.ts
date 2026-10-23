
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_label": string | null,"actor_role": Database["public"]['Enums']["app_role"] | null,"actor_user_id": string | null,"correlation_id": string | null,"created_at": string,"entity": string,"entity_id": string,"id": string,"kind": Database["public"]['Enums']["audit_kind"],"new_data": Json | null,"previous_data": Json | null,"reason": string | null,"request_role": string,"seq": number,"source": Database["public"]['Enums']["audit_source"],"tx_id": unknown
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_label"?: string | null,"actor_role"?: Database["public"]['Enums']["app_role"] | null,"actor_user_id"?: string | null,"correlation_id"?: string | null,"created_at"?: string,"entity": string,"entity_id": string,"id"?: string,"kind": Database["public"]['Enums']["audit_kind"],"new_data"?: Json | null,"previous_data"?: Json | null,"reason"?: string | null,"request_role": string,"seq"?: never,"source": Database["public"]['Enums']["audit_source"],"tx_id"?: unknown
                  }
                  Update: {
                    "action"?: string,"actor_label"?: string | null,"actor_role"?: Database["public"]['Enums']["app_role"] | null,"actor_user_id"?: string | null,"correlation_id"?: string | null,"created_at"?: string,"entity"?: string,"entity_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["audit_kind"],"new_data"?: Json | null,"previous_data"?: Json | null,"reason"?: string | null,"request_role"?: string,"seq"?: never,"source"?: Database["public"]['Enums']["audit_source"],"tx_id"?: unknown
                  }
                  Relationships: [
                    
                  ]
                },"partners": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"normalized_name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"normalized_name"?: never,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"normalized_name"?: never,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"full_name": string | null,"id": string,"partner_id": string | null,"role": Database["public"]['Enums']["app_role"] | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"full_name"?: string | null,"id": string,"partner_id"?: string | null,"role"?: Database["public"]['Enums']["app_role"] | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"full_name"?: string | null,"id"?: string,"partner_id"?: string | null,"role"?: Database["public"]['Enums']["app_role"] | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"proof_files": {
                  Row: {
                    "confidence_score": number | null,"created_at": string,"deleted_at": string | null,"deleted_by": string | null,"deletion_reason": string | null,"extracted_at": string | null,"extraction_status": Database["public"]['Enums']["proof_extraction_status"],"id": string,"mime_type": string,"original_name": string | null,"raw_extraction": Json | null,"sha256": string,"size_bytes": number,"storage_bucket": string,"storage_path": string,"stored_at": string | null,"updated_at": string,"upload_status": Database["public"]['Enums']["proof_upload_status"],"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence_score"?: number | null,"created_at"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"deletion_reason"?: string | null,"extracted_at"?: string | null,"extraction_status"?: Database["public"]['Enums']["proof_extraction_status"],"id"?: string,"mime_type": string,"original_name"?: string | null,"raw_extraction"?: Json | null,"sha256": string,"size_bytes": number,"storage_bucket"?: string,"storage_path": string,"stored_at"?: string | null,"updated_at"?: string,"upload_status"?: Database["public"]['Enums']["proof_upload_status"],"uploaded_by": string
                  }
                  Update: {
                    "confidence_score"?: number | null,"created_at"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"deletion_reason"?: string | null,"extracted_at"?: string | null,"extraction_status"?: Database["public"]['Enums']["proof_extraction_status"],"id"?: string,"mime_type"?: string,"original_name"?: string | null,"raw_extraction"?: Json | null,"sha256"?: string,"size_bytes"?: number,"storage_bucket"?: string,"storage_path"?: string,"stored_at"?: string | null,"updated_at"?: string,"upload_status"?: Database["public"]['Enums']["proof_upload_status"],"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "proof_files_deleted_by_fkey"
      columns: ["deleted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proof_files_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "complete_proof_file_upload":
{ Args: { "p_proof_file_id": string }; Returns: {
              "confidence_score": number | null,
"created_at": string,
"deleted_at": string | null,
"deleted_by": string | null,
"deletion_reason": string | null,
"extracted_at": string | null,
"extraction_status": Database["public"]['Enums']["proof_extraction_status"],
"id": string,
"mime_type": string,
"original_name": string | null,
"raw_extraction": Json | null,
"sha256": string,
"size_bytes": number,
"storage_bucket": string,
"storage_path": string,
"stored_at": string | null,
"updated_at": string,
"upload_status": Database["public"]['Enums']["proof_upload_status"],
"uploaded_by": string
            }
                          SetofOptions: {
        from: "*"
        to: "proof_files"
        isOneToOne: true
        isSetofReturn: false
      } },
"register_proof_file":
{ Args: { "p_mime_type": string,"p_original_name": string,"p_sha256": string,"p_size_bytes": number }; Returns: {
              "deleted": boolean,"is_duplicate": boolean,"proof_file_id": string,"storage_path": string,"upload_status": Database["public"]['Enums']["proof_upload_status"]
            }[]
                           }
          }
          Enums: {
            "app_role": "ADMINISTRATOR"|"OPERATOR"|"VIEWER"|"PARTNER","audit_kind": "ROW_CHANGE"|"EVENT","audit_source": "UI"|"IMPORT"|"SYSTEM"|"SCRIPT"|"DIRECT","proof_extraction_status": "NOT_REQUESTED"|"PENDING"|"PROCESSING"|"DONE"|"FAILED","proof_upload_status": "PENDING_UPLOAD"|"STORED"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["ADMINISTRATOR", "OPERATOR", "VIEWER", "PARTNER"],"audit_kind": ["ROW_CHANGE", "EVENT"],"audit_source": ["UI", "IMPORT", "SYSTEM", "SCRIPT", "DIRECT"],"proof_extraction_status": ["NOT_REQUESTED", "PENDING", "PROCESSING", "DONE", "FAILED"],"proof_upload_status": ["PENDING_UPLOAD", "STORED"]
          }
        }
} as const
