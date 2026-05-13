import { Film, Home, Sparkles, Building2, Car } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { Hero } from '@/components/landing/Hero';
import { LeadForm } from '@/components/landing/LeadForm';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils/cn';

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'landing.hero' });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return {
    title: `Imerso — ${t('title')}`,
    description: t('subtitle'),
    openGraph: {
      title: `Imerso — ${t('title')}`,
      description: t('subtitle'),
      url: base,
      locale: locale === 'pt' ? 'pt_BR' : locale === 'es' ? 'es' : 'en_US',
      type: 'website',
      images: ['/og-default.png'],
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const demo = await getTranslations('landing.demo');
  const how = await getTranslations('landing.how_it_works');
  const cases = await getTranslations('landing.use_cases');
  const beforeAfter = await getTranslations('landing.before_after');
  const pricing = await getTranslations('landing.pricing');
  const testimonials = await getTranslations('landing.testimonials');
  const faq = await getTranslations('landing.faq');

  const steps = how.raw('steps') as { title: string; desc: string }[];
  const useItems = cases.raw('items') as { title: string; desc: string }[];
  const faqItems = faq.raw('items') as { q: string; a: string }[];
  const quotes = testimonials.raw('items') as { quote: string; name: string; role: string }[];

  const icons = [Home, Sparkles, Building2, Car];
  const embedUrl = process.env.NEXT_PUBLIC_LANDING_DEMO_EMBED_URL?.trim();
  const demoPath = process.env.NEXT_PUBLIC_LANDING_DEMO_PATH?.trim();

  const anchor = (fragment: string) => {
    const base = `/${locale}`;
    return `${base}#${fragment}`;
  };

  return (
    <>
      <PublicHeader />
      <main className="pb-16 pt-16">
        <Hero demoPath={demoPath} />

        {/* Demo */}
        <section id="demo" className="scroll-mt-24 border-y border-border bg-surface/40 py-20">
          <div className="container-imerso space-y-8">
            <div className="max-w-2xl space-y-2">
              <h2 className="font-display text-3xl font-medium text-text-primary">
                {demo('title')}
              </h2>
              <p className="text-text-secondary">{demo('subtitle')}</p>
            </div>
            <div className="relative aspect-video overflow-hidden rounded-xl border border-border-strong bg-background shadow-lg">
              {embedUrl ? (
                <iframe
                  title={demo('title')}
                  src={embedUrl}
                  className="absolute inset-0 h-full w-full"
                  allow="fullscreen"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 p-8 text-center">
                  <Film className="h-12 w-12 text-text-muted" aria-hidden />
                  <p className="max-w-md text-sm text-text-secondary">{demo('embed_fallback')}</p>
                  {demoPath ? (
                    <Link
                      href={`/${demoPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: 'accent', size: 'md' })}
                    >
                      {demo('open_new')}
                    </Link>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="scroll-mt-24 py-20">
          <div className="container-imerso space-y-12">
            <h2 className="font-display text-center text-3xl font-medium text-text-primary">
              {how('title')}
            </h2>
            <div className="grid gap-8 md:grid-cols-3">
              {steps.map((step, i) => (
                <Card key={step.title} className="border-border bg-surface-elevated p-6 transition-colors hover:border-primary/30">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <span className="font-mono text-lg font-semibold">{i + 1}</span>
                  </div>
                  <h3 className="font-display text-xl font-medium text-text-primary">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{step.desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Casos */}
        <section id="casos" className="scroll-mt-24 border-y border-border bg-surface/30 py-20">
          <div className="container-imerso space-y-12">
            <h2 className="font-display text-center text-3xl font-medium text-text-primary">
              {cases('title')}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {useItems.map((item, i) => {
                const Icon = icons[i] ?? Building2;
                return (
                  <Card
                    key={item.title}
                    className="flex flex-col gap-3 border-border bg-surface-elevated p-6 transition-all hover:-translate-y-0.5 hover:shadow-glow-primary"
                  >
                    <Icon className="h-8 w-8 text-accent" aria-hidden />
                    <h3 className="font-display text-lg font-medium text-text-primary">{item.title}</h3>
                    <p className="text-sm text-text-secondary">{item.desc}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Antes / depois */}
        <section className="py-20">
          <div className="container-imerso grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="space-y-4">
              <h2 className="font-display text-3xl font-medium text-text-primary">
                {beforeAfter('title')}
              </h2>
              <p className="text-text-secondary">{beforeAfter('caption')}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="flex aspect-[4/3] flex-col justify-end overflow-hidden border-border bg-gradient-to-br from-surface-hover to-background p-4">
                <span className="text-xs uppercase tracking-wide text-text-muted">{beforeAfter('before')}</span>
              </Card>
              <Card className="flex aspect-[4/3] flex-col justify-end overflow-hidden border border-accent/30 bg-gradient-to-br from-primary/20 to-surface p-4 shadow-glow-accent">
                <span className="text-xs uppercase tracking-wide text-accent">{beforeAfter('after')}</span>
              </Card>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-y border-border bg-surface/40 py-20">
          <div className="container-imerso flex flex-col items-center text-center">
            <h2 className="font-display text-3xl font-medium text-text-primary">{pricing('title')}</h2>
            <p className="mt-4 max-w-xl text-text-secondary">{pricing('desc')}</p>
            <p className="mt-6 font-display text-4xl font-semibold text-accent">{pricing('label')}</p>
            <a
              href={anchor('solicitar')}
              className={cn(buttonVariants({ variant: 'accent', size: 'lg' }), 'mt-8')}
            >
              {pricing('cta')}
            </a>
          </div>
        </section>

        {/* Depoimentos */}
        <section className="py-20">
          <div className="container-imerso space-y-10">
            <h2 className="font-display text-center text-3xl font-medium text-text-primary">
              {testimonials('title')}
            </h2>
            <p className="text-center text-sm text-text-muted">{testimonials('placeholder')}</p>
            <div className="grid gap-6 md:grid-cols-3">
              {quotes.map((item) => (
                <Card key={item.name + item.quote} className="border-border bg-surface-elevated p-6">
                  <p className="text-sm italic text-text-primary">{item.quote}</p>
                  <p className="mt-4 text-sm font-medium text-text-primary">{item.name}</p>
                  <p className="text-xs text-text-muted">{item.role}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 border-y border-border bg-surface/30 py-20">
          <div className="container-imerso max-w-3xl space-y-8">
            <h2 className="font-display text-center text-3xl font-medium text-text-primary">
              {faq('title')}
            </h2>
            <div className="space-y-3">
              {faqItems.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-lg border border-border bg-surface-elevated px-4 py-3 open:border-primary/40 open:shadow-md"
                >
                  <summary className="cursor-pointer list-none font-medium text-text-primary outline-none marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-2">
                      {item.q}
                      <span className="text-text-muted transition group-open:rotate-180">▼</span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Lead */}
        <section id="solicitar" className="scroll-mt-24 py-24">
          <div className="container-imerso">
            <LeadForm />
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
