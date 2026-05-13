# Prompt para Agente IA — Pipeline Gaussian Splatting (Imerso)

> Cole este prompt inteiro para um agente IA (Cursor, Claude, ChatGPT, etc.) quando precisar de ajuda para rodar o pipeline de geração de `.ksplat`.

---

## CONTEXTO DO PROJETO

Você está ajudando a rodar o **pipeline local de Gaussian Splatting** do projeto **Imerso**, uma plataforma SaaS brasileira de tours virtuais 3D imobiliários.

O pipeline transforma um vídeo de celular (ou pasta de fotos) em dois arquivos de tour 3D:
- `scene.ply` — arquivo bruto de Gaussian Splatting (~100MB+, para debug no SuperSplat)
- `scene.ksplat` — arquivo comprimido para produção (~10% do .ply, entregue ao browser)

**Stack do pipeline:**
- Windows 11, PowerShell 7+
- GPU NVIDIA com CUDA (RTX série 3000+, 4000+ ou 5000+)
- Node.js ≥ 20.18.0 LTS
- ffmpeg (extração de frames do vídeo)
- COLMAP 4.1 CUDA (Structure-from-Motion esparso)
- Brush v0.3.0 (`brush_app.exe`) (treinamento Gaussian Splatting)

**Localização dos arquivos:**
- Script principal: `scripts/local-gs/run-pipeline.ps1`
- Conversor .ksplat: `tools/gs3d-source/util/create-ksplat.js` (repo clonado à parte)
- Upload automático: `scripts/local-gs/upload-and-finalize.mjs`
- Este README: `scripts/local-gs/README.md`

**Tempo estimado por tour:** 45–90 minutos (RTX 5060 Ti, vídeo de 3–5 min a 2fps)

---

## SETUP UMA VEZ SÓ (fazer antes do primeiro uso)

### 1. Verificar ferramentas no PATH

Execute no PowerShell na raiz do projeto:

```powershell
ffmpeg -version
colmap -h
Get-Command brush_app
node --version
```

Se qualquer uma falhar:
- **ffmpeg**: baixar em https://ffmpeg.org/download.html, extrair, adicionar `bin/` ao PATH
- **COLMAP**: baixar binário CUDA em https://github.com/colmap/colmap/releases (v4.1), adicionar ao PATH
- **brush_app**: baixar em https://github.com/ArthurBrussee/brush/releases (v0.3.0 Windows), adicionar ao PATH
- **node**: instalar em https://nodejs.org (LTS)

### 2. Clonar o conversor .ksplat (necessário uma vez)

```powershell
# Na raiz do projeto Imerso
git clone --depth 1 --branch v0.4.7 https://github.com/mkkellogg/GaussianSplats3D.git tools/gs3d-source
cd tools/gs3d-source
npm install
cd ../..
```

Validar: `Test-Path tools/gs3d-source/util/create-ksplat.js` deve retornar `True`.

**Nota Windows:** o `npm run build` do `gs3d-source` quebra no Windows (usa `cp` Unix-only). Não é necessário rodar o build — o `create-ksplat.js` é standalone e roda só com `npm install`.

### 3. Configurar variáveis de ambiente (só para upload automático)

No arquivo `.env.local` na raiz do projeto, verificar que existem:
```
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<sua-key>
R2_SECRET_ACCESS_KEY=<seu-secret>
R2_BUCKET_NAME=splat-viewer
PIPELINE_SERVICE_TOKEN=<token-gerado-com-openssl-rand-hex-32>
```

---

## USO DO PIPELINE

### Modo básico — vídeo (gera .ply + .ksplat local)

```powershell
# Na raiz do projeto
npm run gs:local -- -VideoPath "C:\caminho\para\video.mp4"
```

### Modo fotos estáticas — recomendado para maior qualidade

```powershell
npm run gs:local -- -PhotosPath "C:\caminho\para\pasta-de-fotos"
```

A pasta deve conter ao menos 20 imagens `.jpg`, `.jpeg` ou `.png`.

### Parâmetros completos disponíveis

| Parâmetro | Default | Descrição |
|---|---|---|
| `-VideoPath` | — | Caminho para o vídeo (.mp4, .mov, etc.) |
| `-PhotosPath` | — | Caminho para pasta de fotos estáticas |
| `-OutputDir` | `.\output\<timestamp>` | Pasta de saída |
| `-FrameRate` | `2` | FPS de extração (vídeo apenas). Aumentar para 3–4 em ambientes complexos |
| `-TotalSteps` | `30000` | Passos do Brush. **60000 é o recomendado** para maior qualidade |
| `-Quality` | `medium` | Qualidade COLMAP: `low`, `medium`, `high`, `extreme` |
| `-TourId` | — | UUID do tour no banco (ativa upload automático ao R2) |
| `-ApiBaseUrl` | `http://localhost:3000` | Base URL da API do Imerso |
| `-SkipUpload` | — | Gera arquivos locais mas não faz upload |

