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
const OLLAMA_BASE_URLS = Array.from(new Set([
  OLLAMA_BASE_URL,
  'http://localhost:11434',
  'http://127.0.0.1:11434',
].map((value) => String(value || '').replace(/\/$/, ''))));
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const OLLAMA_TIMEOUT_MS = Math.max(5000, Number(process.env.OLLAMA_TIMEOUT_MS || 120000));

let dbPool;
let dbInitError = null;
const pantryStoreFile = path.join(__dirname, 'pantry_store.json');
const shoppingStoreFile = path.join(__dirname, 'shopping_store.json');
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

app.get('/api/ping-feature', (req, res) => {
  res.json({ ok: true, feature: 'new-routes', ts: new Date().toISOString() });
});

app.get('/api/shopping-list', async (req, res) => {
  try {
    const rows = await listShoppingItems();
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/shopping-list', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const quantityText = String(req.body.quantityText || '').trim();
    const memo = String(req.body.memo || '').trim();
    const sourceRecipeSeq = String(req.body.sourceRecipeSeq || '').trim();
    const sourceRecipeName = String(req.body.sourceRecipeName || '').trim();

    if (!name) {
      res.status(400).json({ ok: false, message: '장바구니 품목명은 필수입니다.' });
      return;
    }

    const id = await insertShoppingItem({
      name,
      quantityText,
      memo,
      sourceRecipeSeq: sourceRecipeSeq || null,
      sourceRecipeName: sourceRecipeName || null,
    });

    res.status(201).json({ ok: true, id });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/shopping-list/bulk', async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const added = [];

    for (const item of items) {
      const name = String(item?.name || '').trim();
      if (!name) continue;
      const id = await insertShoppingItem({
        name,
        quantityText: String(item?.quantityText || '').trim(),
        memo: String(item?.memo || '').trim(),
        sourceRecipeSeq: String(item?.sourceRecipeSeq || '').trim() || null,
        sourceRecipeName: String(item?.sourceRecipeName || '').trim() || null,
      });
      added.push(id);
    }

    res.status(201).json({ ok: true, addedCount: added.length, ids: added });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.put('/api/shopping-list/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: '유효한 id가 아닙니다.' });
      return;
    }

    const affectedRows = await updateShoppingItemById(id, {
      name: String(req.body.name || '').trim(),
      quantityText: String(req.body.quantityText || '').trim(),
      memo: String(req.body.memo || '').trim(),
      done: Boolean(req.body.done),
    });

    if (affectedRows === 0) {
      res.status(404).json({ ok: false, message: '수정할 장바구니 항목을 찾을 수 없습니다.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.delete('/api/shopping-list/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: '유효한 id가 아닙니다.' });
      return;
    }

    const affectedRows = await deleteShoppingItemById(id);
    if (affectedRows === 0) {
      res.status(404).json({ ok: false, message: '삭제할 장바구니 항목을 찾을 수 없습니다.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/nutrition/estimate', async (req, res) => {
  try {
    const profile = estimateDailyIntake(req.body || {});
    res.json({ ok: true, data: profile });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/seasonal-recommendations', async (req, res) => {
  try {
    await ensureCacheReady();
    const { month, keywords } = getSeasonalKeywords(req.query.month);

    const ranked = cache.allRecipes
      .map((recipe) => {
        const seasonal = scoreSeasonalRecipe(recipe, keywords);
        return {
          ...createRecipeViewModel(recipe),
          seasonal,
        };
      })
      .filter((recipe) => recipe.seasonal.score > 0)
      .sort((a, b) => {
        if (b.seasonal.score !== a.seasonal.score) return b.seasonal.score - a.seasonal.score;
        return String(a.RCP_NM || '').localeCompare(String(b.RCP_NM || ''), 'ko');
      })
      .slice(0, 12);

    res.json({
      ok: true,
      month,
      keywords,
      data: ranked,
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

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

async function readJsonStore(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed ?? fallbackValue;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(filePath, JSON.stringify(fallbackValue, null, 2), 'utf8');
      return fallbackValue;
    }
    throw error;
  }
}

async function writeJsonStore(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function readShoppingStore() {
  const rows = await readJsonStore(shoppingStoreFile, []);
  return Array.isArray(rows) ? rows : [];
}

async function writeShoppingStore(items) {
  await writeJsonStore(shoppingStoreFile, items);
}

async function listShoppingItems() {
  const rows = await readShoppingStore();
  return rows.sort((a, b) => {
    const aDone = Boolean(a.done);
    const bDone = Boolean(b.done);
    if (aDone !== bDone) return Number(aDone) - Number(bDone);
    return Number(b.id) - Number(a.id);
  });
}

async function insertShoppingItem(data) {
  const rows = await readShoppingStore();
  const nextId = rows.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  rows.push({
    id: nextId,
    name: data.name,
    quantityText: data.quantityText || '',
    memo: data.memo || '',
    done: Boolean(data.done),
    sourceRecipeSeq: data.sourceRecipeSeq || null,
    sourceRecipeName: data.sourceRecipeName || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await writeShoppingStore(rows);
  return nextId;
}

async function updateShoppingItemById(id, data) {
  const rows = await readShoppingStore();
  const index = rows.findIndex((item) => Number(item.id) === id);
  if (index === -1) return 0;
  rows[index] = {
    ...rows[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await writeShoppingStore(rows);
  return 1;
}

async function deleteShoppingItemById(id) {
  const rows = await readShoppingStore();
  const nextRows = rows.filter((item) => Number(item.id) !== id);
  if (nextRows.length === rows.length) return 0;
  await writeShoppingStore(nextRows);
  return 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parsePositiveNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getAgeBand(age) {
  if (age < 13) return 'child';
  if (age < 19) return 'teen';
  if (age < 30) return 'adult20';
  if (age < 50) return 'adult30';
  if (age < 65) return 'adult50';
  return 'senior';
}

function estimateDailyIntake(profile) {
  const sex = String(profile.sex || 'male').toLowerCase();
  const age = parsePositiveNumber(profile.age, 30);
  const height = parsePositiveNumber(profile.height, 170);
  const weight = parsePositiveNumber(profile.weight, 70);
  const goal = String(profile.goal || 'maintain').toLowerCase();

  const ageBand = getAgeBand(age);
  const baseEnergyBySex = sex === 'female' ? 2000 : 2500;
  const ageAdjust = ageBand === 'teen' ? 300 : ageBand === 'adult30' ? -50 : ageBand === 'adult50' ? -150 : ageBand === 'senior' ? -250 : 0;
  const idealWeight = Math.pow(height / 100, 2) * 22;
  const weightFactor = clamp(weight / idealWeight, 0.85, 1.2);

  let goalCalories = 0;
  let proteinPerKg = 1.4;
  if (goal === 'bulk') {
    goalCalories = 350;
    proteinPerKg = 1.8;
  } else if (goal === 'diet') {
    goalCalories = -350;
    proteinPerKg = 1.6;
  }

  const calories = Math.round((baseEnergyBySex + ageAdjust) * weightFactor + goalCalories);
  const protein = Math.round(weight * proteinPerKg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  const sodium = 2000;
  const cholesterol = 300;

  return {
    profile: {
      sex,
      age,
      height,
      weight,
      goal,
    },
    reference: {
      ageBand,
      idealWeight: Math.round(idealWeight * 10) / 10,
      bmi: Math.round((weight / Math.pow(height / 100, 2)) * 10) / 10,
    },
    target: {
      calories,
      protein,
      fat,
      carbs,
      sodium,
      cholesterol,
    },
    note: '기본 KDRI 참고값과 체중/목표를 반영한 추정치입니다.',
  };
}

const SEASONAL_KEYWORDS = {
  1: ['배추', '무', '시금치', '굴', '귤'],
  2: ['배추', '무', '시금치', '굴', '귤'],
  3: ['달래', '냉이', '쑥', '미나리', '봄동'],
  4: ['달래', '냉이', '쑥', '미나리', '봄동'],
  5: ['토마토', '오이', '애호박', '양파', '가지'],
  6: ['토마토', '오이', '애호박', '양파', '가지'],
  7: ['옥수수', '복숭아', '수박', '가지', '깻잎'],
  8: ['옥수수', '복숭아', '수박', '가지', '깻잎'],
  9: ['버섯', '사과', '배', '고구마', '밤'],
  10: ['버섯', '사과', '배', '고구마', '밤'],
  11: ['배추', '무', '대파', '귤', '굴'],
  12: ['배추', '무', '대파', '귤', '굴'],
};

function getSeasonalKeywords(month) {
  const normalizedMonth = clamp(parsePositiveNumber(month, new Date().getMonth() + 1), 1, 12);
  return {
    month: normalizedMonth,
    keywords: SEASONAL_KEYWORDS[normalizedMonth] || [],
  };
}

function scoreSeasonalRecipe(recipe, keywords) {
  const haystack = [recipe.RCP_NM, recipe.RCP_PARTS_DTLS, recipe.RCP_NA_TIP, recipe.HASH_TAG].join(' ').toLowerCase();
  const matched = keywords.filter((keyword) => haystack.includes(String(keyword).toLowerCase()));
  return {
    matched,
    score: matched.length,
  };
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
    if (cleaned.length < 2 && !/^[가-힣]$/.test(cleaned)) continue;

    tokens.push(cleaned);
  }

  return [...new Set(tokens)];
}

function parseIngredientPrompt(promptText) {
  const source = String(promptText || '')
    .replace(/[\r\n]+/g, ',')
    .replace(/[;|/]/g, ',')
    .replace(/[\[\]{}()]/g, ' ')
    .trim();

  if (!source) return [];

  const chunks = source.split(',');
  const tokens = [];
  const stopwords = new Set([
    '요리', '레시피', '추천', '알려줘', '알려주세요', '가능', '가능한',
    '만들수있는', '만들', '할수있는', '할', '수', '있는', '뭐', '무엇',
    '있을까', '있나요', '해줘', '해주세요', '재료', '기준', '등등',
    '으로', '로', '은', '는', '이', '가', '을', '를', '와', '과', '및',
  ]);

  for (const chunk of chunks) {
    const cleaned = String(chunk)
      .replace(/(으로|로)\s*(할\s*수\s*있는)?\s*(요리|레시피).*/gi, ' ')
      .replace(/(요리|레시피)\s*(추천|알려줘|알려주세요|뭐|무엇).*/gi, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[0-9]+([./][0-9]+)?/g, ' ')
      .replace(/(?:g|kg|ml|l|큰술|작은술|컵|개|장|봉|쪽|줄기|마리|모|톨|알|스푼|tsp|tbsp)/gi, ' ')
      .replace(/[^a-zA-Z가-힣\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) continue;

    const words = cleaned.split(' ');
    for (const word of words) {
      const token = word.trim().toLowerCase();
      if (!token) continue;
      if (stopwords.has(token)) continue;
      if (token.length < 2 && !/^[가-힣]$/.test(token)) continue;
      tokens.push(token);
    }
  }

  return [...new Set(tokens)];
}

function scoreRecipeWithInputPrompt(recipe, inputNames) {
  const requiredTokens = splitIngredientTokens(recipe.RCP_PARTS_DTLS);
  const requiredNormalized = requiredTokens.map((t) => normalizeIngredientName(t));

  if (requiredNormalized.length === 0 || inputNames.length === 0) {
    return {
      score: 0,
      requiredCoverage: 0,
      inputCoverage: 0,
      matchedRequired: [],
      missingRequired: [],
      matchedInputs: [],
      matchedInputCount: 0,
    };
  }

  const matchedRequired = [];
  const missingRequired = [];

  for (let i = 0; i < requiredNormalized.length; i += 1) {
    const token = requiredNormalized[i];
    const original = requiredTokens[i];
    const hit = inputNames.some((name) => name.includes(token) || token.includes(name));
    if (hit) {
      matchedRequired.push(original);
    } else {
      missingRequired.push(original);
    }
  }

  const matchedInputs = [];
  for (const inputName of inputNames) {
    const hit = requiredNormalized.some((token) => token.includes(inputName) || inputName.includes(token));
    if (hit) matchedInputs.push(inputName);
  }

  const requiredCoverage = matchedRequired.length / requiredNormalized.length;
  const inputCoverage = matchedInputs.length / inputNames.length;
  const score = Math.round((inputCoverage * 75 + requiredCoverage * 25 + matchedInputs.length * 2.5) * 10) / 10;

  return {
    score,
    requiredCoverage,
    inputCoverage,
    matchedRequired,
    missingRequired,
    matchedInputs,
    matchedInputCount: matchedInputs.length,
  };
}

function buildInputPromptCandidatePool(inputNames, limit = 30) {
  const minimumMatches = Math.max(1, Math.ceil(inputNames.length * 0.5));
  const priorityPattern = /(닭|돼지|소고기|소|돼지고기|닭고기|앞다리|등심|안심|목살|삼겹|갈비|오리|새우|오징어|연어|고등어|참치)/;
  const priorityInputs = inputNames.filter((name) => priorityPattern.test(name));

  return cache.allRecipes
    .map((recipe) => ({
      recipe,
      matching: scoreRecipeWithInputPrompt(recipe, inputNames),
    }))
    .filter(({ matching }) => {
      if (matching.matchedInputCount < minimumMatches) return false;
      if (matching.inputCoverage < 0.5) return false;

      if (priorityInputs.length > 0) {
        const hasPriorityHit = priorityInputs.some((priority) =>
          matching.matchedInputs.some((hit) => hit.includes(priority) || priority.includes(hit)),
        );
        if (!hasPriorityHit) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (b.matching.score !== a.matching.score) return b.matching.score - a.matching.score;
      if (b.matching.matchedInputCount !== a.matching.matchedInputCount) {
        return b.matching.matchedInputCount - a.matching.matchedInputCount;
      }
      return String(a.recipe.RCP_NM || '').localeCompare(String(b.recipe.RCP_NM || ''), 'ko');
    })
    .slice(0, limit);
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
    const matchedText = matching.matched.slice(0, 3).join(', ') || '-';
    return `- seq:${recipe.RCP_SEQ} | name:${recipe.RCP_NM} | type:${recipe.RCP_PAT2 || '-'} | coverage:${Math.round(matching.coverage * 100)}% | matched:${matchedText}`;
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
    '- 출력은 짧고 간결하게 유지해라.',
    '',
    '보유 식재료:',
    ...pantryLines,
    '',
    '후보 레시피:',
    ...candidateLines,
  ].join('\n');
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

async function fetchInstalledOllamaModels(signal) {
  for (const baseUrl of OLLAMA_BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}/api/tags`, { signal });
      if (!response.ok) continue;
      const json = await response.json();
      const models = Array.isArray(json.models) ? json.models.map((m) => m?.name).filter(Boolean) : [];
      if (models.length > 0) return models;
    } catch (error) {
      continue;
    }
  }

  return [];
}

async function requestOllamaRecommendation(pantryRows, candidates) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const userPrompt = buildOllamaPrompt(pantryRows, candidates);
    const generateBody = {
      model: OLLAMA_MODEL,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.2,
        top_p: 0.9,
        num_predict: 256,
      },
      prompt: userPrompt,
    };

    let response = null;
    for (const baseUrl of OLLAMA_BASE_URLS) {
      try {
        response = await fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify(generateBody),
        });
        break;
      } catch (error) {
        response = null;
      }
    }

    if (!response) {
      throw new Error('Ollama API 연결에 실패했습니다.');
    }

    if (response.status === 404) {
      const chatBody = {
        model: generateBody.model,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 256,
        },
        messages: [
          {
            role: 'system',
            content: 'You recommend Korean home cooking menus from pantry ingredients and candidate recipes.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      };

      response = null;
      for (const baseUrl of OLLAMA_BASE_URLS) {
        try {
          response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify(chatBody),
          });
          break;
        } catch (error) {
          response = null;
        }
      }
    }

    if (!response) {
      throw new Error('Ollama API 연결에 실패했습니다.');
    }

    if (response.status === 404) {
      const installedModels = await fetchInstalledOllamaModels(controller.signal);
      const fallbackModel = installedModels[0];
      if (fallbackModel) {
        generateBody.model = fallbackModel;
        response = null;
        for (const baseUrl of OLLAMA_BASE_URLS) {
          try {
            response = await fetch(`${baseUrl}/api/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              signal: controller.signal,
              body: JSON.stringify(generateBody),
            });
            break;
          } catch (error) {
            response = null;
          }
        }
      }
    }

    if (response.status === 404) {
      const chatBody = {
        model: generateBody.model,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 256,
        },
        messages: [
          {
            role: 'system',
            content: 'You recommend Korean home cooking menus from pantry ingredients and candidate recipes.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      };

      response = null;
      for (const baseUrl of OLLAMA_BASE_URLS) {
        try {
          response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify(chatBody),
          });
          break;
        } catch (error) {
          response = null;
        }
      }
    }

    if (!response) {
      throw new Error('Ollama API 연결에 실패했습니다.');
    }

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

// ===== API Routes =====

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

app.get('/api/shopping-list', async (req, res) => {
  try {
    const rows = await listShoppingItems();
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/shopping-list', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const quantityText = String(req.body.quantityText || '').trim();
    const memo = String(req.body.memo || '').trim();
    const sourceRecipeSeq = String(req.body.sourceRecipeSeq || '').trim();
    const sourceRecipeName = String(req.body.sourceRecipeName || '').trim();

    if (!name) {
      res.status(400).json({ ok: false, message: '장바구니 품목명은 필수입니다.' });
      return;
    }

    const id = await insertShoppingItem({
      name,
      quantityText,
      memo,
      sourceRecipeSeq: sourceRecipeSeq || null,
      sourceRecipeName: sourceRecipeName || null,
    });

    res.status(201).json({ ok: true, id });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/shopping-list/bulk', async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const added = [];

    for (const item of items) {
      const name = String(item?.name || '').trim();
      if (!name) continue;
      const id = await insertShoppingItem({
        name,
        quantityText: String(item?.quantityText || '').trim(),
        memo: String(item?.memo || '').trim(),
        sourceRecipeSeq: String(item?.sourceRecipeSeq || '').trim() || null,
        sourceRecipeName: String(item?.sourceRecipeName || '').trim() || null,
      });
      added.push(id);
    }

    res.status(201).json({ ok: true, addedCount: added.length, ids: added });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.put('/api/shopping-list/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: '유효한 id가 아닙니다.' });
      return;
    }

    const affectedRows = await updateShoppingItemById(id, {
      name: String(req.body.name || '').trim(),
      quantityText: String(req.body.quantityText || '').trim(),
      memo: String(req.body.memo || '').trim(),
      done: Boolean(req.body.done),
    });

    if (affectedRows === 0) {
      res.status(404).json({ ok: false, message: '수정할 장바구니 항목을 찾을 수 없습니다.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.delete('/api/shopping-list/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: '유효한 id가 아닙니다.' });
      return;
    }

    const affectedRows = await deleteShoppingItemById(id);
    if (affectedRows === 0) {
      res.status(404).json({ ok: false, message: '삭제할 장바구니 항목을 찾을 수 없습니다.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/nutrition/estimate', async (req, res) => {
  try {
    const profile = estimateDailyIntake(req.body || {});
    res.json({ ok: true, data: profile });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/seasonal-recommendations', async (req, res) => {
  try {
    await ensureCacheReady();
    const { month, keywords } = getSeasonalKeywords(req.query.month);

    const ranked = cache.allRecipes
      .map((recipe) => {
        const seasonal = scoreSeasonalRecipe(recipe, keywords);
        return {
          ...createRecipeViewModel(recipe),
          seasonal,
        };
      })
      .filter((recipe) => recipe.seasonal.score > 0)
      .sort((a, b) => {
        if (b.seasonal.score !== a.seasonal.score) return b.seasonal.score - a.seasonal.score;
        return String(a.RCP_NM || '').localeCompare(String(b.RCP_NM || ''), 'ko');
      })
      .slice(0, 12);

    res.json({
      ok: true,
      month,
      keywords,
      data: ranked,
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/ping-feature', (req, res) => {
  res.json({ ok: true, feature: 'new-routes', ts: new Date().toISOString() });
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

app.get('/api/ai-recommendations', async (req, res) => {
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
        source: 'empty',
        model: OLLAMA_MODEL,
        pantryCount: 0,
        summary: '보유 식재료가 없습니다.',
        pagination: { page: 1, pageSize, totalFiltered: 0, totalPages: 1 },
        data: [],
      });
      return;
    }

    const candidatePool = buildPantryCandidatePool(pantryNames, 8);
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

app.post('/api/recommendations/input', async (req, res) => {
  try {
    await ensureCacheReady();

    const page = Math.max(1, toNumber(req.body.page, 1));
    const pageSize = Math.min(100, Math.max(1, toNumber(req.body.pageSize, 12)));
    const ingredientsPrompt = String(req.body.ingredientsPrompt || '').trim();
    const useOllama = req.body.useOllama !== false;

    if (!ingredientsPrompt) {
      res.status(400).json({ ok: false, message: '식재료 입력 문장을 작성해 주세요.' });
      return;
    }

    const parsedIngredients = parseIngredientPrompt(ingredientsPrompt);
    const inputNames = parsedIngredients.map((name) => normalizeIngredientName(name)).filter(Boolean);

    if (inputNames.length === 0) {
      res.status(400).json({ ok: false, message: '입력에서 식재료를 인식하지 못했습니다. 예: 사과 1개, 무 300g, 양파 2개' });
      return;
    }

    const candidatePool = buildInputPromptCandidatePool(inputNames, 30);

    if (candidatePool.length === 0) {
      res.json({
        ok: true,
        source: 'rule',
        model: OLLAMA_MODEL,
        title: '',
        summary: '입력 재료와 충분히 일치하는 레시피를 찾지 못했습니다. 재료를 조금 더 구체적으로 입력해 주세요.',
        ollamaError: '',
        inputIngredients: parsedIngredients,
        pagination: { page: 1, pageSize, totalFiltered: 0, totalPages: 1 },
        data: [],
      });
      return;
    }

    const candidateMap = new Map(
      candidatePool.map(({ recipe, matching }) => [String(recipe.RCP_SEQ), { recipe, matching }]),
    );

    let source = useOllama ? 'ollama' : 'rule';
    let title = '';
    let summary = '';
    let ollamaError = '';
    let selections = [];

    if (useOllama) {
      try {
        const syntheticPantry = parsedIngredients.map((name) => ({ ingredientName: name, quantityText: '' }));
        const ollama = await requestOllamaRecommendation(syntheticPantry, candidatePool);
        title = ollama.title;
        summary = ollama.summary;
        selections = ollama.selections;
      } catch (error) {
        source = 'fallback';
        ollamaError = error.message;
      }
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
            source: source === 'ollama' ? 'ollama' : 'fallback',
            reason: selection.reason || '입력 재료 기반 추천',
            confidence: selection.confidence,
            meal: selection.meal,
            canCookNow: selection.canCookNow,
          },
        }),
      );
    }

    for (const candidate of candidatePool) {
      if (recommended.length >= Math.max(20, pageSize)) break;
      const seq = String(candidate.recipe.RCP_SEQ);
      if (selectedSeqs.has(seq)) continue;
      selectedSeqs.add(seq);

      recommended.push(
        buildPantryRecommendationView(candidate.recipe, candidate.matching, {
          ollamaRecommendation: {
            source: source === 'ollama' ? 'ollama-fill' : 'rule',
            reason: source === 'ollama' ? '입력 재료 추천 후보 보강' : '입력 재료 일치율 기반 추천',
            confidence: null,
            meal: '',
            canCookNow: candidate.matching.inputCoverage >= 0.67,
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
      summary: summary || (source !== 'ollama' ? '입력 재료와 레시피 재료 일치율 기준으로 추천했습니다.' : ''),
      ollamaError,
      inputIngredients: parsedIngredients,
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
