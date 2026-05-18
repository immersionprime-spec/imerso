# Pipeline local: video OU fotos -> COLMAP SfM sparse -> Brush -> scene.ply
#
# Uso video:
#   npm run gs:local -- -VideoPath "C:\caminho\video.mp4" -Transpose cw
#
# Uso fotos:
#   npm run gs:local -- -PhotosPath "C:\caminho\pasta-fotos"
#
# Rotacao GoPro vertical:
#   -Transpose cw   -> 90 graus horario      <- CORRETO para GoPro vertical deste projeto
#   -Transpose ccw  -> 90 graus anti-horario (ficava de cabeca pra baixo - NAO usar)
#   -Transpose flip -> 180 graus
#   -Transpose none -> sem rotacao (padrao; mantém landscape)
#
# Otimizacao COLMAP:
#   --data_type video  -> sequential matching O(n) em vez de exaustivo O(n^2)
#   -MaxFrames         -> so com -SkipFrameSelection: cap automatico de frames; FPS 0.5–2
#                         Sem -SkipFrameSelection: extracao densa 5 fps + frame_selector.py
# SAM2 (P03, opcional):
#   -EnableSamMasking  -> mascaras em masks/ + COLMAP manual com ImageReader.mask_path
#                         Requer modelos em scripts/local-gs/models/ (ver README)

param(
  [Parameter(Mandatory = $false)][string]$VideoPath = "",
  [string]$PhotosPath = "",
  [string]$OutputDir = "",
  [int]$FrameRate = 0,        # 0 = auto; FrameRate manual e SEMPRE limitado pelo MaxFrames cap
  [int]$MaxFrames = 500,      # cap DURO de frames - nunca ultrapassado, mesmo com -FrameRate explicito
  [int]$TotalSteps = 20000,
  [string]$Quality = "medium", # NUNCA "high": desabilita GPU SIFT, usa CPU Covariant (10x mais lento)
  [string]$TourId = $null,
  [string]$ApiBaseUrl = "http://localhost:3000",
  [switch]$SkipUpload,
  [ValidateSet("none", "ccw", "cw", "flip")]
  [string]$Transpose = "none",
  [int]$FrameTargetCount = 300,         # alvo de frames apos selecao (aumentado: SfM/BA mais estavel com mais paralaxe)
  [double]$FrameMinSharpness = 35.0,    # threshold Laplaciano (35 cobre video em movimento; 80 era so foto parada)
  [int]$FramePhashThreshold = 6,
  [switch]$SkipFrameSelection,
  [switch]$LoopClosureStrict,   # repassa --strict ao validator (exit 1 se warning); pipeline NAO aborta
  [switch]$AbortOnLowRegistration,  # aborta antes do Brush se COLMAP registrar < 50% (evita treino inutil)
  [double]$LowRegistrationThreshold = 0.50,
  [switch]$StrictSfmQuality,              # P-NEW: aborta se sparse fragmentou OU registration_ratio < threshold
  [double]$StrictSfmMinRegistration = 0.95,
  [int]$MaxImageSize = 0,           # se > 0, redimensiona colmap_ws/images/ in-place para esse lado maior antes do COLMAP (evita STATUS_STACK_BUFFER_OVERRUN em GPUs com pouca VRAM)
  [switch]$ForceCpuMatcher,         # forca pipeline manual com SIFT CPU matcher (estavel, mas ~5-10x mais lento)
  [switch]$GenerateYupPly,          # P10: gera splat/scene.yup.ply com R_x(180 graus) para compatibilidade com SuperSplat / Blender / Unity (Y up OpenGL)
  [switch]$EnableSamMasking,
  [double]$SamConfidence = 0.35,
  [switch]$ForceColmapMapper,   # P04: bypass do GLOMAP (debug ou A/B testing)
  [switch]$UseHloc,             # P05: features SuperPoint + LightGlue (fallback COLMAP SIFT)
  [int]$HlocMaxImageSize = 1600,
  [int]$HlocPairsPerImage = 30,
  [int]$HlocMaxKeypoints = 4096,
  [ValidateSet('brush','mipsplatting')]
  [string]$Trainer = 'brush',   # P06: trainer 3DGS; brush=Brush 0.3.0 (default), mipsplatting=Mip-Splatting
  [int]$TrainerIterations = 0,  # 0 = usar padrao do trainer (Brush=$TotalSteps; Mip=30000)
  [int]$MipResolution = 1600,   # Plano B P06: 1024 se OOM em GPUs com <16GB
  [switch]$EnablePruning,       # P07: LightGaussian pruning antes do create-ksplat.js
  [double]$PruneRatio = 0.6,    # P07: fracao de gaussianas removidas (0..0.85)
  [switch]$EnableQuantization,  # P07: quantizacao opcional (k-means k=256). Default OFF
  [int]$PruneViewSample = 0,    # P07 Plano B: amostragem de views (0 = usar todas)
  [switch]$EnableReorder,       # P08: reordena .ply por importancia antes do .ksplat (TTR progressive)
  [switch]$GenerateLiteKsplat,  # P08: gera scene.lite.ksplat (~ratio) alem do full
  [double]$LiteKsplatRatio = 0.30,
  [switch]$ValidateMidTrainingGrowth,          # P-NEW: valida que export_15000.ply tem >= MinGaussians15k
  [int]$MinGaussians15k = 100000,
  [switch]$KillSwitchEnabled,                 # P-NEW Fase2: mata brush_app em tempo real se congelar
  [int]$KillSwitchCheckEverySec = 60,         # intervalo de polling do watcher (segundos)
  [int]$KillSwitchMinGaussians15k = 100000,   # se export_15000 < este, mata
  [int]$KillSwitchStallTolerance = 3,         # quantos exports consecutivos sem crescimento toleram
  [double]$KillSwitchStallMinGrowthPct = 5.0, # crescimento minimo entre exports (%) para nao contar como stall
  [switch]$SkipTraining         # AI Advisor: encerra pipeline apos SfM+loop-closure; pula Brush e upload
)

$ErrorActionPreference = "Continue"

# ─── GUARD: Quality "high" e PROIBIDO ────────────────────────────────────────
# -quality high desabilita GPU SIFT e usa Covariant SIFT (CPU-only), tornando
# o COLMAP 10x mais lento. Para video de 7 min isso significa horas extras.
# Use sempre "medium" (GPU SIFT ativo, resultados igualmente bons para GS).
if ($Quality -eq "high") {
  Write-Warning "ATENCAO: -Quality high foi bloqueado automaticamente e substituido por 'medium'."
  Write-Warning "Motivo: 'high' desativa GPU SIFT e usa CPU Covariant (10x mais lento, horas extras)."
  $Quality = "medium"
}
# ─────────────────────────────────────────────────────────────────────────────

$photoMode = -not [string]::IsNullOrWhiteSpace($PhotosPath)
$hasVideo  = -not [string]::IsNullOrWhiteSpace($VideoPath)

if (-not $photoMode -and -not $hasVideo) {
  Write-Error "Indique -VideoPath ou -PhotosPath."
  exit 1
}

if ($photoMode) {
  if (-not (Test-Path -LiteralPath $PhotosPath)) {
    Write-Error "Pasta de fotos nao existe: $PhotosPath"
    exit 1
  }
  $photoFiles = @(Get-ChildItem -LiteralPath $PhotosPath -File | Where-Object {
    $e = $_.Extension.ToLowerInvariant()
    ($e -eq '.jpg') -or ($e -eq '.jpeg') -or ($e -eq '.png')
  })
  if ($photoFiles.Count -lt 20) {
    Write-Error "A pasta deve conter pelo menos 20 imagens. Encontradas: $($photoFiles.Count)"
    exit 1
  }
} else {
  if (-not (Test-Path -LiteralPath $VideoPath)) {
    Write-Error "Video nao existe: $VideoPath"
    $parent = Split-Path -Parent $VideoPath
    $leaf = Split-Path -Leaf $VideoPath
    if ($parent -and $leaf -and (Test-Path -LiteralPath $parent)) {
      $sameName = @()
      foreach ($sub in Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue) {
        $candidate = Join-Path $sub.FullName $leaf
        if (Test-Path -LiteralPath $candidate) { $sameName += $candidate }
      }
      if ($sameName.Count -gt 0) {
        Write-Host "Dica: o ficheiro com o mesmo nome foi encontrado numa subpasta de '$parent':" -ForegroundColor Yellow
        foreach ($p in $sameName) { Write-Host "  $p" -ForegroundColor Yellow }
        Write-Host "Use -VideoPath com o caminho completo acima." -ForegroundColor Yellow
      }
    }
    exit 1
  }
}

# P06: brush_app so e exigido se -Trainer brush (default).
# Mip-Splatting depende de python + diff-gaussian-rasterization, validados ao rodar ETAPA 3.
# Se -SkipTraining ativo, nao valida brush_app (nao vai ser usado).
$requiredTools = @("colmap")
if ($Trainer -eq 'brush' -and -not $SkipTraining) {
  $requiredTools += "brush_app"
}
foreach ($t in $requiredTools) {
  if (-not (Get-Command $t -ErrorAction SilentlyContinue)) {
    Write-Error "'$t' nao encontrado no PATH."
    exit 1
  }
}
if (-not $photoMode) {
  if (-not (Get-Command "ffmpeg" -ErrorAction SilentlyContinue)) {
    Write-Error "ffmpeg nao encontrado no PATH."
    exit 1
  }
  if (-not (Get-Command "ffprobe" -ErrorAction SilentlyContinue)) {
    Write-Error "ffprobe nao encontrado no PATH."
    exit 1
  }
}

