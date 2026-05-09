const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const fs = require('fs/promises');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.FOOD_API_KEY || '1bda72e01e684cceb6e8';
const SERVICE_ID = 'COOKRCP01';
const API_BASE = 'https://openapi.foodsafetykorea.go.kr/api';

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'recipe_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';
const OLLAMA_TIMEOUT_MS = Math.max(5000, Number(process.env.OLLAMA_TIMEOUT_MS || 60000));

let dbPool;
let dbInitError = null;
const pantryStoreFile = path.join(__dirname, 'pantry_store.json');
const dbInitPromise = initializeDatabase();

let cache = {
  allRecipes: [],
  totalCount: 0,
  fields: [],
  wayOptions: [],
  patOptions: [],
  fetchedAt: null,
  isLoading: false,
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function initializeDatabase() {
  try {
    dbPool = mysql.createPool(DB_CONFIG);
    await dbPool.query('SELECT 1');

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS pantry_items (
        id INT NOT NULL AUTO_INCREMENT,
        ingredient_name VARCHAR(120) NOT NULL,
        quantity_text VARCHAR(120) NOT NULL,
        quantity_value DECIMAL(12,3) NULL,
        unit VARCHAR(40) NULL,
        purchase_date DATE NOT NULL,
        expiry_date DATE NULL,
        memo VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_pantry_ingredient (ingredient_name),
        INDEX idx_pantry_expiry (expiry_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    dbInitError = null;
  } catch (error) {
    dbInitError = error;
    dbPool = null;
    console.warn('DB initialization failed, falling back to local pantry store:', error.message);
  }
}

function ensureDbReady() {
  if (dbPool && !dbInitError) {
    return Promise.resolve();
  }
  return Promise.reject(dbInitError || new Error('DB가 초기화되지 않았습니다.'));
}

async function waitForDatabaseInit() {
  try {
    await dbInitPromise;
  } catch (error) {
    return;
  }
}

async function readPantryStore() {
  try {
    const raw = await fs.readFile(pantryStoreFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(pantryStoreFile, '[]', 'utf8');
      return [];
    }
    throw error;
  }
}

async function writePantryStore(items) {
  await fs.writeFile(pantryStoreFile, JSON.stringify(items, null, 2), 'utf8');
}

async function listPantryItems() {
  const rows = await readPantryStore();
  return rows.sort((a, b) => {
    const aExpiry = a.expiryDate || '9999-12-31';
    const bExpiry = b.expiryDate || '9999-12-31';
    if (aExpiry !== bExpiry) return String(aExpiry).localeCompare(String(bExpiry));
    if (a.purchaseDate !== b.purchaseDate) return String(b.purchaseDate).localeCompare(String(a.purchaseDate));
    return Number(b.id) - Number(a.id);
  });
}

async function insertPantryItem(data) {
  const rows = await readPantryStore();
  const nextId = rows.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  rows.push({ id: nextId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await writePantryStore(rows);
  return nextId;
}

async function updatePantryItemById(id, data) {
  const rows = await readPantryStore();
  const index = rows.findIndex((item) => Number(item.id) === id);
  if (index === -1) return 0;
  rows[index] = { ...rows[index], ...data, updatedAt: new Date().toISOString() };
  await writePantryStore(rows);
  return 1;
}

async function deletePantryItemById(id) {
  const rows = await readPantryStore();
  const nextRows = rows.filter((item) => Number(item.id) !== id);
  if (nextRows.length === rows.length) return 0;
  await writePantryStore(nextRows);
  return 1;
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeIngredientName(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function splitIngredientTokens(partsText) {
  const source = String(partsText || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[\[\]•●·]/g, ' ');

  const blacklist = new Set(['재료', '양념', '양념장', '소스', '주재료', '필수재료', '기준', '인분']);

  const chunks = source.split(/[\n,]/g);
  const tokens = [];

  for (const chunk of chunks) {
    let cleaned = chunk.trim();
    if (!cleaned) continue;

    if (cleaned.includes(':')) {
      cleaned = cleaned.split(':').slice(-1)[0].trim();
    }

    cleaned = cleaned
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[0-9]+([./][0-9]+)?/g, ' ')
      .replace(/(?:g|kg|ml|l|큰술|작은술|컵|개|장|봉|쪽|줄기|마리|모|톨|알|스푼|tsp|tbsp)/gi, ' ')
      .replace(/[^a-zA-Z가-힣\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) continue;
    if (blacklist.has(cleaned)) continue;
    if (cleaned.length < 2) continue;

    tokens.push(cleaned);
  }

  return [...new Set(tokens)];
}

function scoreRecipeWithPantry(recipe, pantryNames) {
  const requiredTokens = splitIngredientTokens(recipe.RCP_PARTS_DTLS);
  const requiredNormalized = requiredTokens.map((t) => normalizeIngredientName(t));

  if (requiredNormalized.length === 0) {
    return {
      matched: [],
      missing: [],
      score: 0,
      coverage: 0,
      matchedCount: 0,
    };
  }

  const matched = [];
  const missing = [];

  for (let i = 0; i < requiredNormalized.length; i += 1) {
    const token = requiredNormalized[i];
    const original = requiredTokens[i];
    const hit = pantryNames.some((name) => name.includes(token) || token.includes(name));
    if (hit) {
      matched.push(original);
    } else {
      missing.push(original);
    }
  }

  const coverage = matched.length / requiredNormalized.length;
  const score = Math.round((coverage * 100 + matched.length * 1.5) * 10) / 10;

  return {
    matched,
    missing,
    score,
    coverage,
    matchedCount: matched.length,
  };
}

function buildPantryRecommendationView(recipe, matching, extra = {}) {
  return {
    ...createRecipeViewModel(recipe),
    recommendation: {
      score: matching.score,
      coverage: Math.round(matching.coverage * 100),
      matchedCount: matching.matchedCount,
      matchedIngredients: matching.matched,
      missingIngredients: matching.missing,
      canCookNow: matching.coverage >= 0.6 && matching.missing.length <= 2,
      ...extra,
    },
  };
}

function buildPantryCandidatePool(pantryNames, limit = 20) {
  return cache.allRecipes
    .map((recipe) => ({
      recipe,
      matching: scoreRecipeWithPantry(recipe, pantryNames),
    }))
    .sort((a, b) => {
      if (b.matching.score !== a.matching.score) {
        return b.matching.score - a.matching.score;
      }
      if (b.matching.matchedCount !== a.matching.matchedCount) {
        return b.matching.matchedCount - a.matching.matchedCount;
      }
      return String(a.recipe.RCP_NM || '').localeCompare(String(b.recipe.RCP_NM || ''), 'ko');
    })
    .slice(0, limit);
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (innerError) {
        return null;
      }
    }
  }

  return null;
}

function buildOllamaPrompt(pantryRows, candidates) {
  const pantryLines = pantryRows.length
    ? pantryRows.map((row) => {
        const parts = [row.ingredientName || row.ingredient_name || ''];
        const quantityText = row.quantityText || row.quantity_text || '';
        const unit = row.unit || '';
        if (quantityText) parts.push(`수량 ${quantityText}`);
        if (unit) parts.push(`단위 ${unit}`);
        return `- ${parts.filter(Boolean).join(' / ')}`;
      })
    : ['- 보유 식재료 정보 없음'];

  const candidateLines = candidates.map(({ recipe, matching }) => {
    const matchedText = matching.matched.slice(0, 5).join(', ') || '-';
    const missingText = matching.missing.slice(0, 5).join(', ') || '-';
    return `- seq:${recipe.RCP_SEQ} | name:${recipe.RCP_NM} | way:${recipe.RCP_WAY2 || '-'} | type:${recipe.RCP_PAT2 || '-'} | matched:${matchedText} | missing:${missingText} | coverage:${Math.round(matching.coverage * 100)}%`;
  });

  return [
    '너는 한국 가정식 메뉴 추천 전문가다.',
    '반드시 아래 후보 목록 안에서만 메뉴를 고르고, JSON만 반환해라.',
    '절대로 코드 블록, 설명문, 마크다운을 출력하지 마라.',
    '반환 형식:',
    '{"summary":"한 문장 요약","title":"짧은 추천 제목","selections":[{"seq":"레시피번호","reason":"짧은 이유","confidence":0.0,"meal":"아침|점심|저녁|간식","canCookNow":true}]}',
    '규칙:',
    '- 후보 목록에 없는 seq는 쓰지 마라.',
    '- 최대 5개까지만 추천해라.',
    '- 보유 재료와 직접적으로 맞는 메뉴를 우선해라.',
    '',
    '보유 식재료:',
    ...pantryLines,
    '',
    '후보 레시피:',
    ...candidateLines,
  ].join('\n');
}

async function requestOllamaRecommendation(pantryRows, candidates) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2,
          top_p: 0.9,
        },
        messages: [
          {
            role: 'system',
            content: 'You recommend Korean home cooking menus from pantry ingredients and candidate recipes.',
          },
          {
            role: 'user',
            content: buildOllamaPrompt(pantryRows, candidates),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API 호출 실패: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const content = json?.message?.content || json?.response || '';
    const parsed = extractJsonObject(content);

    if (!parsed) {
      throw new Error('Ollama 응답을 JSON으로 해석할 수 없습니다.');
    }

    const selections = [];
    const rawSelections = Array.isArray(parsed.selections)
      ? parsed.selections
      : Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : Array.isArray(parsed.items)
          ? parsed.items
          : [];

    for (const item of rawSelections) {
      const seq = String(item?.seq || item?.recipeSeq || item?.RCP_SEQ || '').trim();
      if (!seq) continue;

      selections.push({
        seq,
        reason: String(item?.reason || item?.explanation || '').trim(),
        confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : null,
        meal: String(item?.meal || item?.timeOfDay || '').trim(),
        canCookNow: Boolean(item?.canCookNow ?? item?.canCook ?? false),
      });
    }

    return {
      title: String(parsed.title || '').trim(),
      summary: String(parsed.summary || '').trim(),
      selections,
      raw: json,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractSteps(recipe) {
  const steps = [];

  for (let i = 1; i <= 20; i += 1) {
    const stepNo = String(i).padStart(2, '0');
    const text = (recipe[`MANUAL${stepNo}`] || '').trim();
    const image = (recipe[`MANUAL_IMG${stepNo}`] || '').trim();

    if (!text && !image) continue;

    steps.push({
      step: i,
      text,
      image,
    });
  }

  return steps;
}

function pickCardImage(recipe) {
  return recipe.ATT_FILE_NO_MAIN || recipe.ATT_FILE_NO_MK || recipe.MANUAL_IMG01 || '';
}

function createRecipeViewModel(recipe) {
  return {
    ...recipe,
    cardImage: pickCardImage(recipe),
    steps: extractSteps(recipe),
  };
}

async function fetchRecipeRange(start, end) {
  const safeStart = Math.max(1, toNumber(start, 1));
  const safeEnd = Math.max(safeStart, toNumber(end, safeStart + 49));
  const url = `${API_BASE}/${API_KEY}/${SERVICE_ID}/json/${safeStart}/${safeEnd}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`식약처 API 호출 실패: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const payload = json?.[SERVICE_ID];

  if (!payload || !payload.RESULT) {
    throw new Error('식약처 API 응답 형식이 예상과 다릅니다.');
  }

  if (payload.RESULT.CODE !== 'INFO-000') {
    throw new Error(`식약처 API 오류: ${payload.RESULT.MSG || payload.RESULT.CODE}`);
  }

  const rows = Array.isArray(payload.row) ? payload.row : [];
  const totalCount = toNumber(payload.total_count, 0);

  return {
    totalCount,
    rows,
  };
}

async function rebuildCache() {
  if (cache.isLoading) {
    return;
  }

  cache.isLoading = true;

  try {
    const first = await fetchRecipeRange(1, 1);
    const totalCount = first.totalCount;
    const chunkSize = 200;
    const allRows = [];

    for (let start = 1; start <= totalCount; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, totalCount);
      const batch = await fetchRecipeRange(start, end);
      allRows.push(...batch.rows);
    }

    const fields = uniqueSorted(allRows.flatMap((row) => Object.keys(row)));
    const wayOptions = uniqueSorted(allRows.map((row) => row.RCP_WAY2));
    const patOptions = uniqueSorted(allRows.map((row) => row.RCP_PAT2));

    cache = {
      allRecipes: allRows,
      totalCount,
      fields,
      wayOptions,
      patOptions,
      fetchedAt: new Date().toISOString(),
      isLoading: false,
    };
  } catch (error) {
    cache.isLoading = false;
    throw error;
  }
}

function ensureCacheReady() {
  if (cache.allRecipes.length > 0) {
    return Promise.resolve();
  }
  return rebuildCache();
}

function filterRecipes(recipes, query) {
  const keyword = normalizeText(query.q);
  const way = normalizeText(query.way);
  const pat = normalizeText(query.pat);
  const seq = normalizeText(query.seq);

  let result = recipes;

  if (seq) {
    result = result.filter((r) => normalizeText(r.RCP_SEQ) === seq);
  }

  if (way) {
    result = result.filter((r) => normalizeText(r.RCP_WAY2) === way);
  }

  if (pat) {
    result = result.filter((r) => normalizeText(r.RCP_PAT2) === pat);
  }

  if (keyword) {
    const safe = new RegExp(escapeRegex(keyword), 'i');
    result = result.filter((r) => {
      return [
        r.RCP_NM,
        r.RCP_PARTS_DTLS,
        r.HASH_TAG,
        r.RCP_NA_TIP,
        r.RCP_WAY2,
        r.RCP_PAT2,
      ].some((v) => safe.test(String(v || '')));
    });
  }

  return result;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: SERVICE_ID,
    cached: cache.allRecipes.length,
    fetchedAt: cache.fetchedAt,
    db: {
      connected: Boolean(dbPool && !dbInitError),
      message: dbInitError ? dbInitError.message : 'ok',
    },
  });
});

app.get('/api/pantry', async (req, res) => {
  try {
    await waitForDatabaseInit();
    const rows = await listPantryItems();
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/pantry', async (req, res) => {
  try {
    await waitForDatabaseInit();
    const ingredientName = String(req.body.ingredientName || '').trim();
    const quantityText = String(req.body.quantityText || '').trim();
    const purchaseDate = String(req.body.purchaseDate || '').trim();
    const expiryDate = String(req.body.expiryDate || '').trim();
    const memo = String(req.body.memo || '').trim();
    const quantityValue = req.body.quantityValue === undefined || req.body.quantityValue === '' ? null : Number(req.body.quantityValue);
    const unit = String(req.body.unit || '').trim() || null;

    if (!ingredientName) {
      res.status(400).json({ ok: false, message: '식재료명은 필수입니다.' });
      return;
    }

    if (!quantityText) {
      res.status(400).json({ ok: false, message: '수량 텍스트는 필수입니다.' });
      return;
    }

    if (!purchaseDate) {
      res.status(400).json({ ok: false, message: '구매일자는 필수입니다.' });
      return;
    }

    const id = await insertPantryItem({
      ingredientName,
      quantityText,
      quantityValue: Number.isFinite(quantityValue) ? quantityValue : null,
      unit,
      purchaseDate,
      expiryDate: expiryDate || null,
      memo: memo || null,
    });

    res.status(201).json({ ok: true, id });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.put('/api/pantry/:id', async (req, res) => {
  try {
    await waitForDatabaseInit();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: '유효한 id가 아닙니다.' });
      return;
    }

    const ingredientName = String(req.body.ingredientName || '').trim();
    const quantityText = String(req.body.quantityText || '').trim();
    const purchaseDate = String(req.body.purchaseDate || '').trim();
    const expiryDate = String(req.body.expiryDate || '').trim();
    const memo = String(req.body.memo || '').trim();
    const quantityValue = req.body.quantityValue === undefined || req.body.quantityValue === '' ? null : Number(req.body.quantityValue);
    const unit = String(req.body.unit || '').trim() || null;

    if (!ingredientName || !quantityText || !purchaseDate) {
      res.status(400).json({ ok: false, message: '식재료명/수량텍스트/구매일자는 필수입니다.' });
      return;
    }

    const affectedRows = await updatePantryItemById(id, {
      ingredientName,
      quantityText,
      quantityValue: Number.isFinite(quantityValue) ? quantityValue : null,
      unit,
      purchaseDate,
      expiryDate: expiryDate || null,
      memo: memo || null,
    });

    if (affectedRows === 0) {
      res.status(404).json({ ok: false, message: '수정할 식재료를 찾을 수 없습니다.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.delete('/api/pantry/:id', async (req, res) => {
  try {
    await waitForDatabaseInit();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: '유효한 id가 아닙니다.' });
      return;
    }

    const affectedRows = await deletePantryItemById(id);
    if (affectedRows === 0) {
      res.status(404).json({ ok: false, message: '삭제할 식재료를 찾을 수 없습니다.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/recommendations/pantry', async (req, res) => {
  try {
    await waitForDatabaseInit();
    await ensureCacheReady();

    const page = Math.max(1, toNumber(req.query.page, 1));
    const pageSize = Math.min(100, Math.max(1, toNumber(req.query.pageSize, 12)));

    const pantryRows = await listPantryItems();

    const pantryNames = pantryRows
      .map((row) => normalizeIngredientName(row.ingredientName || row.ingredient_name))
      .filter(Boolean);

    if (pantryNames.length === 0) {
      res.json({
        ok: true,
        pantryCount: 0,
        pagination: { page: 1, pageSize, totalFiltered: 0, totalPages: 1 },
        data: [],
      });
      return;
    }

    const scored = cache.allRecipes
      .map((recipe) => {
        const matching = scoreRecipeWithPantry(recipe, pantryNames);
        return {
          ...createRecipeViewModel(recipe),
          recommendation: {
            score: matching.score,
            coverage: Math.round(matching.coverage * 100),
            matchedCount: matching.matchedCount,
            matchedIngredients: matching.matched,
            missingIngredients: matching.missing,
            canCookNow: matching.coverage >= 0.6 && matching.missing.length <= 2,
          },
        };
      })
      .filter((recipe) => recipe.recommendation.matchedCount > 0)
      .sort((a, b) => {
        if (b.recommendation.score !== a.recommendation.score) {
          return b.recommendation.score - a.recommendation.score;
        }
        return String(a.RCP_NM || '').localeCompare(String(b.RCP_NM || ''), 'ko');
      });

    const totalFiltered = scored.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const pageRows = scored.slice(startIndex, startIndex + pageSize);

    res.json({
      ok: true,
      pantryCount: pantryRows.length,
      pagination: {
        page: safePage,
        pageSize,
        totalFiltered,
        totalPages,
      },
      data: pageRows,
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/ai-recommendations-test', async (req, res) => {
  res.json({ ok: true, test: true });
});

app.get('/api/ai-recommendations', async (req, res) => {
  try {
    console.log('AI recommendation route hit:', req.originalUrl);
    await waitForDatabaseInit();
    await ensureCacheReady();

    const page = Math.max(1, toNumber(req.query.page, 1));
    const pageSize = Math.min(100, Math.max(1, toNumber(req.query.pageSize, 12)));
    const pantryRows = await listPantryItems();
    const pantryNames = pantryRows
      .map((row) => normalizeIngredientName(row.ingredientName || row.ingredient_name))
      .filter(Boolean);

    if (pantryNames.length === 0) {
      res.json({
        ok: true,
        source: 'empty',
        model: OLLAMA_MODEL,
        pantryCount: 0,
        summary: '보유 식재료가 없습니다.',
        pagination: { page: 1, pageSize, totalFiltered: 0, totalPages: 1 },
        data: [],
      });
      return;
    }

    const candidatePool = buildPantryCandidatePool(pantryNames, 20);
    const candidateMap = new Map(
      candidatePool.map(({ recipe, matching }) => [String(recipe.RCP_SEQ), { recipe, matching }]),
    );

    let source = 'ollama';
    let summary = '';
    let title = '';
    let ollamaError = '';
    let selections = [];

    try {
      const ollama = await requestOllamaRecommendation(pantryRows, candidatePool);
      summary = ollama.summary;
      title = ollama.title;
      selections = ollama.selections;
    } catch (error) {
      source = 'fallback';
      ollamaError = error.message;
    }

    const selectedSeqs = new Set();
    const recommended = [];

    for (const selection of selections) {
      const candidate = candidateMap.get(selection.seq);
      if (!candidate || selectedSeqs.has(selection.seq)) continue;
      selectedSeqs.add(selection.seq);
      recommended.push(
        buildPantryRecommendationView(candidate.recipe, candidate.matching, {
          ollamaRecommendation: {
            source: 'ollama',
            reason: selection.reason || 'Ollama 추천',
            confidence: selection.confidence,
            meal: selection.meal,
            canCookNow: selection.canCookNow,
          },
        }),
      );
    }

    for (const candidate of candidatePool) {
      if (recommended.length >= pageSize) break;
      const seq = String(candidate.recipe.RCP_SEQ);
      if (selectedSeqs.has(seq)) continue;

      recommended.push(
        buildPantryRecommendationView(candidate.recipe, candidate.matching, {
          ollamaRecommendation: {
            source: source === 'ollama' ? 'ollama-fill' : 'fallback',
            reason: source === 'ollama' ? 'Ollama 추천을 보완하는 후보' : 'Ollama를 사용할 수 없어 보유 재료 기준으로 추천했습니다.',
            confidence: null,
            meal: '',
            canCookNow: candidate.matching.coverage >= 0.6 && candidate.matching.missing.length <= 2,
          },
        }),
      );
    }

    const totalFiltered = recommended.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const pageRows = recommended.slice(startIndex, startIndex + pageSize);

    res.json({
      ok: true,
      source,
      model: OLLAMA_MODEL,
      title,
      summary: summary || (source === 'fallback' ? 'Ollama 응답 대신 규칙 기반 추천으로 표시했습니다.' : ''),
      ollamaError: source === 'fallback' ? ollamaError : '',
      pantryCount: pantryRows.length,
      pagination: {
        page: safePage,
        pageSize,
        totalFiltered,
        totalPages,
      },
      data: pageRows,
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/refresh', async (req, res) => {
  try {
    await rebuildCache();
    res.json({
      ok: true,
      totalCount: cache.totalCount,
      fetchedAt: cache.fetchedAt,
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/meta', async (req, res) => {
  try {
    await ensureCacheReady();
    res.json({
      ok: true,
      totalCount: cache.totalCount,
      fetchedAt: cache.fetchedAt,
      fields: cache.fields,
      wayOptions: cache.wayOptions,
      patOptions: cache.patOptions,
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/recipes', async (req, res) => {
  try {
    await ensureCacheReady();

    const page = Math.max(1, toNumber(req.query.page, 1));
    const pageSize = Math.min(100, Math.max(1, toNumber(req.query.pageSize, 12)));
    const sort = normalizeText(req.query.sort || 'name_asc');

    let filtered = filterRecipes(cache.allRecipes, req.query);

    if (sort === 'name_desc') {
      filtered = [...filtered].sort((a, b) => String(b.RCP_NM || '').localeCompare(String(a.RCP_NM || ''), 'ko'));
    } else if (sort === 'cal_asc') {
      filtered = [...filtered].sort((a, b) => toNumber(a.INFO_ENG, 0) - toNumber(b.INFO_ENG, 0));
    } else if (sort === 'cal_desc') {
      filtered = [...filtered].sort((a, b) => toNumber(b.INFO_ENG, 0) - toNumber(a.INFO_ENG, 0));
    } else {
      filtered = [...filtered].sort((a, b) => String(a.RCP_NM || '').localeCompare(String(b.RCP_NM || ''), 'ko'));
    }

    const totalFiltered = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const pageRows = filtered.slice(startIndex, startIndex + pageSize).map(createRecipeViewModel);

    res.json({
      ok: true,
      pagination: {
        page: safePage,
        pageSize,
        totalFiltered,
        totalPages,
      },
      data: pageRows,
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/recipes/:seq', async (req, res) => {
  try {
    await ensureCacheReady();

    const seq = String(req.params.seq || '').trim();
    const found = cache.allRecipes.find((r) => String(r.RCP_SEQ) === seq);

    if (!found) {
      res.status(404).json({ ok: false, message: '레시피를 찾을 수 없습니다.' });
      return;
    }

    res.json({
      ok: true,
      data: createRecipeViewModel(found),
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/random', async (req, res) => {
  try {
    await ensureCacheReady();
    const randomIndex = Math.floor(Math.random() * cache.allRecipes.length);
    const recipe = cache.allRecipes[randomIndex];
    res.json({ ok: true, data: createRecipeViewModel(recipe) });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DB password loaded: ${Boolean(process.env.DB_PASSWORD)}`);
  console.log(`Recipe service running: http://localhost:${PORT}`);
});
