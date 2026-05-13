# Configuração CORS — Bucket R2

## Por quê

O viewer 3D faz fetch do .ply do R2. Sem CORS configurado, o browser bloqueia em produção (erro CORB).

## Passos no dashboard Cloudflare

1. Cloudflare dashboard → R2 → bucket `splat-viewer`
2. Aba "Settings" → seção "CORS Policy"
3. Clicar "Add CORS policy"
4. Colar o conteúdo de `scripts/r2-cors-config.json`
5. Salvar

## Validação

- Abrir o viewer de um tour: viewer carrega sem erros no Console
- Console NÃO deve mostrar erro "CORS policy" ou "blocked by CORB"

## Domínios em produção

Antes de ir pra produção, atualizar `AllowedOrigins` removendo localhost e adicionando o domínio final.

## Decisão sobre R2 público vs privado

**HOJE:** bucket é público (URLs r2.dev / `*.r2.cloudflarestorage.com` servem direto).

**RECOMENDADO (futuro):** tornar o bucket privado e servir tudo via `/api/public/tours/[id]/splat` (já implementado no Prompt 2). Isso fecha o vazamento por completo. Requer:

- Desabilitar "Public access" no bucket
- Confirmar que TODAS as URLs do R2 no banco são geradas via presigned URL (verificar `foto_capa_url`, `logo_url` — esses ainda usam `r2PublicUrl` direto)
- Adicionar `/api/public/r2-image/[key]` proxy se quiser mesmo nível de segurança em imagens

Esse passo fica no roadmap principal (item separado) — não fazer agora.
