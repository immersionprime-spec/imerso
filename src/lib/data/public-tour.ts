// TODO(founder): clone tools/gs3d-source (v0.4.7) + npm install; rode pipeline e finalize com .ksplat; valide viewer (Network → splat/scene.ksplat).
import { createAdminClient } from '@/lib/supabase/admin';
import { tourSplatProxyUrl } from '@/lib/splat/tour-splat-url';
import { verifyTourAccessToken, tourAccessCookieName } from '@/lib/auth/tour-access-token';
import type { PublicTourPayload, TourTipo, Modalidade, StatusVenda } from '@/types/public-tour';
import type { Json } from '@/types/database.types';

type FetchOptions = {
  imobiliariaSlug: string;
  tourSlug: string;
  accessToken?: string | null;
};

function mapTipo(raw: string): TourTipo {
  const v = ['apartamento', 'casa', 'comercial', 'terreno', 'evento'] as const;
  return (v.includes(raw as TourTipo) ? raw : 'apartamento') as TourTipo;
}

function mapModalidade(raw: string | null): Modalidade | null {
  if (!raw) return null;
  const v = ['venda', 'aluguel', 'temporada'] as const;
  return v.includes(raw as Modalidade) ? (raw as Modalidade) : null;
}

function mapStatusVenda(raw: string | null): StatusVenda {
  const v = raw as StatusVenda;
  if (v === 'reservado' || v === 'vendido' || v === 'disponivel') return v;
  return 'disponivel';
}

function parseCameraVec(json: Json | null): { x: number; y: number; z: number } | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  const z = Number(o.z);
  if (![x, y, z].every((n) => Number.isFinite(n))) return null;
  return { x, y, z };
}

function parseCameraTuple(json: Json | null): [number, number, number] | null {
  const v = parseCameraVec(json);
  return v ? [v.x, v.y, v.z] : null;
}

/** Server-only: loads tour for public viewer; enforces ready, not archived, access rules. */
export async function fetchPublicTourPayload(opts: FetchOptions): Promise<
  | { ok: true; data: PublicTourPayload }
  | { ok: false; code: 'NOT_FOUND' | 'PASSWORD_REQUIRED' }
