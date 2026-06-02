import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MODELS_ROOT = path.join(__dirname, '../../public/models');

const DEMO_GLB =
  'https://modelviewer.dev/shared-assets/models/MaterialsVariantsShoe.glb';
const DEMO_USDZ =
  'https://modelviewer.dev/shared-assets/models/MaterialsVariantsShoe.usdz';

const SPECS_DEFAULT = {
  weight: '250–280 г',
  cushioning: 'EVA амортизация',
  upper: 'Дышащий Mesh',
  traction: 'Надёжное сцепление',
  fit: 'Анатомическая форма',
};

export function resolveModelAssetUrl(filePath, req) {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const rel = filePath.startsWith('/') ? filePath : `/${filePath}`;
  const localPath = path.join(MODELS_ROOT, rel.replace(/^\/models\//, ''));
  if (fs.existsSync(localPath)) {
    const host = req.get('host');
    const proto = req.protocol || 'http';
    return `${proto}://${host}${rel}`;
  }
  return DEMO_GLB;
}

export function resolveUsdzUrl(filePath, req, glbResolved) {
  if (!filePath) return DEMO_USDZ;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const rel = filePath.startsWith('/') ? filePath : `/${filePath}`;
  const localPath = path.join(MODELS_ROOT, rel.replace(/^\/models\//, ''));
  if (fs.existsSync(localPath)) {
    const host = req.get('host');
    const proto = req.protocol || 'http';
    return `${proto}://${host}${rel}`;
  }
  return DEMO_USDZ;
}

function parseSpecs(row) {
  if (!row?.specs) return SPECS_DEFAULT;
  if (typeof row.specs === 'object') return row.specs;
  try {
    return JSON.parse(row.specs);
  } catch {
    return SPECS_DEFAULT;
  }
}

function mapVariant(v, req) {
  const glb = resolveModelAssetUrl(v.glb_file, req);
  return {
    id: v.id,
    name: v.name,
    slug: v.slug,
    color_name: v.color_name,
    color_code: v.color_code,
    image: v.image,
    is_default: !!v.is_default,
    glb,
    usdz: resolveUsdzUrl(v.usdz_file, req, glb),
  };
}

function mapModel(row, variants, req) {
  const defaultVariant = variants.find((v) => v.is_default) || variants[0];
  const glb = defaultVariant
    ? resolveModelAssetUrl(defaultVariant.glb_file || row.glb_file, req)
    : resolveModelAssetUrl(row.glb_file, req);
  return {
    id: row.id,
    product_id: row.product_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: row.price != null ? Number(row.price) : null,
    main_image: row.main_image,
    status: row.status,
    specs: parseSpecs(row),
    variants,
    glb,
    usdz: defaultVariant
      ? resolveUsdzUrl(defaultVariant.usdz_file || row.usdz_file, req, glb)
      : resolveUsdzUrl(row.usdz_file, req, glb),
  };
}

export async function listShoeModels(req) {
  const [rows] = await pool.query(
    `SELECT * FROM shoe_models WHERE status = 'active' ORDER BY id ASC`
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [variants] = await pool.query(
    `SELECT * FROM shoe_variants WHERE shoe_model_id IN (?) AND status = 'active' ORDER BY is_default DESC, id`,
    [ids]
  );
  return rows.map((row) => {
    const vars = variants
      .filter((v) => v.shoe_model_id === row.id)
      .map((v) => mapVariant(v, req));
    return mapModel(row, vars, req);
  });
}

export async function getShoeModelById(id, req) {
  const [rows] = await pool.query(`SELECT * FROM shoe_models WHERE id = ? AND status = 'active'`, [id]);
  if (!rows.length) return null;
  const [variants] = await pool.query(
    `SELECT * FROM shoe_variants WHERE shoe_model_id = ? AND status = 'active' ORDER BY is_default DESC, id`,
    [id]
  );
  return mapModel(
    rows[0],
    variants.map((v) => mapVariant(v, req)),
    req
  );
}

export async function getShoeModelBySlug(slug, req) {
  const [rows] = await pool.query(`SELECT * FROM shoe_models WHERE slug = ? AND status = 'active'`, [slug]);
  if (!rows.length) return null;
  return getShoeModelById(rows[0].id, req);
}

export async function getShoeModelArFiles(id, variantSlug, req) {
  const model = await getShoeModelById(id, req);
  if (!model) return null;
  let variant = model.variants.find((v) => v.slug === variantSlug);
  if (!variant) variant = model.variants.find((v) => v.is_default) || model.variants[0];
  return {
    model_id: model.id,
    variant_id: variant?.id,
    variant_slug: variant?.slug,
    glb: variant?.glb || model.glb,
    usdz: variant?.usdz || model.usdz,
  };
}

export async function adminListShoeModels() {
  const [rows] = await pool.query(`SELECT * FROM shoe_models ORDER BY id DESC`);
  const ids = rows.map((r) => r.id);
  let variants = [];
  if (ids.length) {
    const [v] = await pool.query(`SELECT * FROM shoe_variants WHERE shoe_model_id IN (?) ORDER BY id`, [ids]);
    variants = v;
  }
  return rows.map((row) => ({
    ...row,
    price: row.price != null ? Number(row.price) : null,
    specs: parseSpecs(row),
    variants: variants.filter((v) => v.shoe_model_id === row.id),
  }));
}

export async function adminSaveShoeModel(data, id = null) {
  const specs = data.specs ? JSON.stringify(data.specs) : JSON.stringify(SPECS_DEFAULT);
  const payload = [
    data.product_id || null,
    data.name,
    data.slug,
    data.description || null,
    data.price != null ? Number(data.price) : null,
    data.main_image || null,
    data.glb_file || null,
    data.usdz_file || null,
    specs,
    data.status || 'active',
  ];

  let modelId = id;
  if (id) {
    await pool.query(
      `UPDATE shoe_models SET product_id=?, name=?, slug=?, description=?, price=?, main_image=?, glb_file=?, usdz_file=?, specs=?, status=? WHERE id=?`,
      [...payload, id]
    );
  } else {
    const [r] = await pool.query(
      `INSERT INTO shoe_models (product_id, name, slug, description, price, main_image, glb_file, usdz_file, specs, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload
    );
    modelId = r.insertId;
  }

  if (Array.isArray(data.variants)) {
    await pool.query(`DELETE FROM shoe_variants WHERE shoe_model_id = ?`, [modelId]);
    for (const v of data.variants) {
      if (!v.name || !v.slug) continue;
      await pool.query(
        `INSERT INTO shoe_variants (shoe_model_id, name, slug, color_name, color_code, glb_file, usdz_file, image, is_default, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          modelId,
          v.name,
          v.slug,
          v.color_name || v.name,
          v.color_code || '#888888',
          v.glb_file || null,
          v.usdz_file || null,
          v.image || null,
          v.is_default ? 1 : 0,
          v.status || 'active',
        ]
      );
    }
  }

  const [rows] = await pool.query(`SELECT * FROM shoe_models WHERE id = ?`, [modelId]);
  const [vars] = await pool.query(`SELECT * FROM shoe_variants WHERE shoe_model_id = ?`, [modelId]);
  return { ...rows[0], specs: parseSpecs(rows[0]), variants: vars };
}

export function ensureModelsDir() {
  if (!fs.existsSync(MODELS_ROOT)) {
    fs.mkdirSync(MODELS_ROOT, { recursive: true });
  }
}
