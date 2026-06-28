import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { UPLOADS_ROOT } from '../utils/userProfile.js';
import { pool } from '../db.js';
import { scaleNutrients } from '../utils/calories.js';

const CONFIDENCE_THRESHOLD = 80;

function parseBase64Image(dataUrl) {
  const match = String(dataUrl).match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
  if (!match) {
    const err = new Error('Неверный формат фото (JPEG или PNG)');
    err.status = 400;
    throw err;
  }
  const ext = match[1].toLowerCase() === 'png' ? 'png' : match[1].toLowerCase() === 'webp' ? 'webp' : 'jpg';
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) {
    const err = new Error('Фото не больше 6 МБ');
    err.status = 400;
    throw err;
  }
  return { ext, buf, mime: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
}

export function saveNutritionPhoto(userId, dataUrl) {
  const { ext, buf } = parseBase64Image(dataUrl);
  const dir = path.join(UPLOADS_ROOT, 'nutrition-photos');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `food-${userId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buf);
  return `/api/uploads/nutrition-photos/${filename}`;
}

async function searchFoodByName(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  const [rows] = await pool.query(
    `SELECT * FROM nutrition_foods
     WHERE is_active = 1 AND (
       name LIKE ? OR name_en LIKE ? OR search_keywords LIKE ?
     )
     ORDER BY
       CASE WHEN name = ? THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END
     LIMIT 5`,
    [`%${q}%`, `%${q}%`, `%${q}%`, q, `${q}%`]
  );
  return rows;
}

async function analyzeWithOpenAI(dataUrl) {
  const apiKey = config.openai?.apiKey;
  if (!apiKey) return null;

  const prompt = `You are a nutrition expert. Analyze this food photo. Return ONLY valid JSON:
{
  "name": "dish name in Russian",
  "confidence": 0-100,
  "grams": estimated weight in grams,
  "portions": 1,
  "calories": total kcal,
  "protein_g": grams,
  "fat_g": grams,
  "carbs_g": grams,
  "fiber_g": grams,
  "alternatives": [{"name": "...", "confidence": 0-100}]
}
Focus on Central Asian cuisine (Tajik, Uzbek, Russian). Be realistic with portions.`;

  const res = await fetch(`${config.openai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openai.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 600,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    console.warn('[nutrition-ai] OpenAI error', res.status);
    return null;
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function buildFromDbFood(food, grams) {
  const nutrients = scaleNutrients(food, grams);
  return {
    name: food.name,
    food_id: food.id,
    confidence: 75,
    grams,
    portions: 1,
    ...nutrients,
    alternatives: [],
  };
}

async function fallbackAnalysis(dataUrl) {
  // Без AI — предлагаем популярные блюда региона
  const [foods] = await pool.query(
    `SELECT * FROM nutrition_foods WHERE is_active = 1 AND country IN ('TJ', 'UZ', 'RU')
     ORDER BY RAND() LIMIT 4`
  );
  const primary = foods[0];
  if (!primary) {
    return {
      name: 'Неизвестное блюдо',
      confidence: 30,
      grams: 250,
      portions: 1,
      calories: 300,
      protein_g: 10,
      fat_g: 12,
      carbs_g: 35,
      fiber_g: 2,
      alternatives: [],
      low_confidence: true,
    };
  }
  const result = buildFromDbFood(primary, primary.serving_grams);
  result.confidence = 45;
  result.low_confidence = true;
  result.alternatives = foods.slice(1).map((f) => ({
    name: f.name,
    food_id: f.id,
    confidence: 35,
    grams: f.serving_grams,
    ...scaleNutrients(f, f.serving_grams),
  }));
  return result;
}

export async function analyzeFoodPhoto(userId, photoBase64) {
  const photoUrl = saveNutritionPhoto(userId, photoBase64);

  let aiResult = null;
  try {
    aiResult = await analyzeWithOpenAI(photoBase64);
  } catch (e) {
    console.warn('[nutrition-ai]', e.message);
  }

  if (!aiResult) {
    aiResult = await fallbackAnalysis(photoBase64);
  }

  const confidence = Math.min(100, Math.max(0, Number(aiResult.confidence) || 0));
  let alternatives = Array.isArray(aiResult.alternatives) ? aiResult.alternatives : [];

  // Попробуем сопоставить с базой
  let foodId = aiResult.food_id || null;
  if (!foodId && aiResult.name) {
    const matches = await searchFoodByName(aiResult.name);
    if (matches?.length) {
      foodId = matches[0].id;
      if (confidence < CONFIDENCE_THRESHOLD) {
        alternatives = matches.slice(0, 4).map((f) => ({
          name: f.name,
          food_id: f.id,
          confidence: 60,
          grams: f.serving_grams,
          ...scaleNutrients(f, f.serving_grams),
        }));
      }
    }
  }

  const lowConfidence = confidence < CONFIDENCE_THRESHOLD;

  const result = {
    photo_url: photoUrl,
    name: aiResult.name || 'Блюдо',
    food_id: foodId,
    confidence,
    grams: Math.round(Number(aiResult.grams) || 250),
    portions: Number(aiResult.portions) || 1,
    calories: Math.round(Number(aiResult.calories) || 0),
    protein_g: Math.round(Number(aiResult.protein_g) * 10) / 10 || 0,
    fat_g: Math.round(Number(aiResult.fat_g) * 10) / 10 || 0,
    carbs_g: Math.round(Number(aiResult.carbs_g) * 10) / 10 || 0,
    fiber_g: Math.round(Number(aiResult.fiber_g) * 10) / 10 || 0,
    alternatives,
    low_confidence: lowConfidence,
  };

  // Пересчёт из базы если есть food_id и нет калорий
  if (foodId && !result.calories) {
    const [foods] = await pool.query('SELECT * FROM nutrition_foods WHERE id = ?', [foodId]);
    if (foods.length) {
      const scaled = scaleNutrients(foods[0], result.grams);
      Object.assign(result, scaled);
    }
  }

  const [insert] = await pool.query(
    `INSERT INTO nutrition_ai_results
       (user_id, photo_url, detected_name, confidence, grams, calories, protein_g, fat_g, carbs_g, fiber_g, alternatives_json, raw_response_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      photoUrl,
      result.name,
      result.confidence,
      result.grams,
      result.calories,
      result.protein_g,
      result.fat_g,
      result.carbs_g,
      result.fiber_g,
      JSON.stringify(alternatives),
      JSON.stringify(aiResult),
    ]
  );

  result.ai_result_id = insert.insertId;
  return result;
}

export { CONFIDENCE_THRESHOLD };
