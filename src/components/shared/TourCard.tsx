import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { Bed, Bath, Maximize2, Car } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export interface TourCardTour {
  id: string;
  titulo: string;
  slug: string;
  bairro?: string | null;
  area_m2?: number | null;
  quartos?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  valor?: number | null;
  status_venda: 'disponivel' | 'reservado' | 'vendido';
  foto_capa_url?: string | null;
}

interface TourCardProps {
  tour: TourCardTour;
  imobiliariaSlug: string;
}

const STATUS_LABEL = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendido: 'Vendido',
} as const;

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}

export function TourCard({ tour, imobiliariaSlug }: TourCardProps) {
  return (
    <Link
      href={`/${imobiliariaSlug}/${tour.slug}`}
      className="group block bg-surface border border-border rounded-lg overflow-hidden transition-all duration-200 hover:border-primary/40 hover:shadow-glow-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="relative aspect-video overflow-hidden bg-surface-elevated">
        {tour.foto_capa_url ? (
          <Image
            src={tour.foto_capa_url}
            alt={tour.titulo}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, rgba(79,142,247,.2), rgba(212,165,116,.1))' }}
          />
        )}
        <div className="absolute top-3 right-3">
          <Badge variant={tour.status_venda}>{STATUS_LABEL[tour.status_venda]}</Badge>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3
            className="font-display font-semibold text-text-primary leading-snug mb-1"
            style={{ fontSize: '1.1875rem', letterSpacing: '-0.01em' }}
          >
            {tour.titulo}
          </h3>
          {tour.bairro ? <p className="text-text-secondary text-xs">{tour.bairro}</p> : null}
        </div>

        {tour.valor != null ? (
          <div
            className="font-display font-semibold text-primary"
            style={{ fontSize: '1.375rem', letterSpacing: '-0.02em' }}
          >
            {formatBRL(tour.valor)}
            {tour.status_venda === 'vendido' ? (
              <span className="ml-2 text-text-muted line-through text-sm font-sans font-normal">Vendido</span>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-3 text-xs text-text-muted">
          {tour.quartos != null && tour.quartos > 0 ? (
            <span className="flex items-center gap-1">
              <Bed size={12} strokeWidth={1.75} aria-hidden />
              {tour.quartos}q
            </span>
          ) : null}
          {tour.banheiros != null && tour.banheiros > 0 ? (
            <span className="flex items-center gap-1">
              <Bath size={12} strokeWidth={1.75} aria-hidden />
              {tour.banheiros}b
            </span>
          ) : null}
          {tour.area_m2 != null ? (
            <span className="flex items-center gap-1">
              <Maximize2 size={12} strokeWidth={1.75} aria-hidden />
              {tour.area_m2}m²
            </span>
          ) : null}
          {tour.vagas != null && tour.vagas > 0 ? (
            <span className="flex items-center gap-1">
              <Car size={12} strokeWidth={1.75} aria-hidden />
              {tour.vagas}vg
            </span>
          ) : null}
        </div>

        <div
          className="w-full h-9 rounded-md flex items-center justify-center text-sm font-medium transition-all duration-200 border border-border-strong text-text-secondary group-hover:bg-primary group-hover:border-primary group-hover:text-white"
          aria-hidden="true"
        >
          Ver tour 3D →
        </div>
      </div>
    </Link>
  );
}
