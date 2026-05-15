import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Invalid slug format');

export const createImobiliariaSchema = z.object({
  nome: z.string().min(2).max(200),
  slug: slugSchema,
  whatsapp_principal: z.string().min(8).max(32),
  email_contato: z.string().email().optional().or(z.literal('')),
  endereco: z.string().max(500).optional().or(z.literal('')),
  cor_primaria: z.string().max(32).optional(),
  logo_url: z.string().url().optional().or(z.literal('')),
  cnpj: z.string().max(20).optional().or(z.literal('')),
  cidade: z.string().max(120).optional(),
  estado: z.string().max(4).optional(),
});

export const updateImobiliariaSchema = createImobiliariaSchema.partial();

export const createCorretorSchema = z.object({
  imobiliaria_id: z.string().uuid(),
  nome: z.string().min(2).max(200),
  creci: z.string().max(32).optional().or(z.literal('')),
  whatsapp: z.string().min(8).max(32),
  email: z.string().email().optional().or(z.literal('')),
  foto_url: z.string().url().optional().or(z.literal('')),
});

export const updateCorretorSchema = createCorretorSchema.omit({ imobiliaria_id: true }).partial();

const tourTipo = z.enum(['apartamento', 'casa', 'comercial', 'terreno', 'evento']);
const tourModalidade = z.enum(['venda', 'aluguel', 'temporada']);

export const createTourSchema = z
  .object({
    imobiliaria_id: z.string().uuid(),
    corretor_id: z.string().uuid().optional().nullable(),
    slug: slugSchema,
    titulo: z.string().min(3).max(200),
    tipo: tourTipo,
    bairro: z.string().max(120).optional().or(z.literal('')),
    area_m2: z.coerce.number().positive().optional().nullable(),
    quartos: z.coerce.number().int().min(0).optional().nullable(),
    valor: z.coerce.number().nonnegative().optional().nullable(),
    modalidade: tourModalidade.optional().nullable(),
    descricao: z.string().max(8000).optional().or(z.literal('')),
    is_public: z.boolean().optional().default(true),
    password: z.string().min(4).max(128).optional().or(z.literal('')),
    has_cinematic_mode: z.boolean().optional().default(false),
    cobranca_cliente_brl: z.coerce.number().nonnegative().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.is_public === false && (!data.password || data.password.length < 4)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password required when tour is private',
        path: ['password'],
      });
    }
  });

export const updateTourSchema = z.object({
  corretor_id: z.string().uuid().nullable().optional(),
  slug: slugSchema.optional(),
  titulo: z.string().min(3).max(200).optional(),
  tipo: tourTipo.optional(),
  bairro: z.string().max(120).nullable().optional(),
  cidade: z.string().max(120).nullable().optional(),
  estado: z.string().max(4).nullable().optional(),
  area_m2: z.coerce.number().positive().nullable().optional(),
  quartos: z.coerce.number().int().min(0).nullable().optional(),
  valor: z.coerce.number().nonnegative().nullable().optional(),
  modalidade: tourModalidade.nullable().optional(),
  descricao: z.string().max(8000).nullable().optional(),
  foto_capa_url: z.string().url().nullable().optional().or(z.literal('')),
  is_public: z.boolean().optional(),
  password: z.string().min(4).max(128).optional().or(z.literal('')),
  has_cinematic_mode: z.boolean().optional(),
  cobranca_cliente_brl: z.coerce.number().nonnegative().nullable().optional(),
  status: z.enum(['draft', 'uploading', 'processing', 'ready', 'failed', 'archived']).optional(),
  status_message: z.string().max(2000).nullable().optional(),
  splat_r2_key: z.string().max(500).nullable().optional().or(z.literal('')),
});

const hotspotIcon = z.enum([
  'suite',
  'cozinha',
  'varanda',
  'banheiro',
  'garagem',
  'sala',
  'piscina',
  'jardim',
  'churrasqueira',
  'home_office',
  'lavabo',
  'closet',
  'area_servico',
  'generico',
]);

export const createHotspotSchema = z.object({
  titulo: z.string().min(1).max(200),
  descricao: z.string().max(2000).optional().or(z.literal('')),
  icone: hotspotIcon,
  posicao_x: z.coerce.number(),
  posicao_y: z.coerce.number(),
  posicao_z: z.coerce.number(),
  ordem: z.coerce.number().int().min(0).optional(),
});

export const updateHotspotSchema = createHotspotSchema.partial();

export const createWaypointSchema = z.object({
  ordem: z.coerce.number().int().min(0).optional(),
  position_x: z.coerce.number(),
  position_y: z.coerce.number(),
  position_z: z.coerce.number(),
  target_x: z.coerce.number(),
  target_y: z.coerce.number(),
  target_z: z.coerce.number(),
  duration_ms: z.coerce.number().int().min(1000).max(60000).optional(),
});

export const updateWaypointSchema = createWaypointSchema.partial();

export const tourCameraStartSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  target: z.tuple([z.number(), z.number(), z.number()]),
});
