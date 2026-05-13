/**
 * Tipos do banco Imerso — alinhados ao schema em supabase/migrations/20250508000001_initial_schema.sql
 * Substituir por saída de `npx supabase gen types typescript --project-id <ID>` quando o projeto estiver linkado.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      corretores: {
        Row: {
          id: string;
          imobiliaria_id: string;
          nome: string;
          creci: string | null;
          whatsapp: string;
          email: string | null;
          foto_url: string | null;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          imobiliaria_id: string;
          nome: string;
          creci?: string | null;
          whatsapp: string;
          email?: string | null;
          foto_url?: string | null;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          imobiliaria_id?: string;
          nome?: string;
          creci?: string | null;
          whatsapp?: string;
          email?: string | null;
          foto_url?: string | null;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      imobiliarias: {
        Row: {
          id: string;
          slug: string;
          nome: string;
          cnpj: string | null;
          logo_url: string | null;
          cor_primaria: string | null;
          whatsapp_principal: string | null;
          email_contato: string | null;
          endereco: string | null;
          cidade: string | null;
          estado: string | null;
          has_login: boolean;
          user_id: string | null;
          must_change_password: boolean;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          nome: string;
          cnpj?: string | null;
          logo_url?: string | null;
          cor_primaria?: string | null;
          whatsapp_principal?: string | null;
          email_contato?: string | null;
          endereco?: string | null;
          cidade?: string | null;
          estado?: string | null;
          has_login?: boolean;
          user_id?: string | null;
          must_change_password?: boolean;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          nome?: string;
          cnpj?: string | null;
          logo_url?: string | null;
          cor_primaria?: string | null;
          whatsapp_principal?: string | null;
          email_contato?: string | null;
          endereco?: string | null;
          cidade?: string | null;
          estado?: string | null;
          has_login?: boolean;
          user_id?: string | null;
          must_change_password?: boolean;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          nome: string;
          whatsapp: string;
          email: string | null;
          tipo_imovel: string | null;
          cidade: string | null;
          mensagem: string | null;
          origem: string | null;
          status: string | null;
          observacoes_internas: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          whatsapp: string;
          email?: string | null;
          tipo_imovel?: string | null;
          cidade?: string | null;
          mensagem?: string | null;
          origem?: string | null;
          status?: string | null;
          observacoes_internas?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          whatsapp?: string;
          email?: string | null;
          tipo_imovel?: string | null;
          cidade?: string | null;
          mensagem?: string | null;
          origem?: string | null;
          status?: string | null;
          observacoes_internas?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      luma_processing_log: {
        Row: {
          id: string;
          tour_id: string | null;
          luma_capture_slug: string | null;
          status: string | null;
          credits_used: number | null;
          cost_usd: number | null;
          raw_response: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tour_id?: string | null;
          luma_capture_slug?: string | null;
          status?: string | null;
          credits_used?: number | null;
          cost_usd?: number | null;
          raw_response?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string | null;
          luma_capture_slug?: string | null;
          status?: string | null;
          credits_used?: number | null;
          cost_usd?: number | null;
          raw_response?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      system_config: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          key?: string;
          value?: Json;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      tour_hotspots: {
        Row: {
          id: string;
          tour_id: string;
          titulo: string;
          descricao: string | null;
          icone: string;
          posicao_x: number;
          posicao_y: number;
          posicao_z: number;
          ordem: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          titulo: string;
          descricao?: string | null;
          icone: string;
          posicao_x: number;
          posicao_y: number;
          posicao_z: number;
          ordem?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          titulo?: string;
          descricao?: string | null;
          icone?: string;
          posicao_x?: number;
          posicao_y?: number;
          posicao_z?: number;
          ordem?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      tour_views: {
        Row: {
          id: string;
          tour_id: string;
          visitor_fingerprint: string | null;
          user_agent: string | null;
          referrer: string | null;
          ip_country: string | null;
          ip_city: string | null;
          duration_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          visitor_fingerprint?: string | null;
          user_agent?: string | null;
          referrer?: string | null;
          ip_country?: string | null;
          ip_city?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          visitor_fingerprint?: string | null;
          user_agent?: string | null;
          referrer?: string | null;
          ip_country?: string | null;
          ip_city?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      tour_waypoints: {
        Row: {
          id: string;
          tour_id: string;
          ordem: number;
          position_x: number;
          position_y: number;
          position_z: number;
          target_x: number;
          target_y: number;
          target_z: number;
          duration_ms: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          ordem: number;
          position_x: number;
          position_y: number;
          position_z: number;
          target_x: number;
          target_y: number;
          target_z: number;
          duration_ms?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          ordem?: number;
          position_x?: number;
          position_y?: number;
          position_z?: number;
          target_x?: number;
          target_y?: number;
          target_z?: number;
          duration_ms?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      tour_whatsapp_clicks: {
        Row: {
          id: string;
          tour_id: string;
          visitor_fingerprint: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          visitor_fingerprint?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          visitor_fingerprint?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      tours: {
        Row: {
          id: string;
          imobiliaria_id: string;
          corretor_id: string | null;
          slug: string;
          titulo: string;
          tipo: string;
          bairro: string | null;
          cidade: string | null;
          estado: string | null;
          area_m2: number | null;
          quartos: number | null;
          valor: number | null;
          modalidade: string | null;
          status_venda: string | null;
          descricao: string | null;
          foto_capa_url: string | null;
          video_r2_key: string | null;
          video_size_bytes: number | null;
          video_uploaded_at: string | null;
          luma_capture_slug: string | null;
          luma_status: string | null;
          luma_submitted_at: string | null;
          luma_completed_at: string | null;
          splat_r2_key: string | null;
          splat_url: string | null;
          splat_size_bytes: number | null;
          splat_r2_key_lite: string | null;
          splat_size_bytes_lite: number | null;
          status: string;
          status_message: string | null;
          is_public: boolean;
          password_hash: string | null;
          has_cinematic_mode: boolean;
          camera_up_inverted: boolean;
          splat_rotation_deg: number;
          luma_cost_credits: number | null;
          luma_cost_usd: number | null;
          cobranca_cliente_brl: number | null;
          margem_brl: number | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          imobiliaria_id: string;
          corretor_id?: string | null;
          slug: string;
          titulo: string;
          tipo: string;
          bairro?: string | null;
          cidade?: string | null;
          estado?: string | null;
          area_m2?: number | null;
          quartos?: number | null;
          valor?: number | null;
          modalidade?: string | null;
          status_venda?: string | null;
          descricao?: string | null;
          foto_capa_url?: string | null;
          video_r2_key?: string | null;
          video_size_bytes?: number | null;
          video_uploaded_at?: string | null;
          luma_capture_slug?: string | null;
          luma_status?: string | null;
          luma_submitted_at?: string | null;
          luma_completed_at?: string | null;
          splat_r2_key?: string | null;
          splat_url?: string | null;
          splat_size_bytes?: number | null;
          splat_r2_key_lite?: string | null;
          splat_size_bytes_lite?: number | null;
          status?: string;
          status_message?: string | null;
          is_public?: boolean;
          password_hash?: string | null;
          has_cinematic_mode?: boolean;
          camera_up_inverted?: boolean;
          splat_rotation_deg?: number;
          luma_cost_credits?: number | null;
          luma_cost_usd?: number | null;
          cobranca_cliente_brl?: number | null;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          imobiliaria_id?: string;
          corretor_id?: string | null;
          slug?: string;
          titulo?: string;
          tipo?: string;
          bairro?: string | null;
          cidade?: string | null;
          estado?: string | null;
          area_m2?: number | null;
          quartos?: number | null;
          valor?: number | null;
          modalidade?: string | null;
          status_venda?: string | null;
          descricao?: string | null;
          foto_capa_url?: string | null;
          video_r2_key?: string | null;
          video_size_bytes?: number | null;
          video_uploaded_at?: string | null;
          luma_capture_slug?: string | null;
          luma_status?: string | null;
          luma_submitted_at?: string | null;
          luma_completed_at?: string | null;
          splat_r2_key?: string | null;
          splat_url?: string | null;
          splat_size_bytes?: number | null;
          splat_r2_key_lite?: string | null;
          splat_size_bytes_lite?: number | null;
          status?: string;
          status_message?: string | null;
          is_public?: boolean;
          password_hash?: string | null;
          has_cinematic_mode?: boolean;
          camera_up_inverted?: boolean;
          splat_rotation_deg?: number;
          luma_cost_credits?: number | null;
          luma_cost_usd?: number | null;
          cobranca_cliente_brl?: number | null;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      upload_sessions: {
        Row: {
          id: string;
          tour_id: string;
          user_id: string;
          r2_key: string;
          upload_id: string;
          total_size_bytes: number;
          chunk_size_bytes: number;
          total_chunks: number;
          parts_completed: Json | null;
          status: string;
          created_at: string;
          expires_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          tour_id: string;
          user_id: string;
          r2_key: string;
          upload_id: string;
          total_size_bytes: number;
          chunk_size_bytes: number;
          total_chunks: number;
          parts_completed?: Json | null;
          status?: string;
          created_at?: string;
          expires_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          tour_id?: string;
          user_id?: string;
          r2_key?: string;
          upload_id?: string;
          total_size_bytes?: number;
          chunk_size_bytes?: number;
          total_chunks?: number;
          parts_completed?: Json | null;
          status?: string;
          created_at?: string;
          expires_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          user_id: string;
          role: string;
          imobiliaria_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          role: string;
          imobiliaria_id?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          role?: string;
          imobiliaria_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