# Pastas de saida
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $OutputDir = Join-Path (Get-Location) "output\$timestamp"
}
$framesDir       = Join-Path $OutputDir "frames"
$colmapDir       = Join-Path $OutputDir "colmap_ws"
$splatDir        = Join-Path $OutputDir "splat"
$logFile         = Join-Path $OutputDir "pipeline.log"
$colmapImagesDir = Join-Path $colmapDir "images"
$masksDir        = Join-Path $OutputDir "masks"
$SamUsed         = $false
New-Item -ItemType Directory -Force -Path $framesDir, $colmapDir, $splatDir, $colmapImagesDir | Out-Null

function Log {
  param([string]$msg)
  $line = "[$([datetime]::Now.ToString('HH:mm:ss'))] $msg"
  Write-Host $line
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

# ─── P04: helpers GLOMAP ─────────────────────────────────────────────────────
function Test-GlomapAvailable {
  $glomapCmd = Get-Command glomap -ErrorAction SilentlyContinue
  if ($glomapCmd) { return $true }
  return $false
}

# Le os primeiros 8 bytes de images.bin (uint64 little-endian = num_reg_images).
# Evita rodar Python so para contar imagens registradas.
function Get-RegisteredImagesCount {
  param([Parameter(Mandatory = $true)][string]$ImagesBinPath)
  if (-not (Test-Path -LiteralPath $ImagesBinPath)) { return 0 }
  try {
    $fs = [System.IO.File]::OpenRead($ImagesBinPath)
    try {
      $buf = [byte[]]::new(8)
      [void]$fs.Read($buf, 0, 8)
      return [int][System.BitConverter]::ToUInt64($buf, 0)
    } finally {
      $fs.Close()
    }
  } catch {
    return 0
  }
}

# --- P-NEW Fase2: le 'element vertex N' do header de um .ply -----------------
function Get-PlyVertexCount {
  param([Parameter(Mandatory = $true)][string]$PlyPath)
  if (-not (Test-Path -LiteralPath $PlyPath)) { return 0 }
  try {
    $fs = [System.IO.File]::OpenRead($PlyPath)
    try {
      $reader = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $linesRead = 0
      while (-not $reader.EndOfStream -and $linesRead -lt 60) {
        $hline = $reader.ReadLine()
        if ($hline -match '^element\s+vertex\s+(\d+)') {
          $reader.Dispose()
          return [int]$matches[1]
        }
        if ($hline -eq 'end_header') { break }
        $linesRead++
      }
      $reader.Dispose()
      return 0
    } finally { $fs.Close() }
  } catch {
    return 0
  }
}
# ------------------------------------------------------------------------------

$GlomapAvailable = Test-GlomapAvailable
$UseGlomap       = (-not $ForceColmapMapper) -and $GlomapAvailable
# ─────────────────────────────────────────────────────────────────────────────

Log "=== PIPELINE LOCAL GS - INICIO ==="
if ($photoMode) {
  Log "Modo: fotos | Pasta: $PhotosPath"
} else {
  Log "Modo: video | Arquivo: $VideoPath"
}
Log "Saida: $OutputDir"
Log "Steps: $TotalSteps | Quality: $Quality | Transpose: $Transpose | MaxFrames: $MaxFrames | SkipFrameSelection: $SkipFrameSelection | EnableSamMasking: $EnableSamMasking | ForceColmapMapper: $ForceColmapMapper | UseHloc: $UseHloc | MaxImageSize: $MaxImageSize | ForceCpuMatcher: $ForceCpuMatcher | GenerateYupPly: $GenerateYupPly | SkipTraining: $SkipTraining"

if ($GlomapAvailable -and $UseGlomap) {
  Log "GLOMAP detectado no PATH - sera usado no passo de mapping (P04)."
} elseif ($GlomapAvailable -and -not $UseGlomap) {
  Log "GLOMAP encontrado, mas -ForceColmapMapper ativo: usando COLMAP no mapping."
} else {
  Log "GLOMAP nao encontrado no PATH - pipeline usa COLMAP (comportamento legacy)."
}

# Mapeamento transpose -> filtro ffmpeg
$transposeFilter = switch ($Transpose) {
  "cw"   { "transpose=1" }
  "ccw"  { "transpose=2" }
  "flip" { "transpose=2,transpose=2" }
  default { "" }
}

# ─── ETAPA 1: Extracao densa + selecao de frames (P01) ou baseline (-SkipFrameSelection) ─
$framesRawDir = Join-Path $OutputDir "frames_raw"
$reportPath    = Join-Path $OutputDir "frame_selection_report.json"
$frameSelector = Join-Path $PSScriptRoot "frame_selector.py"

if ($SkipFrameSelection) {
  # Baseline: ffmpeg FPS dinamico (0.5–2) -> frames/ ; fotos -> colmap_ws/images/
  if (-not $photoMode) {
    Log "[1/5] Extraindo frames com ffmpeg (baseline -SkipFrameSelection)..."
    $sw1 = [Diagnostics.Stopwatch]::StartNew()

    $effectiveFps = $FrameRate
    # ── SEMPRE calcular duracao para aplicar o cap de MaxFrames ──────────────
    $durationStr = & ffprobe -v error -show_entries format=duration `
        -of default=noprint_wrappers=1:nokey=1 $VideoPath 2>$null
    $durationSec = [double]::Parse($durationStr, [System.Globalization.CultureInfo]::InvariantCulture)

    if ($effectiveFps -le 0) {
      # Modo auto: calcula FPS ideal pelo MaxFrames
      $rawFps = $MaxFrames / $durationSec
      $effectiveFps = [math]::Round([math]::Max(0.5, [math]::Min(3.0, $rawFps)), 2)
      Log "[1/5] Video: $([math]::Round($durationSec))s | FPS auto: $effectiveFps | Frames estimados: $([math]::Round($durationSec * $effectiveFps))"
    } else {
      # Modo manual: aplica cap de MaxFrames mesmo assim (BUG FIX)
      $maxFpsAllowed = [math]::Round($MaxFrames / $durationSec, 2)
      if ($effectiveFps -gt $maxFpsAllowed) {
        Log "[1/5] AVISO: -FrameRate $effectiveFps fps resultaria em mais de $MaxFrames frames. Limitado para $maxFpsAllowed fps."
        $effectiveFps = $maxFpsAllowed
      }
      Log "[1/5] Video: $([math]::Round($durationSec))s | FPS manual (com cap): $effectiveFps | Frames estimados: $([math]::Round($durationSec * $effectiveFps))"
    }
    # ─────────────────────────────────────────────────────────────────────────

    if ($transposeFilter -ne "") {
      $vfFilter = "$transposeFilter,fps=$effectiveFps"
    } else {
      $vfFilter = "fps=$effectiveFps"
    }

    & ffmpeg -noautorotate -hide_banner -loglevel error `
        -i $VideoPath `
        -vf $vfFilter `
        -q:v 2 `
        (Join-Path $framesDir "frame_%04d.jpg") *>&1 | ForEach-Object {
      $line = "$_"; Write-Host $line
      Add-Content -Path $logFile -Value $line -Encoding UTF8
    }
    $sw1.Stop()

    if ($LASTEXITCODE -ne 0) { Log "ERRO em ffmpeg (codigo $LASTEXITCODE)"; exit 1 }

    Copy-Item -Path (Join-Path $framesDir "*.jpg") -Destination $colmapImagesDir -Force
    $frameCount = (Get-ChildItem -LiteralPath $colmapImagesDir -Filter "*.jpg").Count
    $elapsed1   = $sw1.Elapsed.TotalSeconds.ToString('F1')
    Log "[1/5] OK - $frameCount frames em $elapsed1 s | fps=$effectiveFps | transpose=$Transpose"

    if ($frameCount -lt 20) {
      Log "AVISO: $frameCount frames e pouco (recomendado >= 60). Use um video mais longo ou aumente -FrameRate."
    }
  } else {
    Log "[1/5] Copiando/rotacionando fotos para colmap_ws/images/ (baseline -SkipFrameSelection)..."
    $sw1 = [Diagnostics.Stopwatch]::StartNew()

    Get-ChildItem -LiteralPath $PhotosPath -File | Where-Object {
      $e = $_.Extension.ToLowerInvariant()
      ($e -eq '.jpg') -or ($e -eq '.jpeg') -or ($e -eq '.png')
    } | Sort-Object Name | ForEach-Object {
      $dest = Join-Path $colmapImagesDir $_.Name
      if ($transposeFilter -ne "") {
        & ffmpeg -noautorotate -hide_banner -loglevel error `
            -i $_.FullName -vf $transposeFilter -q:v 1 $dest *>&1 | Out-Null
      } else {
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
      }
    }
    $sw1.Stop()

    $frameCount = (Get-ChildItem -LiteralPath $colmapImagesDir -File | Where-Object {
      $e = $_.Extension.ToLowerInvariant()
      ($e -eq '.jpg') -or ($e -eq '.jpeg') -or ($e -eq '.png')
    }).Count
    $elapsed1 = $sw1.Elapsed.TotalSeconds.ToString('F1')
    Log "[1/5] OK - $frameCount fotos prontas em $elapsed1 s | transpose=$Transpose"
  }
} else {
  New-Item -ItemType Directory -Force -Path $framesRawDir | Out-Null
  $sw1 = [Diagnostics.Stopwatch]::StartNew()

  if (-not $photoMode) {
    if ($PSBoundParameters.ContainsKey('FrameRate') -and $FrameRate -ne 0) {
      Log "[1/5] AVISO: -FrameRate $FrameRate IGNORADO no modo padrao (sempre 5 fps + frame_selector)."
      Log "[1/5] Para -FrameRate ter efeito, passe tambem -SkipFrameSelection."
      Log "[1/5] Para reduzir frames finais, use -FrameTargetCount N (default 300)."
    }
    Log "[1/5] Extraindo frames a 5 fps -> frames_raw/ ..."
    $durationStr = & ffprobe -v error -show_entries format=duration `
        -of default=noprint_wrappers=1:nokey=1 $VideoPath 2>$null
    $durationSec = [double]::Parse($durationStr, [System.Globalization.CultureInfo]::InvariantCulture)
    $rawEstimate = [math]::Round($durationSec * 5.0)
    Log "[1/5] Video: $([math]::Round($durationSec))s | ~$rawEstimate frames brutos (5 fps) | transpose=$Transpose"

    if ($transposeFilter -ne "") {
      $vfDense = "$transposeFilter,fps=5"
    } else {
      $vfDense = "fps=5"
    }

    & ffmpeg -noautorotate -hide_banner -loglevel error `
        -i $VideoPath `
        -vf $vfDense `
        -q:v 2 `
        (Join-Path $framesRawDir "frame_%05d.jpg") *>&1 | ForEach-Object {
      $line = "$_"; Write-Host $line
      Add-Content -Path $logFile -Value $line -Encoding UTF8
    }

    if ($LASTEXITCODE -ne 0) { Log "ERRO em ffmpeg (codigo $LASTEXITCODE)"; exit 1 }

    $rawCount = (Get-ChildItem -LiteralPath $framesRawDir -File | Where-Object {
      $e = $_.Extension.ToLowerInvariant()
      ($e -eq '.jpg') -or ($e -eq '.jpeg') -or ($e -eq '.png')
    }).Count
    Log "[1/5] frames_raw: $rawCount arquivos"

    Log "[1/5] Selecionando frames (nitidez + pHash + cobertura)..."
    $pyArgs = @(
      $frameSelector,
      "--input-dir", $framesRawDir,
      "--output-dir", $framesDir,
      "--target-count", "$FrameTargetCount",
      "--min-sharpness", "$FrameMinSharpness",
      "--phash-threshold", "$FramePhashThreshold",
      "--keep-first-last",
      "--report", $reportPath,
      "--video-duration-seconds", "$durationSec",
      "--extraction-fps", "5"
    )
    & python @pyArgs
    if ($LASTEXITCODE -ne 0) {
      Log "AVISO: frame_selector falhou (exit $LASTEXITCODE). Fallback: copiando frames_raw -> frames."
      Copy-Item -Path (Join-Path $framesRawDir "*") -Destination $framesDir -Force -ErrorAction SilentlyContinue
    }

    Copy-Item -Path (Join-Path $framesDir "*.jpg") -Destination $colmapImagesDir -Force -ErrorAction SilentlyContinue
    Copy-Item -Path (Join-Path $framesDir "*.jpeg") -Destination $colmapImagesDir -Force -ErrorAction SilentlyContinue
    Copy-Item -Path (Join-Path $framesDir "*.png") -Destination $colmapImagesDir -Force -ErrorAction SilentlyContinue
    $frameCount = (Get-ChildItem -LiteralPath $colmapImagesDir -File | Where-Object {
      $e = $_.Extension.ToLowerInvariant()
      ($e -eq '.jpg') -or ($e -eq '.jpeg') -or ($e -eq '.png')
    }).Count
    $sw1.Stop()
    $elapsed1 = $sw1.Elapsed.TotalSeconds.ToString('F1')
    Log "[1/5] OK - $frameCount frames para COLMAP em $elapsed1 s | alvo selecao: $FrameTargetCount"
    if ($frameCount -lt 20) {
      Log "AVISO: $frameCount frames e pouco (recomendado >= 60)."
    }
  } else {
    Log "[1/5] Copiando/rotacionando fotos -> frames_raw/ ..."
    Get-ChildItem -LiteralPath $PhotosPath -File | Where-Object {
      $e = $_.Extension.ToLowerInvariant()
      ($e -eq '.jpg') -or ($e -eq '.jpeg') -or ($e -eq '.png')
    } | Sort-Object Name | ForEach-Object {
      $dest = Join-Path $framesRawDir $_.Name
      if ($transposeFilter -ne "") {
        & ffmpeg -noautorotate -hide_banner -loglevel error `
            -i $_.FullName -vf $transposeFilter -q:v 1 $dest *>&1 | Out-Null
      } else {
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
      }
    }

    $rawCount = (Get-ChildItem -LiteralPath $framesRawDir -File | Where-Object {
      $e = $_.Extension.ToLowerInvariant()
      ($e -eq '.jpg') -or ($e -eq '.jpeg') -or ($e -eq '.png')
    }).Count
    Log "[1/5] frames_raw: $rawCount fotos"

    $targetPhotos = $rawCount + 50
    Log "[1/5] Selecionando frames (blur apenas; sem pHash dedupe)..."
    $pyArgs = @(
      $frameSelector,
      "--input-dir", $framesRawDir,
      "--output-dir", $framesDir,
      "--target-count", "$targetPhotos",
      "--min-sharpness", "$FrameMinSharpness",
      "--phash-threshold", "$FramePhashThreshold",
      "--keep-first-last",
      "--no-phash-dedupe",
      "--report", $reportPath
    )
    & python @pyArgs
    if ($LASTEXITCODE -ne 0) {
      Log "AVISO: frame_selector falhou (exit $LASTEXITCODE). Fallback: copiando frames_raw -> frames."
      Copy-Item -Path (Join-Path $framesRawDir "*") -Destination $framesDir -Force -ErrorAction SilentlyContinue
    }

    Copy-Item -Path (Join-Path $framesDir "*.jpg") -Destination $colmapImagesDir -Force -ErrorAction SilentlyContinue
    Copy-Item -Path (Join-Path $framesDir "*.jpeg") -Destination $colmapImagesDir -Force -ErrorAction SilentlyContinue
    Copy-Item -Path (Join-Path $framesDir "*.png") -Destination $colmapImagesDir -Force -ErrorAction SilentlyContinue
    $frameCount = (Get-ChildItem -LiteralPath $colmapImagesDir -File | Where-Object {
      $e = $_.Extension.ToLowerInvariant()
      ($e -eq '.jpg') -or ($e -eq '.jpeg') -or ($e -eq '.png')
    }).Count
    $sw1.Stop()
    $elapsed1 = $sw1.Elapsed.TotalSeconds.ToString('F1')
    Log "[1/5] OK - $frameCount fotos para COLMAP em $elapsed1 s"
  }
}

