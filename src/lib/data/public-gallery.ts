import { createAdminClient } from '@/lib/supabase/admin';

export type PublicGalleryTour = {
  id: string;
  slug: string;
  titulo: string;
  foto_capa_url: string | null;
  bairro: string | null;
  area_m2: number | null;
  quartos: number | null;
  valor: number | null;
  status_venda: string | null;
};

export type PublicGalleryData = {
  imobiliaria: {
    nome: string;
    slug: string;
    logo_url: string | null;
    cor_primaria: string;
    whatsapp_principal: string | null;
  };
  tours: PublicGalleryTour[];
};

export async function fetchPublicGallery(imobiliariaSlug: string): Promise<PublicGalleryData | null> {
  const supabase = createAdminClient();
  const { data: imo, error: imoErr } = await supabase
    .from('imobiliarias')
    .select('id, nome, slug, logo_url, cor_primaria, whatsapp_principal, archived_at')
    .eq('slug', imobiliariaSlug)
    .maybeSingle();

  if (imoErr || !imo || imo.archived_at) return null;

  const { data: tours, error: tErr } = await supabase
    .from('tours')
    .select('id, slug, titulo, foto_capa_url, bairro, area_m2, quartos, valor, status_venda, is_public')
    .eq('imobiliaria_id', imo.id)
    .eq('status', 'ready')
    .eq('is_public', true)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  if (tErr) return null;

  return {
    imobiliaria: {
      nome: imo.nome,
      slug: imo.slug,
      logo_url: imo.logo_url,
      cor_primaria: imo.cor_primaria ?? '#4F8EF7',
      whatsapp_principal: imo.whatsapp_principal,
    },
    tours: (tours ?? []).map((r) => ({
      id: r.id,
      slug: r.slug,
      titulo: r.titulo,
      foto_capa_url: r.foto_capa_url,
      bairro: r.bairro,
      area_m2: r.area_m2 != null ? Number(r.area_m2) : null,
      quartos: r.quartos,
      valor: r.valor != null ? Number(r.valor) : null,
      status_venda: r.status_venda,
    })),
  };
}