> {
  const supabase = createAdminClient();

  const { data: imoRow, error: imoErr } = await supabase
    .from('imobiliarias')
    .select('id, slug, nome, logo_url, cor_primaria, whatsapp_principal, archived_at')
    .eq('slug', opts.imobiliariaSlug)
    .maybeSingle();

  if (imoErr || !imoRow || imoRow.archived_at) {
    return { ok: false, code: 'NOT_FOUND' };
  }

  const { data: tourRow, error: tourErr } = await supabase
    .from('tours')
    .select(
      'id, slug, titulo, tipo, bairro, area_m2, quartos, valor, modalidade, status_venda, descricao, foto_capa_url, splat_r2_key, splat_r2_key_lite, has_cinematic_mode, camera_up_inverted, is_public, password_hash, status, archived_at, corretor_id, splat_rotation_deg, camera_start_position, camera_start_target'
    )
    .eq('imobiliaria_id', imoRow.id)
    .eq('slug', opts.tourSlug)
    .maybeSingle();

  if (tourErr || !tourRow) {
    return { ok: false, code: 'NOT_FOUND' };
  }

  if (tourRow.archived_at) {
    return { ok: false, code: 'NOT_FOUND' };
  }

  if (tourRow.status !== 'ready') {
    return { ok: false, code: 'NOT_FOUND' };
  }

  const passwordProtected = Boolean(tourRow.password_hash);
  const needsAccessGate = tourRow.is_public === false || passwordProtected;

  if (needsAccessGate) {
    const token = opts.accessToken ?? null;
    if (!token || !verifyTourAccessToken(token, tourRow.id)) {
      return { ok: false, code: 'PASSWORD_REQUIRED' };
    }
  }

  if (!tourRow.splat_r2_key?.trim()) {
    return { ok: false, code: 'NOT_FOUND' };
  }
  const splatUrl = tourSplatProxyUrl(tourRow.id, tourRow.splat_r2_key);
  if (!splatUrl) {
    return { ok: false, code: 'NOT_FOUND' };
  }
  const splatUrlLite = tourRow.splat_r2_key_lite?.trim()
    ? tourSplatProxyUrl(tourRow.id, tourRow.splat_r2_key_lite, 'lite')
    : undefined;

  let corretor: PublicTourPayload['corretor'] = null;
  if (tourRow.corretor_id) {
    const { data: c } = await supabase
      .from('corretores')
      .select('nome, creci, whatsapp, foto_url, ativo')
      .eq('id', tourRow.corretor_id)
      .eq('imobiliaria_id', imoRow.id)
      .maybeSingle();
    if (c && c.ativo !== false) {
      corretor = { nome: c.nome, creci: c.creci, whatsapp: c.whatsapp, foto_url: c.foto_url };
    }
  }

  const { data: hotspots } = await supabase
    .from('tour_hotspots')
    .select('id, titulo, descricao, icone, posicao_x, posicao_y, posicao_z')
    .eq('tour_id', tourRow.id)
    .order('ordem', { ascending: true });

  let waypoints: PublicTourPayload['waypoints'] = [];
  {
    const { data: wp } = await supabase
      .from('tour_waypoints')
      .select(
        'id, ordem, position_x, position_y, position_z, target_x, target_y, target_z, duration_ms, label, next_tour_id, next_cam_position, next_cam_target'
      )
      .eq('tour_id', tourRow.id)
      .order('ordem', { ascending: true });

    type WpRow = {
      id: string;
      ordem: number;
      position_x: number | string;
      position_y: number | string;
      position_z: number | string;
      target_x: number | string;
      target_y: number | string;
      target_z: number | string;
      duration_ms: number | null;
      label: string | null;
      next_tour_id: string | null;
      next_cam_position: Json | null;
      next_cam_target: Json | null;
    };

    const wpList = (wp ?? []) as unknown as WpRow[];
    const nextTourIds = wpList
      .map((w) => w.next_tour_id)
      .filter((id): id is string => Boolean(id));

    const nextHrefMap: Record<string, string> = {};
    if (nextTourIds.length > 0) {
      const { data: destTours } = await supabase
        .from('tours')
        .select('id, slug, imobiliaria_id')
        .in('id', nextTourIds);
      if (destTours && destTours.length > 0) {
        const imoIds = [...new Set(destTours.map((t) => t.imobiliaria_id as string))];
        const { data: imos } = await supabase
          .from('imobiliarias')
          .select('id, slug')
          .in('id', imoIds);
        const imoMap: Record<string, string> = {};
        for (const imo of imos ?? []) {
          imoMap[imo.id as string] = imo.slug as string;
        }
        for (const t of destTours) {
          const imoSlug = imoMap[t.imobiliaria_id as string];
          if (imoSlug) {
            nextHrefMap[t.id as string] = `/pt/${imoSlug}/${t.slug}`;
          }
        }
      }
    }

    waypoints = wpList.map((w) => ({
      id: w.id,
      ordem: w.ordem,
      position_x: Number(w.position_x),
      position_y: Number(w.position_y),
      position_z: Number(w.position_z),
      target_x: Number(w.target_x),
      target_y: Number(w.target_y),
      target_z: Number(w.target_z),
      duration_ms: w.duration_ms ?? 4000,
      label: (w.label as string | null) ?? null,
      next_tour_id: (w.next_tour_id as string | null) ?? null,
      next_tour_href: w.next_tour_id ? (nextHrefMap[w.next_tour_id as string] ?? null) : null,
      next_cam_position: parseCameraTuple(w.next_cam_position),
      next_cam_target: parseCameraTuple(w.next_cam_target),
    }));
  }

  const data: PublicTourPayload = {
    tour: {
      id: tourRow.id,
      titulo: tourRow.titulo,
      tipo: mapTipo(tourRow.tipo),
      bairro: tourRow.bairro,
      area_m2: tourRow.area_m2 != null ? Number(tourRow.area_m2) : null,
      quartos: tourRow.quartos,
      valor: tourRow.valor != null ? Number(tourRow.valor) : null,
      modalidade: mapModalidade(tourRow.modalidade),
      status_venda: mapStatusVenda(tourRow.status_venda),
      descricao: tourRow.descricao,
      foto_capa_url: tourRow.foto_capa_url,
      splat_url: splatUrl,
      ...(splatUrlLite ? { splat_url_lite: splatUrlLite } : {}),
      has_cinematic_mode: Boolean(tourRow.has_cinematic_mode),
      camera_up_inverted: tourRow.camera_up_inverted !== false,
      splat_rotation_deg: tourRow.splat_rotation_deg ?? 0,
      camera_start_position: parseCameraTuple(tourRow.camera_start_position),
      camera_start_target: parseCameraTuple(tourRow.camera_start_target),
      is_password_protected: passwordProtected,
    },
    imobiliaria: {
      slug: imoRow.slug,
      nome: imoRow.nome,
      logo_url: imoRow.logo_url,
      cor_primaria: imoRow.cor_primaria ?? '#4F8EF7',
      whatsapp_principal: imoRow.whatsapp_principal,
    },
    corretor,
    hotspots:
      (hotspots ?? []).map((h) => ({
        id: h.id,
        titulo: h.titulo,
        descricao: h.descricao,
        icone: h.icone,
        posicao_x: Number(h.posicao_x),
        posicao_y: Number(h.posicao_y),
        posicao_z: Number(h.posicao_z),
      })) ?? [],
    waypoints,
  };

  return { ok: true, data };
}

export function getTourAccessCookieName(tourId: string): string {
  return tourAccessCookieName(tourId);
}

export async function fetchPublicTourPayloadWithCookies(
  imobiliariaSlug: string,
  tourSlug: string,
  getCookie: (name: string) => string | undefined
): Promise<
  | { ok: true; data: PublicTourPayload }
  | { ok: false; code: 'NOT_FOUND' | 'PASSWORD_REQUIRED' }
> {
  const first = await fetchPublicTourPayload({
    imobiliariaSlug,
    tourSlug,
    accessToken: null,
  });
  if (first.ok || first.code === 'NOT_FOUND') return first;

  const supabase = createAdminClient();
  const { data: imo } = await supabase.from('imobiliarias').select('id').eq('slug', imobiliariaSlug).maybeSingle();
  if (!imo) return { ok: false, code: 'NOT_FOUND' };
  const { data: t } = await supabase
    .from('tours')
    .select('id')
    .eq('imobiliaria_id', imo.id)
    .eq('slug', tourSlug)
    .maybeSingle();
  if (!t) return { ok: false, code: 'NOT_FOUND' };

  const token = getCookie(tourAccessCookieName(t.id));
  return fetchPublicTourPayload({
    imobiliariaSlug,
    tourSlug,
    accessToken: token,
  });
}