# ─── ETAPA 1.5: SAM2 mascaramento (opcional, P03) ─────────────────────────────
$modelsDir = Join-Path $PSScriptRoot "models"
$samScript  = Join-Path $PSScriptRoot "sam2_masking.py"
$samReport  = Join-Path $OutputDir "sam2_report.json"
$samCkpt    = Join-Path $modelsDir "sam2.1_hiera_large.pt"
$gdCfg      = Join-Path $modelsDir "groundingdino_swint_ogc.py"
$gdWts      = Join-Path $modelsDir "groundingdino_swint_ogc.pth"

if ($EnableSamMasking) {
  Log "[1.5/5] SAM2 - mascaras de objetos moveis (Grounding DINO + SAM2)..."
  New-Item -ItemType Directory -Force -Path $masksDir | Out-Null

  if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Warning "[1.5/5] python nao encontrado - SAM2 ignorado."
  } elseif (-not (Test-Path -LiteralPath $samScript)) {
    Write-Warning "[1.5/5] sam2_masking.py ausente - SAM2 ignorado."
  } elseif (-not (Test-Path -LiteralPath $samCkpt) -or -not (Test-Path -LiteralPath $gdCfg) -or -not (Test-Path -LiteralPath $gdWts)) {
    Write-Warning "[1.5/5] Modelos SAM2/Grounding DINO ausentes em $modelsDir - SAM2 ignorado. Veja README."
  } else {
    $samArgs = @(
      $samScript,
      "--input-dir", $colmapImagesDir,
      "--output-dir", $masksDir,
      "--checkpoint", $samCkpt,
      "--grounding-dino-config", $gdCfg,
      "--grounding-dino-weights", $gdWts,
      "--prompts", "person. dog. cat. tv screen. monitor screen.",
      "--confidence-threshold", "$SamConfidence",
      "--report", $samReport
    )
    & python @samArgs *>&1 | ForEach-Object {
      $line = "$_"
      Write-Host $line
      Add-Content -Path $logFile -Value $line -Encoding UTF8
    }
    $samExit = $LASTEXITCODE
    $maskCount = (Get-ChildItem -LiteralPath $masksDir -Filter "*.png" -ErrorAction SilentlyContinue).Count
    if ($samExit -eq 0 -and (Test-Path -LiteralPath $samReport) -and $maskCount -gt 0) {
      $SamUsed = $true
      try {
        $sr = Get-Content -LiteralPath $samReport -Raw -Encoding UTF8 | ConvertFrom-Json
        Log "  [1.5/5] Frames com objetos: $($sr.frames_with_objects) / $($sr.total_frames) | cobertura media mascara: $([math]::Round($sr.avg_mask_coverage * 100, 2))%"
      } catch {
        Log "  [1.5/5] sam2_report.json gerado ($maskCount mascaras PNG)."
      }
    } else {
      Write-Warning "[1.5/5] SAM2 falhou (exit $samExit) ou sem PNGs - COLMAP segue sem mascaras."
      $SamUsed = $false
    }
  }
} else {
  Log "[1.5/5] SAM2 desligado (use -EnableSamMasking para mascarar pessoas/pets/telas)."
}

