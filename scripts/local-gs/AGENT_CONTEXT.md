# Contexto para agentes — pipeline local GS (Imerso)

Leia antes de sugerir upgrades ou «melhorias» ao COLMAP/Brush. Documentação canónica da pinagem: `README.md` secção **«STACK FIXA — NÃO ATUALIZAR»**.

## Takeaways (2026-05 — sessão pipeline)

1. **Steps no Brush:** «75k > 60k» como regra mágica é mito — no Brush 0.3 a densificação tende a estagnar cedo. Na prática, **cap mental em ~40k** steps para evitar expectativa irreal e GPU a fogo sem ganho proporcional.

2. **Sparse fragmentado:** o **auto-pick silencioso** de reconstrução COLMAP/GLOMAP fragmentada (ou métricas «ok» com geometria má) é o **bug mais perigoso** do pipeline: mascara SfM pobre e empurra horas de treino para um resultado condenado. Preferir travas explícitas (`-StrictSfmQuality`, relatórios, revisão humana) a confiar só no default.

3. **Reuso de SfM:** quando um vídeo já tem **sparse bom em disco** (`colmap_ws/sparse/0/` coerente, registration alto, loop closure aceitável), **nunca refazer SfM do zero** nessa pasta de output — reutilizar o que já funcionou e iterar só no treino/pós-processamento.

## Ligações

- `ROADMAP.md` — **Fase 3** (tunar COLMAP + retry com seeds) está como *backlog, não urgente*.
- `AGENT_PROMPT_PIPELINE.md` — prompt longo para quem opera o pipeline; stack numérica alinhada ao README.
