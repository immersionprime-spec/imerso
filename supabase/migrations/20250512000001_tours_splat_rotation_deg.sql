-- Adiciona campo de rotação inicial do splat (graus, inteiro, default 0)
-- Valores típicos: 0 (sem rotação), 90 (câmera deitada pra esquerda),
-- -90 (câmera deitada pra direita), 180 (câmera de cabeça pra baixo)
ALTER TABLE tours ADD COLUMN IF NOT EXISTS splat_rotation_deg integer NOT NULL DEFAULT 0;
