export type TourTipo = 'apartamento' | 'casa' | 'comercial' | 'terreno' | 'evento';
export type Modalidade = 'venda' | 'aluguel' | 'temporada';
export type StatusVenda = 'disponivel' | 'reservado' | 'vendido';

export interface PublicTourPayload {
  tour: {
    id: string;
    titulo: string;
    tipo: TourTipo;
    bairro: string | null;
    area_m2: number | null;
    quartos: number | null;
    valor: number | null;
    modalidade: Modalidade | null;
    status_venda: StatusVenda;
    descricao: string | null;
    foto_capa_url: string | null;
    splat_url: string;
    splat_url_lite?: string;
    has_cinematic_mode: boolean;
    camera_up_inverted: boolean;
    splat_rotation_deg: number;
    camera_start_position: [number, number, number] | null;
    camera_start_target: [number, number, number] | null;
    is_password_protected: boolean;
  };
  imobiliaria: {
    slug: string;
    nome: string;
    logo_url: string | null;
    cor_primaria: string;
    whatsapp_principal: string | null;
  };
  corretor: {
    nome: string;
    creci: string | null;
    whatsapp: string;
    foto_url: string | null;
  } | null;
  hotspots: Array<{
    id: string;
    titulo: string;
    descricao: string | null;
    icone: string;
    posicao_x: number;
    posicao_y: number;
    posicao_z: number;
  }>;
  waypoints: Array<{
    id: string;
    ordem: number;
    position_x: number;
    position_y: number;
    position_z: number;
    target_x: number;
    target_y: number;
    target_z: number;
    duration_ms: number;
    label: string | null;
    next_tour_id: string | null;
    next_tour_href: string | null;
    next_cam_position: [number, number, number] | null;
    next_cam_target: [number, number, number] | null;
  }>;
}