### Exemplo recomendado para produção

```powershell
npm run gs:local -- `
  -VideoPath "D:\capturas\imovel-rua-das-flores-302.mp4" `
  -FrameRate 3 `
  -TotalSteps 60000 `
  -Quality high
```

### Exemplo com upload automático ao R2 + finalizar tour

```powershell
npm run gs:local -- `
  -VideoPath "D:\capturas\imovel.mp4" `
  -FrameRate 3 `
  -TotalSteps 60000 `
  -TourId "00ca9805-39c5-4b5d-8548-3e127269009f" `
  -ApiBaseUrl "https://imerso.com.br"
```

O `TourId` é o UUID na URL do painel: `/painel/tours/<TourId>`. O tour deve existir no banco antes de rodar.

---

## ESTRUTURA DA SAÍDA

```
output/<yyyyMMdd_HHmmss>/
├── frames/           ← JPGs extraídos pelo ffmpeg (modo vídeo)
├── colmap_ws/
│   ├── images/       ← cópia dos frames/fotos usados pelo COLMAP
│   └── sparse/0/     ← resultado SfM (cameras.bin, points3D.bin, images.bin)
├── splat/
│   ├── export_*.ply  ← checkpoints do Brush durante treino
│   ├── scene.ply     ← cópia do último export (arquivo de debug)
│   └── scene.ksplat  ← arquivo comprimido para produção (~10% do .ply)
└── pipeline.log      ← log completo com timestamps
```

---

## PASSOS INTERNOS DO PIPELINE

O script executa sequencialmente:

**[1/5] Extração de frames (ffmpeg)** — apenas no modo vídeo
- Extrai 1 frame a cada `1/FrameRate` segundos
- Salva em `frames/` como `frame_0001.jpg`, `frame_0002.jpg`, ...
- Copia frames para `colmap_ws/images/`
- Aviso se < 60 frames (qualidade pode ser ruim)

**[2/5] Reconstrução SfM esparsa (COLMAP)**
- Roda `colmap automatic_reconstructor` com GPU
- `--single_camera 1` (GoPro/celular = lente única)
- `--dense 0` (SfM esparso é suficiente para o Brush)
- Falha se sparse/0/ não for criado → pouco overlap, motion blur ou textura uniforme

**[3/5] Treino Gaussian Splatting (Brush)**
- Recebe o workspace COLMAP
- Exporta checkpoints a cada N iterações em `splat/export_*.ply`
- Ao final, o último export é copiado como `scene.ply`

**[4/5] Compressão .ksplat**
- Converte `scene.ply` → `scene.ksplat` usando `create-ksplat.js`
- Parâmetros: `compressionLevel=1`, `alphaThreshold=5`, `SH=0` (sem spherical harmonics para interiores)
- Resultado típico: 10–15% do tamanho original do .ply
- Pulado se `tools/gs3d-source/util/create-ksplat.js` não existir

**[5/5] Upload R2 + finalize** (só se `-TourId` passado)
- Faz upload multipart do `.ksplat` para o bucket R2 em `tours/<id>/splat/<nanoid>.ksplat`
- Chama `POST /api/admin/tours/<id>/splat/finalize` com autenticação via `PIPELINE_SERVICE_TOKEN`
- Marca o tour como `ready` no banco Supabase

---

## VISUALIZAR O RESULTADO

### Opção 1 — Viewer local (mesma stack do Imerso)

```powershell
# Servir a raiz do repo
npx serve .
# Então abrir no browser:
# http://localhost:3000/scripts/local-gs/test-viewer.html?ply=/output/<timestamp>/splat/scene.ply
# ou para o .ksplat:
# http://localhost:3000/scripts/local-gs/test-viewer.html?ply=/output/<timestamp>/splat/scene.ksplat
```

**Não usar `file://`** — o browser bloqueia leitura de disco local. Alternativa: arrastar o arquivo para a página do viewer.

### Opção 2 — SuperSplat online

Acessar https://superspl.at/editor e enviar o `scene.ply`.

---

## TROUBLESHOOTING

### COLMAP falhou / sparse/0/ não existe

**Causa mais comum:** pouco overlap entre frames, motion blur ou textura uniforme (paredes brancas sem detalhes).

