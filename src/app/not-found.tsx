import Link from 'next/link';

export default function NotFound() {
  return (
    <html lang="pt" className="dark">
      <body className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 font-sans text-text-primary">
        <h1 className="font-display text-2xl font-semibold">404</h1>
        <p className="mt-2 text-text-secondary">Página não encontrada.</p>
        <Link href="/" className="mt-6 text-primary hover:text-primary-hover">
          Voltar ao início
        </Link>
      </body>
    </html>
  );
}
