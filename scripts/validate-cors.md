# Como validar que o CORS está funcionando

## Após aplicar o CORS no dashboard R2:

1. Abra um tour público no browser: `https://seu-dominio.com/[imobiliaria-slug]/[tour-slug]`
2. Abra DevTools → aba Network
3. Filtre por `splat` ou `ksplat`
4. O request para a presigned URL R2 deve retornar **200**, não erro CORS
5. Se aparecer erro `Access-Control-Allow-Origin`, o CORS não foi aplicado corretamente

## Sintomas de CORS faltando:
- Viewer fica na tela de loading indefinidamente
- Console do browser mostra: `Cross-Origin Request Blocked`
- Request para `*.r2.dev` ou `*.r2.cloudflarestorage.com` com status `(blocked)`

## Notas:
- O CORS é aplicado no bucket, não no código — mudanças no código não resolvem
- O arquivo `scripts/r2-cors-config.json` contém a configuração correta
- Siga as instruções em `scripts/R2_CORS_SETUP.md`