**Soluções:**
- Aumentar `-FrameRate` para 3 ou 4 (mais frames = mais overlap)
- Mover a câmera mais devagar na captura
- Usar fotos estáticas em vez de vídeo (`-PhotosPath`)
- Aumentar `-Quality` para `high` ou `extreme`
- Verificar se o video está desfocado ou com shake excessivo

### Brush não gera .ply ou gera .ply com poucos splats

**Verificar:**
- `sparse/0/` existe e tem `cameras.bin`, `images.bin`, `points3D.bin`?
  ```powershell
  Get-ChildItem output\<timestamp>\colmap_ws\sparse\0\
  ```
- Quantos pontos 3D o COLMAP encontrou? Olhar no `pipeline.log` por "points3D"
- Brush no Windows pode não mostrar output no terminal (comportamento GUI). Aguardar até o processo encerrar.

### create-ksplat.js não encontrado

```powershell
# Clonar o repositório da lib
git clone --depth 1 --branch v0.4.7 https://github.com/mkkellogg/GaussianSplats3D.git tools/gs3d-source
cd tools/gs3d-source
npm install
cd ../..
```

### Upload falhou (erro [5/5])

- Verificar `.env.local`: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- Verificar `PIPELINE_SERVICE_TOKEN` no `.env.local` e nas env vars do servidor Next (devem ser iguais)
- Verificar se o servidor Next (`npm run dev` ou produção) está rodando no `ApiBaseUrl` informado
- Verificar se o `TourId` existe no banco (criar pelo painel `/painel/tours/novo` antes)
- Rodar com `-SkipUpload` primeiro para confirmar que os arquivos locais estão OK, depois tentar upload manual pelo painel

### Erro de permissão PowerShell

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### npm run gs:local não funciona

Verificar `package.json` na raiz — deve ter:
```json
"scripts": {
  "gs:local": "powershell -ExecutionPolicy Bypass -File scripts/local-gs/run-pipeline.ps1"
}
```

---

## CONFIGURAÇÕES DE CAPTURA RECOMENDADAS (GoPro / celular)

Para maximizar qualidade do SfM:

| Configuração | Valor recomendado | Motivo |
|---|---|---|
| HyperSmooth | **OFF** | Distorce pixels de forma inconsistente, quebra SfM |
| Trava de horizonte | **OFF** | Mesmo motivo do HyperSmooth |
| FOV | **Linear** | Sem distorção de lente fish-eye |
| Resolução | 4K ou 2.7K | Mais detalhes para o SfM |
| FPS captura | 30 | Standard; 60fps gera frames redundantes |
| ISO | ≤ 800 | Reduz ruído (grão = problema para SfM) |
| Velocidade de movimento | Lenta e uniforme | Rápido = motion blur = falha no SfM |

**Técnica recomendada:** andar em espiral pelo ambiente, cobrindo paredes, teto e chão. Mínimo 3 voltas completas. Evitar superfícies muito reflexivas (espelhos, vidros) sem cobri-las.

---

## FORMATOS DE SAÍDA — REFERÊNCIA

| Formato | Tamanho típico | Uso |
|---|---|---|
| `scene.ply` | 50–200 MB | Debug/preview no SuperSplat. Não vai para produção. |
| `scene.ksplat` | 5–25 MB (~10% do .ply) | Produção — entregue ao browser via viewer |

O viewer do Imerso detecta o formato automaticamente pela extensão. Sempre preferir `.ksplat` para produção.

---

## PARÂMETROS DE QUALIDADE DO .KSPLAT (avançado)

Os parâmetros estão fixos no `run-pipeline.ps1` (bloco `[4/4]`). Para tunar, editar diretamente:

| Parâmetro | Valor atual | Descrição |
|---|---|---|
| `compressionLevel` | `1` | 0=sem compressão, 1=recomendado, 2=máxima (mais lento) |
| `alphaThreshold` | `5` | Remove splats quase transparentes (0–255). Aumentar reduz tamanho. |
| `sphericalHarmonicsLevel` | `0` | SH grau. 0=sem (menor), 1=médio, 2=máximo. Para interiores, 0 é suficiente. |
| `blockSize` | `5.0` | Tamanho do bloco de compressão. Default OK. |
| `bucketSize` | `256` | Splats por bucket. Default OK. |

---

## REFERÊNCIAS

- Repositório Brush: https://github.com/ArthurBrussee/brush
- COLMAP docs: https://colmap.github.io
- Gaussian Splatting 3D lib: https://github.com/mkkellogg/GaussianSplats3D
- SuperSplat editor: https://superspl.at/editor
- ffmpeg download: https://ffmpeg.org/download.html
- COLMAP releases: https://github.com/colmap/colmap/releases
