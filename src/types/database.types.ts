export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      corretores: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          creci: string | null
          email: string | null
          foto_url: string | null
          id: string
          imobiliaria_id: string
          nome: string
          updated_at: string | null
          whatsapp: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          creci?: string | null
          email?: string | null
          foto_url?: string | null
          id?: string
          imobiliaria_id: string
          nome: string
          updated_at?: string | null
          whatsapp: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          creci?: string | null
          email?: string | null
          foto_url?: string | null
          id?: string
          imobiliaria_id?: string
          nome?: string
          updated_at?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "corretores_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      imobiliarias: {
        Row: {
          archived_at: string | null
          cidade: string | null
          cnpj: string | null
          cor_primaria: string | null
          created_at: string | null
          email_contato: string | null
          endereco: string | null
          estado: string | null
          has_login: boolean | null
          id: string
          logo_url: string | null
          must_change_password: boolean | null
          nome: string
          slug: string
          updated_at: string | null
          user_id: string | null
          whatsapp_principal: string | null
        }
        Insert: {
          archived_at?: string | null
          cidade?: string | null
          cnpj?: string | null
          cor_primaria?: string | null
          created_at?: string | null
          email_contato?: string | null
          endereco?: string | null
          estado?: string | null
          has_login?: boolean | null
          id?: string
          logo_url?: string | null
          must_change_password?: boolean | null
          nome: string
          slug: string
          updated_at?: string | null
          user_id?: string | null
          whatsapp_principal?: string | null
        }
        Update: {
          archived_at?: string | null
          cidade?: string | null
          cnpj?: string | null
          cor_primaria?: string | null
          created_at?: string | null
          email_contato?: string | null
          endereco?: string | null
          estado?: string | null
          has_login?: boolean | null
          id?: string
          logo_url?: string | null
          must_change_password?: boolean | null
          nome?: string
          slug?: string
          updated_at?: string | null
          user_id?: string | null
          whatsapp_principal?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          cidade: string | null
          created_at: string | null
          email: string | null
          id: string
          mensagem: string | null
          nome: string
          observacoes_internas: string | null
          origem: string | null
          status: string | null
          tipo_imovel: string | null
          updated_at: string | null
          whatsapp: string
        }
        Insert: {
          cidade?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          mensagem?: string | null
          nome: string
          observacoes_internas?: string | null
          origem?: string | null
          status?: string | null
          tipo_imovel?: string | null
          updated_at?: string | null
          whatsapp: string
        }
        Update: {
          cidade?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          mensagem?: string | null
          nome?: string
          observacoes_internas?: string | null
          origem?: string | null
          status?: string | null
          tipo_imovel?: string | null
          updated_at?: string | null
          whatsapp?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tour_hotspots: {
        Row: {
          created_at: string | null
          descricao: string | null
          icone: string
          id: string
          ordem: number | null
          posicao_x: number
          posicao_y: number
          posicao_z: number
          titulo: string
          tour_id: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          icone: string
          id?: string
          ordem?: number | null
          posicao_x: number
          posicao_y: number
          posicao_z: number
          titulo: string
          tour_id: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          icone?: string
          id?: string
          ordem?: number | null
          posicao_x?: number
          posicao_y?: number
          posicao_z?: number
          titulo?: string
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_hotspots_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_views: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: string
          ip_city: string | null
          ip_country: string | null
          referrer: string | null
          tour_id: string
          user_agent: string | null
          visitor_fingerprint: string | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          ip_city?: string | null
          ip_country?: string | null
          referrer?: string | null
          tour_id: string
          user_agent?: string | null
          visitor_fingerprint?: string | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          ip_city?: string | null
          ip_country?: string | null
          referrer?: string | null
          tour_id?: string
          user_agent?: string | null
          visitor_fingerprint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_views_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_waypoints: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          id: string
          ordem: number
          position_x: number
          position_y: number
          position_z: number
          target_x: number
          target_y: number
          target_z: number
          tour_id: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          ordem: number
          position_x: number
          position_y: number
          position_z: number
          target_x: number
          target_y: number
          target_z: number
          tour_id: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          ordem?: number
          position_x?: number
          position_y?: number
          position_z?: number
          target_x?: number
          target_y?: number
          target_z?: number
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_waypoints_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_whatsapp_clicks: {
        Row: {
          created_at: string | null
          id: string
          tour_id: string
          visitor_fingerprint: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          tour_id: string
          visitor_fingerprint?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          tour_id?: string
          visitor_fingerprint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_whatsapp_clicks_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          archived_at: string | null
          area_m2: number | null
          bairro: string | null
          camera_start_position: Json | null
          camera_start_target: Json | null
          camera_up_inverted: boolean
          cidade: string | null
          cobranca_cliente_brl: number | null
          corretor_id: string | null
          created_at: string | null
          descricao: string | null
          estado: string | null
          finalized_at: string | null
          foto_capa_url: string | null
          has_cinematic_mode: boolean | null
          id: string
          imobiliaria_id: string
          is_public: boolean | null
          luma_status: string | null
          modalidade: string | null
          password_hash: string | null
          quartos: number | null
          slug: string
          splat_r2_key: string | null
          splat_r2_key_lite: string | null
          splat_rotation_deg: number
          splat_size_bytes: number | null
          splat_size_bytes_lite: number | null
          status: string
          status_message: string | null
          status_venda: string | null
          tipo: string
          titulo: string
          updated_at: string | null
          valor: number | null
          video_r2_key: string | null
          video_size_bytes: number | null
          video_uploaded_at: string | null
        }
        Insert: {
          archived_at?: string | null
          area_m2?: number | null
          bairro?: string | null
          camera_start_position?: Json | null
          camera_start_target?: Json | null
          camera_up_inverted?: boolean
          cidade?: string | null
          cobranca_cliente_brl?: number | null
          corretor_id?: string | null
          created_at?: string | null
          descricao?: string | null
          estado?: string | null
          finalized_at?: string | null
          foto_capa_url?: string | null
          has_cinematic_mode?: boolean | null
          id?: string
          imobiliaria_id: string
          is_public?: boolean | null
          luma_status?: string | null
          modalidade?: string | null
          password_hash?: string | null
          quartos?: number | null
          slug: string
          splat_r2_key?: string | null
          splat_r2_key_lite?: string | null
          splat_rotation_deg?: number
          splat_size_bytes?: number | null
          splat_size_bytes_lite?: number | null
          status?: string
          status_message?: string | null
          status_venda?: string | null
          tipo: string
          titulo: string
          updated_at?: string | null
          valor?: number | null
          video_r2_key?: string | null
          video_size_bytes?: number | null
          video_uploaded_at?: string | null
        }
        Update: {
          archived_at?: string | null
          area_m2?: number | null
          bairro?: string | null
          camera_start_position?: Json | null
          camera_start_target?: Json | null
          camera_up_inverted?: boolean
          cidade?: string | null
          cobranca_cliente_brl?: number | null
          corretor_id?: string | null
          created_at?: string | null
          descricao?: string | null
          estado?: string | null
          finalized_at?: string | null
          foto_capa_url?: string | null
          has_cinematic_mode?: boolean | null
          id?: string
          imobiliaria_id?: string
          is_public?: boolean | null
          luma_status?: string | null
          modalidade?: string | null
          password_hash?: string | null
          quartos?: number | null
          slug?: string
          splat_r2_key?: string | null
          splat_r2_key_lite?: string | null
          splat_rotation_deg?: number
          splat_size_bytes?: number | null
          splat_size_bytes_lite?: number | null
          status?: string
          status_message?: string | null
          status_venda?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string | null
          valor?: number | null
          video_r2_key?: string | null
          video_size_bytes?: number | null
          video_uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_sessions: {
        Row: {
          chunk_size_bytes: number
          completed_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          parts_completed: Json | null
          r2_key: string
          status: string | null
          total_chunks: number
          total_size_bytes: number
          tour_id: string
          upload_id: string
          user_id: string
        }
        Insert: {
          chunk_size_bytes: number
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          parts_completed?: Json | null
          r2_key: string
          status?: string | null
          total_chunks: number
          total_size_bytes: number
          tour_id: string
          upload_id: string
          user_id: string
        }
        Update: {
          chunk_size_bytes?: number
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          parts_completed?: Json | null
          r2_key?: string
          status?: string | null
          total_chunks?: number
          total_size_bytes?: number
          tour_id?: string
          upload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_sessions_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          imobiliaria_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          imobiliaria_id?: string | null
          role: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          imobiliaria_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_super_admin: { Args: never; Returns: boolean }
      purge_archived_tours: { Args: never; Returns: undefined }
      user_imobiliaria_id: { Args: never; Returns: string }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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