# ─── ETAPA 1.7: Redimensionamento defensivo de imagens (anti-VRAM-overflow) ──
$firstImage = Get-ChildItem -LiteralPath $colmapImagesDir -File | Where-Object {
  $e = $_.Extension.ToLowerInvariant()
  ($e -eq '.jpg') -or ($e -eq '.jpeg') -or ($e -eq '.png')
} | Select-Object -First 1

$detectedMaxSide = 0
if ($firstImage) {
  try {
    $dimStr = & ffprobe -v error -select_streams v:0 -show_entries stream=width,height `
        -of csv=s=x:p=0 $firstImage.FullName 2>$null
    if ($dimStr -match '^(\d+)x(\d+)$') {
      $w = [int]$matches[1]
      $h = [int]$matches[2]
      $detectedMaxSide = [math]::Max($w, $h)
      Log "[1.7/5] Resolucao detectada: ${w}x${h} (lado maior: $detectedMaxSide px)"
    }
  } catch {
    Log "[1.7/5] AVISO: ffprobe falhou ao ler resolucao da primeira imagem."
  }
}

if ($MaxImageSize -gt 0) {
  if ($detectedMaxSide -gt 0 -and $detectedMaxSide -le $MaxImageSize) {
    Log "[1.7/5] Imagens ja estao dentro de $MaxImageSize px (lado maior: $detectedMaxSide). Pulando resize."
  } else {
    Log "[1.7/5] Redimensionando imagens para lado maior = $MaxImageSize px (anti-VRAM)..."
    $swResize = [Diagnostics.Stopwatch]::StartNew()
    $scaleFilter = "scale='if(gt(iw,ih),${MaxImageSize},-2)':'if(gt(iw,ih),-2,${MaxImageSize})'"
    $resizeCount = 0
    Get-ChildItem -LiteralPath $colmapImagesDir -File | Where-Object {
      $e = $_.Extension.ToLowerInvariant()
      ($e -eq '.jpg') -or ($e -eq '.jpeg') -or ($e -eq '.png')
    } | ForEach-Object {
      $tmpOut = Join-Path $colmapImagesDir ("__resize_" + $_.Name)
      & ffmpeg -noautorotate -hide_banner -loglevel error `
          -i $_.FullName -vf $scaleFilter -q:v 2 $tmpOut 2>$null
      if (Test-Path -LiteralPath $tmpOut) {
        Move-Item -LiteralPath $tmpOut -Destination $_.FullName -Force
        $resizeCount++
      }
    }
    $swResize.Stop()
    Log "[1.7/5] OK - $resizeCount imagens redimensionadas em $([math]::Round($swResize.Elapsed.TotalSeconds, 1)) s."

    if ($firstImage -and (Test-Path -LiteralPath $firstImage.FullName)) {
      try {
        $dimStr2 = & ffprobe -v error -select_streams v:0 -show_entries stream=width,height `
            -of csv=s=x:p=0 $firstImage.FullName 2>$null
        if ($dimStr2 -match '^(\d+)x(\d+)$') {
          Log "[1.7/5] Nova resolucao: $($matches[1])x$($matches[2]) px (lado maior: $([math]::Max([int]$matches[1], [int]$matches[2])) px)"
        }
      } catch {}
    }
  }
} elseif ($detectedMaxSide -gt 4000) {
  Write-Warning "[1.7/5] Imagens grandes detectadas (lado maior: $detectedMaxSide px)."
  Write-Warning "[1.7/5] Se o COLMAP crashar com STATUS_STACK_BUFFER_OVERRUN ou OOM, rode com -MaxImageSize 2400."
}

# ─── ETAPA 2: SfM ────────────────────────────────────────────────────────────
$sw2 = [Diagnostics.Stopwatch]::StartNew()
$dbPath        = Join-Path $colmapDir "database.db"
$sparseOut     = Join-Path $colmapDir "sparse"
$sparseDir     = Join-Path $sparseOut "0"
$imagesBin     = Join-Path $sparseDir "images.bin"
$UsedMapper       = $null
$UsedFeatures     = $null
$MappingOk        = $false
$RegisteredImages = 0
$HlocOk           = $false

$useManualSfm = $UseHloc -or $UseGlomap -or $SamUsed -or $ForceCpuMatcher
if ($ForceCpuMatcher) {
  Log "[2/5] -ForceCpuMatcher ativo: pipeline manual com SIFT GPU extractor + CPU matcher (estavel mas mais lento)."
}

if ($useManualSfm) {
  Remove-Item -LiteralPath $dbPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $sparseOut -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $sparseOut | Out-Null

  if ($UseHloc) {
    Log "[2/5] (a+b) Features+matches via hloc (SuperPoint + LightGlue, P05)..."
    $repoRootForVenv = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    $hlocVenvPython  = Join-Path $repoRootForVenv ".venv-hloc\Scripts\python.exe"
    if (Test-Path -LiteralPath $hlocVenvPython) {
      $hlocPython = $hlocVenvPython
      Log "  Usando python do .venv-hloc: $hlocPython"
    } elseif (Get-Command python -ErrorAction SilentlyContinue) {
      $hlocPython = "python"
      Log "  .venv-hloc nao encontrado; usando python global do PATH."
    } else {
      $hlocPython = $null
      Write-Warning "  python nao encontrado. Fallback para COLMAP SIFT."
    }

    if ($hlocPython) {
      $hlocScript    = Join-Path $PSScriptRoot "hloc_features.py"
      $hlocExportDir = Join-Path $OutputDir "hloc"
      $hlocReport    = Join-Path $OutputDir "hloc_report.json"
      if (-not (Test-Path -LiteralPath $hlocScript)) {
        Write-Warning "  hloc_features.py ausente. Fallback para COLMAP SIFT."
      } else {
        $hlocArgs = @(
          $hlocScript,
          "--image-dir", $colmapImagesDir,
          "--database-path", $dbPath,
          "--export-dir", $hlocExportDir,
          "--max-image-size", "$HlocMaxImageSize",
          "--num-pairs-per-image", "$HlocPairsPerImage",
          "--max-keypoints", "$HlocMaxKeypoints",
          "--device", "cuda",
          "--report", $hlocReport
        )
        if ($SamUsed) { $hlocArgs += @("--mask-dir", $masksDir) }
        $swHloc = [Diagnostics.Stopwatch]::StartNew()
        & $hlocPython @hlocArgs *>&1 | ForEach-Object {
          $line = "$_"; Write-Host $line
          Add-Content -Path $logFile -Value $line -Encoding UTF8
        }
        $hlocExit = $LASTEXITCODE
        $swHloc.Stop()
        if ($hlocExit -eq 0 -and (Test-Path -LiteralPath $dbPath)) {
          $HlocOk       = $true
          $UsedFeatures = "hloc_superpoint_lightglue"
          Log "  hloc OK em $([math]::Round($swHloc.Elapsed.TotalSeconds, 1)) s"
        } else {
          Write-Warning "[2/5] hloc FALHOU (exit=$hlocExit). Fallback para COLMAP SIFT."
          Remove-Item -LiteralPath $dbPath -Force -ErrorAction SilentlyContinue
        }
      }
    }
  }

  if (-not $HlocOk) {
    Log "[2/5] (a) Feature extraction (COLMAP SIFT, GPU)..."
    $featureArgs = @(
      "feature_extractor",
      "--database_path", $dbPath,
      "--image_path", $colmapImagesDir,
      "--ImageReader.single_camera", "1",
      "--SiftExtraction.use_gpu", "1"
    )
    if ($SamUsed) { $featureArgs += @("--ImageReader.mask_path", $masksDir) }
    & colmap @featureArgs *>&1 | ForEach-Object {
      $line = "$_"; Write-Host $line
      Add-Content -Path $logFile -Value $line -Encoding UTF8
    }
    if ($LASTEXITCODE -ne 0) { Log "ERRO em colmap feature_extractor (codigo $LASTEXITCODE)"; exit 1 }

    $matcherGpuFlag = if ($ForceCpuMatcher) { "0" } else { "1" }
    $matcherLabel   = if ($ForceCpuMatcher) { "CPU (forced)" } else { "GPU" }
    Log "[2/5] (b) Sequential matching ($matcherLabel)..."
    & colmap sequential_matcher `
        --database_path $dbPath `
        --SiftMatching.use_gpu $matcherGpuFlag *>&1 | ForEach-Object {
      $line = "$_"; Write-Host $line
      Add-Content -Path $logFile -Value $line -Encoding UTF8
    }
    if ($LASTEXITCODE -ne 0) { Log "ERRO em colmap sequential_matcher (codigo $LASTEXITCODE)"; exit 1 }
    $UsedFeatures = "colmap_sift"
  }

  if ($UseGlomap) {
    Log "[2/5] (c) Mapping com GLOMAP (global SfM)..."
    $swGlomap = [Diagnostics.Stopwatch]::StartNew()
    & glomap mapper `
        --database_path $dbPath `
        --image_path    $colmapImagesDir `
        --output_path   $sparseOut *>&1 | ForEach-Object {
      $line = "$_"; Write-Host $line
      Add-Content -Path $logFile -Value $line -Encoding UTF8
    }
    $glomapExit = $LASTEXITCODE
    $swGlomap.Stop()

    if ($glomapExit -eq 0 -and (Test-Path -LiteralPath $imagesBin)) {
      $regCount  = Get-RegisteredImagesCount -ImagesBinPath $imagesBin
      $regRatio0 = if ($frameCount -gt 0) { [math]::Round($regCount / $frameCount, 4) } else { 0 }
      Log "[2/5] (c) GLOMAP OK em $([math]::Round($swGlomap.Elapsed.TotalSeconds, 1)) s | registrados: $regCount/$frameCount ($([math]::Round($regRatio0 * 100, 1))%)"
      if ($regRatio0 -lt 0.70 -and $regCount -gt 0) {
        Write-Warning "[2/5] Registration ratio < 70%. Fallback para COLMAP mapper."
      } else {
        $MappingOk        = $true
        $UsedMapper       = "glomap"
        $RegisteredImages = $regCount
      }
    } else {
      Write-Warning "[2/5] GLOMAP falhou. Fallback para COLMAP mapper."
    }

    if (-not $MappingOk) {
      Log "[2/5] (c') Fallback: COLMAP mapper (incremental)..."
      Remove-Item -LiteralPath $sparseOut -Recurse -Force -ErrorAction SilentlyContinue
      New-Item -ItemType Directory -Force -Path $sparseOut | Out-Null
      $swColmapMap = [Diagnostics.Stopwatch]::StartNew()
      & colmap mapper `
          --database_path $dbPath `
          --image_path    $colmapImagesDir `
          --output_path   $sparseOut *>&1 | ForEach-Object {
        $line = "$_"; Write-Host $line
        Add-Content -Path $logFile -Value $line -Encoding UTF8
      }
      if ($LASTEXITCODE -ne 0) { Log "ERRO em colmap mapper (codigo $LASTEXITCODE)"; exit 1 }
      $RegisteredImages = Get-RegisteredImagesCount -ImagesBinPath $imagesBin
      $MappingOk        = $true
      $UsedMapper       = "colmap_mapper_fallback"
      Log "[2/5] (c') COLMAP mapper OK em $([math]::Round($swColmapMap.Elapsed.TotalSeconds, 1)) s | registrados: $RegisteredImages/$frameCount"
    }
  } else {
    Log "[2/5] (c) Mapping com COLMAP (incremental)..."
    & colmap mapper `
        --database_path $dbPath `
        --image_path    $colmapImagesDir `
        --output_path   $sparseOut *>&1 | ForEach-Object {
      $line = "$_"; Write-Host $line
      Add-Content -Path $logFile -Value $line -Encoding UTF8
    }
    if ($LASTEXITCODE -ne 0) { Log "ERRO em colmap mapper (codigo $LASTEXITCODE)"; exit 1 }
    if ($HlocOk -and $SamUsed)    { $UsedMapper = "colmap_mapper_hloc_sam2" }
    elseif ($HlocOk)              { $UsedMapper = "colmap_mapper_hloc" }
    elseif ($SamUsed)             { $UsedMapper = "colmap_mapper_sam2" }
    elseif ($ForceCpuMatcher)     { $UsedMapper = "colmap_mapper_force_cpu" }
    else                          { $UsedMapper = "colmap_mapper" }
    $RegisteredImages = Get-RegisteredImagesCount -ImagesBinPath $imagesBin
  }
} else {
  Log "[2/5] COLMAP SfM sparse (automatic_reconstructor, --data_type video)..."
  & colmap automatic_reconstructor `
      --image_path     $colmapImagesDir `
      --workspace_path $colmapDir `
      --use_gpu        1 `
      --single_camera  1 `
      --dense          0 `
      --data_type      video `
      --quality        $Quality *>&1 | ForEach-Object {
    $line = "$_"; Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
  }
  if ($LASTEXITCODE -ne 0) { Log "ERRO em COLMAP (codigo $LASTEXITCODE)"; exit 1 }
  $UsedMapper       = "colmap_automatic_reconstructor"
  $UsedFeatures     = "colmap_sift"
  $RegisteredImages = Get-RegisteredImagesCount -ImagesBinPath $imagesBin
}
$sw2.Stop()

# Auto-pick maior componente
$LargestComponentSelected = $false
$DroppedComponents        = @()
$allSparse = Get-ChildItem -Path $sparseOut -Directory -ErrorAction SilentlyContinue |
             Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "images.bin") }
if ($allSparse.Count -gt 1) {
  $sparseSizes = $allSparse | ForEach-Object {
    [PSCustomObject]@{
      Name        = $_.Name
      Path        = $_.FullName
      ImagesBytes = (Get-Item -LiteralPath (Join-Path $_.FullName "images.bin")).Length
    }
  } | Sort-Object ImagesBytes -Descending

  $largest = $sparseSizes[0]
  Log "[2/5] SfM fragmentou em $($allSparse.Count) componentes:"
  foreach ($s in $sparseSizes) {
    Log ("       sparse/{0,-3} images.bin={1,8:N1} KB" -f $s.Name, ($s.ImagesBytes / 1KB))
  }

  if ($largest.Name -ne "0") {
    $dropped = Join-Path $sparseOut "0_dropped"
    if (Test-Path -LiteralPath $dropped) { Remove-Item -Recurse -Force -LiteralPath $dropped }
    Rename-Item -LiteralPath (Join-Path $sparseOut "0") -NewName "0_dropped"
    Rename-Item -LiteralPath $largest.Path -NewName "0"
    Log "[2/5] Auto-pick: sparse/$($largest.Name) -> sparse/0."
    $LargestComponentSelected = $true
    $DroppedComponents = @($sparseSizes | Where-Object { $_.Name -ne $largest.Name } | ForEach-Object { $_.Name })
    $RegisteredImages = Get-RegisteredImagesCount -ImagesBinPath $imagesBin
  } else {
    Log "[2/5] Auto-pick: sparse/0 ja e o maior componente."
  }
}

# ─── STRICT SFM QUALITY GUARD (P-NEW) ──────────────────────────────────────
# Aborta se: (a) SfM fragmentou em multiplos componentes, OU
#           (b) registration_ratio < threshold (default 0.95)
# Motivo: sparse pobre vira semente ruim no Brush. Treino de 60-75min sobre
# semente ruim NUNCA recupera - apenas drena GPU. Evidencia: Run C deste
# projeto treinou 75k steps e congelou em 29k gaussianos.
if ($StrictSfmQuality) {
  $fragmented   = ($allSparse.Count -gt 1)
  $tempRatio    = if ($frameCount -gt 0) { [math]::Round($RegisteredImages / $frameCount, 4) } else { 0 }
  $belowMin     = ($tempRatio -lt $StrictSfmMinRegistration)
  if ($fragmented -or $belowMin) {
    $thrPct = [math]::Round($StrictSfmMinRegistration * 100, 1)
    Log "[2/5] STRICT-SFM ABORT: fragmented=$fragmented | registration=$([math]::Round($tempRatio * 100, 1))% (min=$thrPct%)"
    Log "[2/5] Motivo: SfM ruim NUNCA e corrigido pelo Brush. Refaca a captura ou rode sem -StrictSfmQuality."
    exit 3
  }
  Log "[2/5] STRICT-SFM OK: 1 componente, registration=$([math]::Round($tempRatio * 100, 1))% (>= $([math]::Round($StrictSfmMinRegistration * 100, 1))%)"
}
# ─────────────────────────────────────────────────────────────────────────────

if (-not (Test-Path -LiteralPath $sparseDir)) {
  Log "ERRO: SfM nao gerou sparse/0/. Mapper: $UsedMapper. Veja: $logFile"
  exit 1
}

$elapsed2   = $sw2.Elapsed.TotalMinutes.ToString('F1')
$mappingSec = [math]::Round($sw2.Elapsed.TotalSeconds, 2)
$regRatio   = if ($frameCount -gt 0) { [math]::Round($RegisteredImages / $frameCount, 4) } else { 0 }
$regPct     = [math]::Round($regRatio * 100, 1)
Log "[2/5] OK - SfM em $elapsed2 min | features=$UsedFeatures | mapper=$UsedMapper | registrados $RegisteredImages/$frameCount ($regPct%)"

$LowRegistrationWarning = $false
if ($regRatio -gt 0 -and $regRatio -lt 0.70) {
  $hint = if ($UseHloc) { "considere refazer a captura" } else { "considere refazer a captura ou usar -UseHloc" }
  Write-Warning "[2/5] Apenas $regPct% dos frames registrados (recomendado >= 70%). $hint."
  $LowRegistrationWarning = $true
}

if ($regRatio -gt 0 -and $regRatio -lt $LowRegistrationThreshold) {
  $thrPct = [math]::Round($LowRegistrationThreshold * 100, 0)
  if ($AbortOnLowRegistration) {
    Write-Warning "[2/5] REGISTRO CRITICAMENTE BAIXO: $regPct% (< $thrPct%). Abortando."
    Log "[2/5] ABORTADO por baixa taxa de registro ($regPct% < $thrPct%)."
    exit 2
  } else {
    Write-Warning "[2/5] REGISTRO CRITICAMENTE BAIXO: $regPct% (< $thrPct%). Continuando."
  }
}

$mappingReport = [ordered]@{
  features_used               = $UsedFeatures
  mapper_used                 = $UsedMapper
  mapping_seconds             = $mappingSec
  registered_images           = [int]$RegisteredImages
  total_frames                = [int]$frameCount
  registration_ratio          = [double]$regRatio
  low_registration_warning    = [bool]$LowRegistrationWarning
  low_registration_threshold  = [double]$LowRegistrationThreshold
  sparse_path                 = $sparseDir
  largest_component_selected  = [bool]$LargestComponentSelected
  dropped_sparse_components   = $DroppedComponents
  glomap_available            = [bool]$GlomapAvailable
  force_colmap_mapper         = [bool]$ForceColmapMapper
  use_hloc                    = [bool]$UseHloc
  hloc_ok                     = [bool]$HlocOk
  sam_used                    = [bool]$SamUsed
}
$mappingReportPath = Join-Path $OutputDir "mapping_report.json"
$mappingReport | ConvertTo-Json -Depth 4 | Out-File -LiteralPath $mappingReportPath -Encoding utf8
Log "[2/5] mapping_report.json gravado em $mappingReportPath"

# ─── ETAPA 3.5: Loop closure (P02) ───────────────────────────────────────────
$loopValidator = Join-Path $PSScriptRoot "loop_closure_validator.py"
$loopReport    = Join-Path $OutputDir "loop_closure_report.json"
$imagesBinPath = Join-Path $sparseDir "images.bin"

if (
  (Test-Path -LiteralPath $loopValidator) -and
  (Test-Path -LiteralPath $imagesBinPath) -and
  (Get-Command python -ErrorAction SilentlyContinue)
) {
  Log "[3.5/5] Validando loop closure..."
  $loopArgs = @($loopValidator, "--colmap-sparse", $sparseDir, "--report", $loopReport)
  if ($LoopClosureStrict) { $loopArgs += "--strict" }
  & python @loopArgs *>&1 | ForEach-Object {
    $line = "$_"; Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
  }
  $loopExit = $LASTEXITCODE
  if (Test-Path -LiteralPath $loopReport) {
    try {
      $loop = Get-Content -LiteralPath $loopReport -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($loop.status -eq "warning") {
        Write-Warning "  $($loop.message)"
        Write-Warning "  Considere refazer a captura fechando o loop fisicamente."
      } else {
        Write-Host "  $($loop.message)" -ForegroundColor Green
      }
    } catch { Log "AVISO [3.5/5]: nao foi possivel ler loop_closure_report.json." }
  }
  if ($loopExit -ne 0) { Log "AVISO [3.5/5] loop_closure_validator exit $loopExit." }
} else {
  Log "[3.5/5] Pulado (python, images.bin ou loop_closure_validator.py ausente)."
}

# ─── EARLY EXIT: -SkipTraining (AI Advisor) ──────────────────────────────────
# Quando ativo, o advisor consulta mapping_report.json e loop_closure_report.json
# antes de decidir se vale a pena gastar 30-40 min no Brush.
if ($SkipTraining) {
  Log "=== SfM CONCLUIDO (SkipTraining): Brush e upload pulados ==="
  Log "=== Verifique mapping_report.json e loop_closure_report.json antes de prosseguir ==="
  exit 0
}
# ─────────────────────────────────────────────────────────────────────────────

# ─── ETAPA 3: Trainer 3DGS (P06: Brush default; -Trainer mipsplatting alt) ───
Log "[3/5] Trainer = $Trainer"
$sw3 = [Diagnostics.Stopwatch]::StartNew()
$finalPly = $null
$plyMb    = 0

switch ($Trainer) {
  'brush' {
    $effBrushSteps = if ($TrainerIterations -gt 0) { $TrainerIterations } else { $TotalSteps }
    Log "[3/5] Brush (treino $effBrushSteps steps + export .ply)..."

    if ($KillSwitchEnabled) {
      # --- KILL SWITCH MODE (Fase 2) -----------------------------------------
      # Roda brush_app como processo filho monitoravel e um watcher paralelo
      # que mata o processo se detectar congelamento via exports intermediarios.
      Log "[3/5] KILL-SWITCH ATIVO: check a cada $KillSwitchCheckEverySec s | min_15k=$KillSwitchMinGaussians15k | stall_tolerance=$KillSwitchStallTolerance"

      $brushStdout = Join-Path $splatDir "_brush_stdout.log"
      $brushStderr = Join-Path $splatDir "_brush_stderr.log"
      Remove-Item -LiteralPath $brushStdout -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $brushStderr -Force -ErrorAction SilentlyContinue

      $brushProc = Start-Process -FilePath "brush_app" `
          -ArgumentList @($colmapDir, "--total-steps", $effBrushSteps, "--export-path", $splatDir, "--max-resolution", "1920") `
          -NoNewWindow -PassThru `
          -RedirectStandardOutput $brushStdout `
          -RedirectStandardError  $brushStderr

      Log "[3/5] brush_app PID=$($brushProc.Id) iniciado. Watcher entra em loop."

      $stallCount        = 0
      $lastVertexCount   = 0
      $lastExportChecked = ""
      $killReason        = $null
      $watcherIterations = 0

      while (-not $brushProc.HasExited) {
        Start-Sleep -Seconds $KillSwitchCheckEverySec
        $watcherIterations++

        # Lista exports atuais ordenados por numero do step
        $exports = Get-ChildItem -LiteralPath $splatDir -Filter "export_*.ply" -ErrorAction SilentlyContinue |
                   Sort-Object Name
        if (-not $exports -or $exports.Count -eq 0) {
          Log "  [watcher #$watcherIterations] Sem exports ainda. Aguardando."
          continue
        }

        $latest = $exports | Select-Object -Last 1
        if ($latest.FullName -eq $lastExportChecked) {
          # Mesmo arquivo da iteracao anterior - nada novo escrito ainda
          continue
        }
        $lastExportChecked = $latest.FullName

        # Extrai step do nome (export_15000.ply -> 15000)
        $stepNum = 0
        if ($latest.Name -match 'export_(\d+)\.ply') { $stepNum = [int]$matches[1] }

        $currentN = Get-PlyVertexCount -PlyPath $latest.FullName
        Log "  [watcher #$watcherIterations] step=$stepNum gaussianos=$currentN (anterior=$lastVertexCount)"

        # Trava 1: aos 15k, exigir >= KillSwitchMinGaussians15k
        if ($stepNum -ge 15000 -and $currentN -gt 0 -and $currentN -lt $KillSwitchMinGaussians15k) {
          $killReason = "step_15k_below_min: $currentN < $KillSwitchMinGaussians15k"
          break
        }

        # Trava 2: stall - exports consecutivos sem crescimento > stall_min_growth_pct
        if ($lastVertexCount -gt 0 -and $currentN -gt 0) {
          $growthPct = (($currentN - $lastVertexCount) / [double]$lastVertexCount) * 100.0
          if ($growthPct -lt $KillSwitchStallMinGrowthPct) {
            $stallCount++
            Log "  [watcher #$watcherIterations] STALL detectado ($stallCount/$KillSwitchStallTolerance): crescimento=$([math]::Round($growthPct, 2))%"
            if ($stallCount -ge $KillSwitchStallTolerance) {
              $killReason = "stall: $stallCount exports consecutivos com crescimento < $KillSwitchStallMinGrowthPct% (ultimo=$currentN gaussianos)"
              break
            }
          } else {
            $stallCount = 0
          }
        }

        $lastVertexCount = $currentN
      }

      if ($killReason) {
        Log "[3/5] KILL SWITCH DISPARADO: $killReason"
        Log "[3/5] Matando brush_app (PID=$($brushProc.Id))..."
        try {
          Stop-Process -Id $brushProc.Id -Force -ErrorAction Stop
          Start-Sleep -Seconds 2
          Log "[3/5] brush_app terminado pelo watcher."
        } catch {
          Log "[3/5] AVISO: falha ao matar brush_app ($($_.Exception.Message))"
        }
        # Concatena stdout/stderr do brush no log principal antes de sair
        if (Test-Path -LiteralPath $brushStdout) {
          Get-Content -LiteralPath $brushStdout -ErrorAction SilentlyContinue |
            ForEach-Object { Add-Content -Path $logFile -Value $_ -Encoding UTF8 }
        }
        if (Test-Path -LiteralPath $brushStderr) {
          Get-Content -LiteralPath $brushStderr -ErrorAction SilentlyContinue |
            ForEach-Object { Add-Content -Path $logFile -Value $_ -Encoding UTF8 }
        }
        Log "[3/5] Recomendacao: SfM produziu semente pobre. Refaca a captura ou use -StrictSfmQuality."
        exit 5
      }

      # Brush terminou naturalmente - concatena logs e checa exit code
      if (Test-Path -LiteralPath $brushStdout) {
        Get-Content -LiteralPath $brushStdout -ErrorAction SilentlyContinue |
          ForEach-Object { Add-Content -Path $logFile -Value $_ -Encoding UTF8 }
      }
      if (Test-Path -LiteralPath $brushStderr) {
        Get-Content -LiteralPath $brushStderr -ErrorAction SilentlyContinue |
          ForEach-Object { Add-Content -Path $logFile -Value $_ -Encoding UTF8 }
      }
      if ($brushProc.ExitCode -ne 0) {
        Log "ERRO em brush_app (codigo $($brushProc.ExitCode))"
        exit 1
      }
      Log "[3/5] brush_app terminou naturalmente. Watcher fez $watcherIterations checks."

    } else {
      # --- MODO ORIGINAL (sem kill switch) -----------------------------------
      & brush_app $colmapDir `
          --total-steps    $effBrushSteps `
          --export-path    $splatDir `
          --max-resolution 1920 *>&1 | ForEach-Object {
        $line = "$_"; Write-Host $line
        Add-Content -Path $logFile -Value $line -Encoding UTF8
      }
      if ($LASTEXITCODE -ne 0) { Log "ERRO em brush_app (codigo $LASTEXITCODE)"; exit 1 }
    }
    $lastPly = Get-ChildItem -LiteralPath $splatDir -Filter "export_*.ply" |
               Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $lastPly) { Log "ERRO: Nenhum export_*.ply em $splatDir"; exit 1 }
    # ─── MID-TRAINING GROWTH CHECK (P-NEW) ──────────────────────────────────
    # Valida que o Brush densificou o suficiente ate o step 15k.
    # Se export_15000.ply tem < MinGaussians15k gaussianos, a semente do SfM
    # era pobre e steps adicionais nao recuperam. Marca o run como suspeito.
    if ($ValidateMidTrainingGrowth) {
      $mid15kPly = Join-Path $splatDir "export_15000.ply"
      if (Test-Path -LiteralPath $mid15kPly) {
        $midN = 0
        try {
          $fs = [System.IO.File]::OpenRead($mid15kPly)
          try {
            $reader = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $headerText = ""
            $linesRead = 0
            while (-not $reader.EndOfStream -and $linesRead -lt 60) {
              $hline = $reader.ReadLine()
              $headerText += "$hline`n"
              if ($hline -match '^element\s+vertex\s+(\d+)') { $midN = [int]$matches[1] }
              if ($hline -eq 'end_header') { break }
              $linesRead++
            }
            $reader.Dispose()
          } finally { $fs.Close() }
        } catch { Log "  [AVISO] Falha ao ler header de export_15000.ply ($($_.Exception.Message))" }

        if ($midN -gt 0 -and $midN -lt $MinGaussians15k) {
          Log "[3/5] GROWTH-CHECK FALHOU: export_15000.ply tem $midN gaussianos (< $MinGaussians15k)."
          Log "[3/5] Causa provavel: SfM produziu sparse pobre. Steps adicionais NAO corrigem isso."
          Log "[3/5] Recomendacao: refaca a captura ou rode com -StrictSfmQuality para detectar antes do treino."
          exit 4
        } elseif ($midN -gt 0) {
          Log "[3/5] GROWTH-CHECK OK: export_15000.ply tem $midN gaussianos (>= $MinGaussians15k)."
        } else {
          Log "[3/5] GROWTH-CHECK SKIP: nao consegui ler vertex count de export_15000.ply."
        }
      } else {
        Log "[3/5] GROWTH-CHECK SKIP: export_15000.ply nao existe (steps < 15000 ou Brush nao exportou intermediarios)."
      }
    }
    # ─────────────────────────────────────────────────────────────────────────
    $finalPly = Join-Path $splatDir "scene.ply"
    Copy-Item -LiteralPath $lastPly.FullName -Destination $finalPly -Force
    $plyMb    = [math]::Round($lastPly.Length / 1MB, 1)
  }

  'mipsplatting' {
    $effMipIter = if ($TrainerIterations -gt 0) { $TrainerIterations } else { 30000 }
    Log "[3/5] Mip-Splatting (treino $effMipIter iterations + export .ply)..."
    if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
      Log "ERRO [3/5]: python nao encontrado."; exit 1
    }
    $mipScript = Join-Path $PSScriptRoot "run_mipsplatting.py"
    if (-not (Test-Path -LiteralPath $mipScript)) {
      Log "ERRO [3/5]: run_mipsplatting.py nao encontrado."; exit 1
    }
    $mipModelDir = Join-Path $OutputDir "mipsplatting"
    $mipReport   = Join-Path $OutputDir "mipsplatting_report.json"
    New-Item -ItemType Directory -Force -Path $mipModelDir | Out-Null
    & python $mipScript `
        --source-path  $colmapDir `
        --model-path   $mipModelDir `
        --iterations   $effMipIter `
        --resolution   $MipResolution `
        --kernel-size  0.1 `
        --sh-degree    0 `
        --report       $mipReport *>&1 | ForEach-Object {
      $line = "$_"; Write-Host $line
      Add-Content -Path $logFile -Value $line -Encoding UTF8
    }
    if ($LASTEXITCODE -ne 0) { Log "ERRO [3/5]: Mip-Splatting falhou (codigo $LASTEXITCODE)."; exit 1 }
    $mipFinalPly = Join-Path $mipModelDir "point_cloud\iteration_$effMipIter\point_cloud.ply"
    if (-not (Test-Path -LiteralPath $mipFinalPly)) {
      $cands = Get-ChildItem -LiteralPath $mipModelDir -Recurse -Filter "point_cloud.ply" -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending
      if ($cands -and $cands.Count -gt 0) { $mipFinalPly = $cands[0].FullName }
    }
    if (-not (Test-Path -LiteralPath $mipFinalPly)) { Log "ERRO [3/5]: .ply final nao encontrado."; exit 1 }
    $finalPly = Join-Path $splatDir "scene.ply"
    Copy-Item -LiteralPath $mipFinalPly -Destination $finalPly -Force
    $plyMb    = [math]::Round((Get-Item -LiteralPath $finalPly).Length / 1MB, 1)
  }

  default {
    Log "ERRO [3/5]: -Trainer '$Trainer' nao suportado."; exit 1
  }
}

$sw3.Stop()
$elapsed3 = $sw3.Elapsed.TotalMinutes.ToString('F1')
Log "[3/5] OK - Treino ($Trainer) em $elapsed3 min | PLY: $finalPly ($plyMb MB)"

# ─── ETAPA 3.7: LightGaussian Pruning (P07) ──────────────────────────────────
if ($EnablePruning) {
  $sw37 = [Diagnostics.Stopwatch]::StartNew()
  Log "[3.7/5] LightGaussian Pruning (ratio=$PruneRatio)..."
  $pruneScript = Join-Path $PSScriptRoot "prune_gaussians.py"
  $prunedPly   = Join-Path $splatDir "scene_pruned.ply"
  $pruneReport = Join-Path $OutputDir "prune_report.json"
  $colmapSparseDir = Join-Path $colmapDir "sparse\0"
  $pruneOk = $true
  if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) { $pruneOk = $false; Log "AVISO [3.7/5]: python ausente." }
  elseif (-not (Test-Path -LiteralPath $pruneScript)) { $pruneOk = $false; Log "AVISO [3.7/5]: prune_gaussians.py ausente." }
  elseif (-not (Test-Path -LiteralPath $colmapSparseDir)) { $pruneOk = $false; Log "AVISO [3.7/5]: sparse/0/ ausente." }
  if ($pruneOk) {
    $pruneArgs = @($pruneScript,"--ply",$finalPly,"--output",$prunedPly,"--colmap-sparse",$colmapSparseDir,"--prune-ratio",([string]$PruneRatio),"--report",$pruneReport)
    if ($EnableQuantization.IsPresent) { $pruneArgs += "--quantize" }
    if ($PruneViewSample -gt 0) { $pruneArgs += @("--view-sample",([string]$PruneViewSample)) }
    & python @pruneArgs *>&1 | ForEach-Object { $line = "$_"; Write-Host $line; Add-Content -Path $logFile -Value $line -Encoding UTF8 }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $prunedPly)) {
      Log "AVISO [3.7/5]: pruning falhou; usando .ply original."
    } else {
      $prunedSizeMb = [math]::Round((Get-Item -LiteralPath $prunedPly).Length / 1MB, 1)
      Log "[3.7/5] OK - PLY pruned: $prunedPly ($prunedSizeMb MB)"
      $finalPly = $prunedPly
      $plyMb    = $prunedSizeMb
    }
  }
  $sw37.Stop()
}

# ─── ETAPA 4.6: scene.yup.ply (P10) ─────────────────────────────────────────
if ($GenerateYupPly) {
  $rotateScript = Join-Path $PSScriptRoot "rotate_ply_yup.py"
  $yupPly       = Join-Path $splatDir "scene.yup.ply"
  $yupReport    = Join-Path $OutputDir "rotate_yup_report.json"
  if ((Get-Command "python" -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $rotateScript)) {
    Log "[4.6/5] Gerando scene.yup.ply..."
    & python $rotateScript --input $finalPly --output $yupPly --report $yupReport *>&1 | ForEach-Object { $line = "$_"; Write-Host $line; Add-Content -Path $logFile -Value $line -Encoding UTF8 }
    if ((Test-Path -LiteralPath $yupPly)) { Log "[4.6/5] OK - scene.yup.ply ($([math]::Round((Get-Item -LiteralPath $yupPly).Length / 1MB, 1)) MB)" }
  } else { Log "AVISO [4.6/5]: python ou rotate_ply_yup.py ausente." }
}

# ─── ETAPA 4.7: Reordenacao (P08) ────────────────────────────────────────────
if ($EnableReorder -or $EnablePruning) {
  $reorderScript = Join-Path $PSScriptRoot "reorder_ply.py"
  $reorderedPly  = Join-Path $splatDir "scene_reordered.ply"
  $reorderReport = Join-Path $OutputDir "reorder_report.json"
  if ((Get-Command "python" -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $reorderScript)) {
    Log "[4.7/5] Reordenacao PLY por importancia (P08)..."
    & python $reorderScript --input $finalPly --output $reorderedPly --report $reorderReport *>&1 | ForEach-Object { $line = "$_"; Write-Host $line; Add-Content -Path $logFile -Value $line -Encoding UTF8 }
    if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $reorderedPly)) {
      $finalPly = $reorderedPly
      $plyMb    = [math]::Round((Get-Item -LiteralPath $finalPly).Length / 1MB, 1)
      Log "[4.7/5] OK - $finalPly ($plyMb MB)"
    } else { Log "AVISO [4.7/5]: reorder falhou; usando .ply anterior." }
  } else { Log "AVISO [4.7/5]: python ou reorder_ply.py ausente." }
}

# ─── ETAPA 4: Compressao .ksplat ─────────────────────────────────────────────
$sw4 = $null
$repoRoot     = (Resolve-Path (Join-Path $PSScriptRoot "..\.." )).Path
$ksplatScript = Join-Path $repoRoot "tools\gs3d-source\util\create-ksplat.js"

if (-not (Test-Path -LiteralPath $ksplatScript)) {
  Log "AVISO [4/5]: create-ksplat.js nao encontrado - pulando compressao .ksplat."
} elseif (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
  Log "AVISO [4/5]: node nao encontrado no PATH - pulando compressao .ksplat."
} else {
  Log "[4/5] Compressao .ksplat (compressionLevel=1, alphaThreshold=5, SH=0)..."
  $sw4         = [Diagnostics.Stopwatch]::StartNew()
  $finalKsplat = Join-Path $splatDir "scene.ksplat"
  & node $ksplatScript $finalPly $finalKsplat 1 5 "0,0,0" 5.0 256 0 *>&1 | ForEach-Object {
    $line = "$_"; Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
  }
  $ksplatExit = $LASTEXITCODE
  if ($ksplatExit -ne 0) {
    Log "AVISO [4/5]: create-ksplat.js falhou - pipeline mantem scene.ply."
  } elseif (-not (Test-Path -LiteralPath $finalKsplat)) {
    Log "AVISO [4/5]: scene.ksplat nao gerado."
  } else {
    $ksplatMb = [math]::Round((Get-Item -LiteralPath $finalKsplat).Length / 1MB, 1)
    $ratio    = [math]::Round(($ksplatMb / $plyMb) * 100, 1)
    $elapsed4 = $sw4.Elapsed.TotalSeconds.ToString('F1')
    Log "[4/5] OK - .ksplat: $finalKsplat ($ksplatMb MB, $ratio% do .ply) em $elapsed4 s"

    if ($GenerateLiteKsplat.IsPresent -and (Get-Command "python" -ErrorAction SilentlyContinue)) {
      $makeLiteScript = Join-Path $PSScriptRoot "make_lite_ply.py"
      $litePly        = Join-Path $splatDir "scene_lite.ply"
      $liteKsplat     = Join-Path $splatDir "scene.lite.ksplat"
      if (Test-Path -LiteralPath $makeLiteScript) {
        Log "[4b/5] Lite .ksplat (ratio=$LiteKsplatRatio)..."
        & python $makeLiteScript --input $finalPly --output $litePly --ratio $LiteKsplatRatio *>&1 | ForEach-Object { $line = "$_"; Write-Host $line; Add-Content -Path $logFile -Value $line -Encoding UTF8 }
        if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $litePly)) {
          & node $ksplatScript $litePly $liteKsplat 1 5 "0,0,0" 5.0 256 0 *>&1 | ForEach-Object { $line = "$_"; Write-Host $line; Add-Content -Path $logFile -Value $line -Encoding UTF8 }
          if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $liteKsplat)) {
            Log "[4b/5] OK - scene.lite.ksplat ($([math]::Round((Get-Item -LiteralPath $liteKsplat).Length / 1MB, 2)) MB)"
          }
        }
      }
    }
  }
  $sw4.Stop()
}

# ─── ETAPA 5: Upload ──────────────────────────────────────────────────────────
$sw5 = $null
if (-not [string]::IsNullOrWhiteSpace($TourId) -and -not $SkipUpload) {
  $finalKsplatPath = Join-Path $splatDir "scene.ksplat"
  $splatToUpload   = if (Test-Path -LiteralPath $finalKsplatPath) { $finalKsplatPath } else { $finalPly }
  if (-not (Test-Path -LiteralPath $splatToUpload)) {
    Log "AVISO [5/5]: nenhum splat para upload - pulando."
  } else {
    Log "[5/5] Upload R2 + finalize (tour $TourId via $ApiBaseUrl)..."
    $sw5          = [Diagnostics.Stopwatch]::StartNew()
    $uploadScript = Join-Path $PSScriptRoot "upload-and-finalize.mjs"
    $litePath     = Join-Path $splatDir "scene.lite.ksplat"
    $hasLite      = ($GenerateLiteKsplat.IsPresent) -and (Test-Path -LiteralPath $litePath) -and ($splatToUpload -like "*.ksplat")
    if ($hasLite) {
      & node $uploadScript --tour-id $TourId --splat-file $splatToUpload --splat-lite-file $litePath --api-base-url $ApiBaseUrl *>&1 | ForEach-Object { $line = "$_"; Write-Host $line; Add-Content -Path $logFile -Value $line -Encoding UTF8 }
    } else {
      & node $uploadScript --tour-id $TourId --splat-file $splatToUpload --api-base-url $ApiBaseUrl *>&1 | ForEach-Object { $line = "$_"; Write-Host $line; Add-Content -Path $logFile -Value $line -Encoding UTF8 }
    }
    $sw5.Stop()
    if ($LASTEXITCODE -ne 0) { Log "ERRO [5/5]: upload falhou (codigo $LASTEXITCODE)." }
    else { Log "[5/5] OK em $($sw5.Elapsed.TotalSeconds.ToString('F1')) s - tour $TourId marcado como ready." }
  }
} elseif (-not [string]::IsNullOrWhiteSpace($TourId) -and $SkipUpload) {
  Log "[5/5] Pulado (-SkipUpload). Tour $TourId NAO atualizado."
} else {
  Log "[5/5] Pulado (sem -TourId). Output local apenas."
}

$totalSec = $sw1.Elapsed.TotalSeconds + $sw2.Elapsed.TotalSeconds + $sw3.Elapsed.TotalSeconds
if ($null -ne $sw4) { $totalSec += $sw4.Elapsed.TotalSeconds }
if ($null -ne $sw5) { $totalSec += $sw5.Elapsed.TotalSeconds }
$totalMin = [math]::Round($totalSec / 60, 1)

Log "=== PIPELINE COMPLETO - $totalMin min total ==="
Log ""
Log "  PLY:    $splatDir\scene.ply"
Log "  KSPLAT: $splatDir\scene.ksplat"
if ($GenerateYupPly -and (Test-Path -LiteralPath (Join-Path $splatDir "scene.yup.ply"))) {
  Log "  YUP:    $splatDir\scene.yup.ply  (abrir em SuperSplat / Blender / Unity)"
}
Log ""
Log "  Preview externo: https://superspl.at/editor  (use scene.yup.ply se -GenerateYupPly foi usado)"
Log "  Preview local:   npx serve -l 9000"
Log "    -> http://localhost:9000/scripts/local-gs/test-viewer.html?ply=/output/splat/scene.ksplat"
