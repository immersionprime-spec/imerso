import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(_req: Request, { params }: { params: Promise<{ imobiliaria: string; tour: string }> }) {
  const { imobiliaria, tour } = await params;
  const supabase = createAdminClient();

  const { data: imo } = await supabase.from('imobiliarias').select('id, nome, slug').eq('slug', imobiliaria).maybeSingle();
  if (!imo) return new Response('Not found', { status: 404 });

  const { data } = await supabase
    .from('tours')
    .select('titulo, foto_capa_url, valor, area_m2, quartos, bairro, modalidade')
    .eq('imobiliaria_id', imo.id)
    .eq('slug', tour)
    .eq('status', 'ready')
    .eq('is_public', true)
    .is('archived_at', null)
    .maybeSingle();

  if (!data) return new Response('Not found', { status: 404 });

  const valorFmt = data.valor != null ? `R$ ${Number(data.valor).toLocaleString('pt-BR')}` : '';

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: 1200,
          height: 630,
          position: 'relative',
          fontFamily: 'system-ui, sans-serif',
          background: '#0A0E1A',
        }}
      >
        {data.foto_capa_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse OG pipeline
          <img
            src={data.foto_capa_url}
            alt=""
            width={1200}
            height={630}
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(10,14,26,0.4) 0%, rgba(10,14,26,0.95) 100%)',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 60,
            color: '#F5F2EC',
            position: 'relative',
            zIndex: 10,
            width: '100%',
          }}
        >
          <div style={{ fontSize: 28, opacity: 0.8, marginBottom: 12 }}>{imo.nome}</div>
          <div style={{ fontSize: 56, fontWeight: 700, marginBottom: 16, lineHeight: 1.1 }}>{data.titulo}</div>
          <div style={{ fontSize: 28, color: '#D4A574' }}>
            {data.bairro ?? ''}
            {data.area_m2 != null ? ` · ${data.area_m2}m²` : ''}
            {data.quartos != null ? ` · ${data.quartos} quartos` : ''}
          </div>
          {valorFmt ? <div style={{ fontSize: 36, fontWeight: 600, marginTop: 16 }}>{valorFmt}</div> : null}
          <div style={{ position: 'absolute', top: 60, right: 60, fontSize: 24, fontWeight: 600, color: '#4F8EF7' }}>
            Imerso
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
