import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { normalizeWhatsAppDigits } from '@/lib/utils/whatsapp';

export async function PublicFooter() {
  const t = await getTranslations('landing.footer');
  const waRaw = process.env.NEXT_PUBLIC_WHATSAPP_FOUNDER?.trim();
  const waDigits = waRaw ? normalizeWhatsAppDigits(waRaw) : '';
  const waHref = waDigits.length >= 10 ? `https://wa.me/${waDigits}` : '#';

  return (
    <footer className="border-t border-border bg-surface">
      <div className="max-w-7xl mx-auto px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div>
            <Image src="/logo-full.svg" alt="Imerso" width={140} height={30} className="mb-4" />
            <p className="text-text-secondary text-sm leading-relaxed max-w-xs">{t('tagline')}</p>
          </div>

          <div>
            <div className="text-xs font-medium text-text-muted uppercase tracking-widest mb-4">
              {t('section_company')}
            </div>
            <div className="flex flex-col gap-2.5">
              <Link
                href="/termos"
                className="text-text-secondary text-sm hover:text-text-primary transition-colors duration-200"
              >
                {t('link_termos')}
              </Link>
              <Link
                href="/privacidade"
                className="text-text-secondary text-sm hover:text-text-primary transition-colors duration-200"
              >
                {t('link_privacidade')}
              </Link>
              <Link
                href="/lgpd"
                className="text-text-secondary text-sm hover:text-text-primary transition-colors duration-200"
              >
                {t('link_lgpd')}
              </Link>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-text-muted uppercase tracking-widest mb-4">
              {t('section_contact')}
            </div>
            <div className="flex flex-col gap-2.5">
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-secondary text-sm hover:text-text-primary transition-colors duration-200"
              >
                {t('link_whatsapp')}
              </a>
              <a
                href="mailto:contato@imerso.com.br"
                className="text-text-secondary text-sm hover:text-text-primary transition-colors duration-200"
              >
                {t('link_email')}
              </a>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-text-muted uppercase tracking-widest mb-4">
              {t('section_social')}
            </div>
            <div className="flex flex-col gap-2.5">
              <a
                href="#"
                className="text-text-secondary text-sm hover:text-text-primary transition-colors duration-200"
              >
                {t('link_instagram')}
              </a>
              <a
                href="#"
                className="text-text-secondary text-sm hover:text-text-primary transition-colors duration-200"
              >
                {t('link_linkedin')}
              </a>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-text-muted">
          <span>
            © {new Date().getFullYear()} Imerso. {t('rights')}
          </span>
          <span>{t('made_in')}</span>
        </div>
      </div>
    </footer>
  );
}
