const state = {
  page: 1,
  pageSize: 12,
  q: '',
  way: '',
  pat: '',
  sort: 'name_asc',
  mode: 'all',
  ingredientsPrompt: '',
  lastData: [],
  shoppingList: [],
  nutritionEstimate: null,
  seasonalMonth: new Date().getMonth() + 1,
  detailRecipe: null,
  pagination: null,
  meta: null,
};

let timerInterval = null;
let timerRemainingSeconds = 0;
let timerTotalSeconds = 0;

const SHOPPING_STORAGE_KEY = 'reciptapp.shoppingList';
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

const $ = (selector) => document.querySelector(selector);

const refs = {
  q: $('#q'),
  way: $('#way'),
  pat: $('#pat'),
  sort: $('#sort'),
  pageSize: $('#pageSize'),
  searchBtn: $('#searchBtn'),
  resetBtn: $('#resetBtn'),
  randomBtn: $('#randomBtn'),
  refreshBtn: $('#refreshBtn'),
  downloadBtn: $('#downloadBtn'),
  pantryForm: $('#pantryForm'),
  ingredientName: $('#ingredientName'),
  quantityText: $('#quantityText'),
  quantityValue: $('#quantityValue'),
  unit: $('#unit'),
  purchaseDate: $('#purchaseDate'),
  expiryDate: $('#expiryDate'),
  memo: $('#memo'),
  pantryBody: $('#pantryBody'),
  recommendByPantryBtn: $('#recommendByPantryBtn'),
  recommendByOllamaBtn: $('#recommendByOllamaBtn'),
  ingredientsPromptInput: $('#ingredientsPromptInput'),
  recommendByPromptBtn: $('#recommendByPromptBtn'),
  showAllRecipesBtn: $('#showAllRecipesBtn'),
  nutritionForm: $('#nutritionForm'),
  sex: $('#sex'),
  age: $('#age'),
  height: $('#height'),
  weight: $('#weight'),
  goal: $('#goal'),
  nutritionResult: $('#nutritionResult'),
  nutritionSubmitBtn: $('#nutritionSubmitBtn'),
  shoppingForm: $('#shoppingForm'),
  shoppingName: $('#shoppingName'),
  shoppingQuantity: $('#shoppingQuantity'),
  shoppingMemo: $('#shoppingMemo'),
  shoppingBody: $('#shoppingBody'),
  shoppingBulkBtn: $('#shoppingBulkBtn'),
  seasonalMonth: $('#seasonalMonth'),
  seasonalRefreshBtn: $('#seasonalRefreshBtn'),
  seasonalGrid: $('#seasonalGrid'),
  seasonalInfo: $('#seasonalInfo'),
  timerInput: $('#timerInput'),
  timerStartBtn: $('#timerStartBtn'),
  timerPauseBtn: $('#timerPauseBtn'),
  timerResetBtn: $('#timerResetBtn'),
  timerDisplay: $('#timerDisplay'),
  stats: $('#stats'),
  cardGrid: $('#cardGrid'),
  pageInfo: $('#pageInfo'),
  prevBtn: $('#prevBtn'),
  nextBtn: $('#nextBtn'),
  detailDialog: $('#detailDialog'),
  detailContent: $('#detailContent'),
  closeDialog: $('#closeDialog'),
  cardTemplate: $('#cardTemplate'),
};

function recipeToQuery() {
  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
    sort: state.sort,
  });

  if (state.q) params.set('q', state.q);
  if (state.way) params.set('way', state.way);
  if (state.pat) params.set('pat', state.pat);

  return params;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function withFallback(text, fallback = '-') {
  return String(text || '').trim() || fallback;
}

function showStats(text, isWarn = false) {
  refs.stats.classList.toggle('warn', isWarn);
  refs.stats.textContent = text;
}

async function safeFetchJson(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.message || '요청 처리 중 오류가 발생했습니다.');
  }
  return json;
}

async function safeFetchJsonWithMethod(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.message || '요청 처리 중 오류가 발생했습니다.');
  }
  return json;
}

function renderSelect(selectEl, options, placeholder) {
  selectEl.innerHTML = '';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = placeholder;
  selectEl.appendChild(defaultOption);

  options.forEach((option) => {
    const el = document.createElement('option');
    el.value = option;
    el.textContent = option;
    selectEl.appendChild(el);
  });
}

function renderCards(recipes, container = refs.cardGrid) {
  container.innerHTML = '';

  if (recipes.length === 0) {
    container.innerHTML = '<p class="panel" style="padding:16px;">조건에 맞는 레시피가 없습니다.</p>';
    return;
  }

  recipes.forEach((recipe, index) => {
    const node = refs.cardTemplate.content.cloneNode(true);
    const card = node.querySelector('.recipe-card');
    const img = node.querySelector('.recipe-image');
    const meta = node.querySelector('.meta');
    const title = node.querySelector('.title');
    const nutri = node.querySelector('.nutri');
    const tags = node.querySelector('.tags');
    const detailBtn = node.querySelector('.detail-btn');

    card.style.animationDelay = `${Math.min(index * 30, 280)}ms`;

    img.src = recipe.cardImage || 'https://dummyimage.com/800x600/e4efe9/6f7a82&text=No+Image';
    img.alt = withFallback(recipe.RCP_NM, '레시피 이미지');
    meta.textContent = `${withFallback(recipe.RCP_PAT2)} · ${withFallback(recipe.RCP_WAY2)} · NO.${withFallback(recipe.RCP_SEQ)}`;
    title.textContent = withFallback(recipe.RCP_NM);
    if ((state.mode === 'ollama' || state.mode === 'prompt') && recipe.ollamaRecommendation) {
      const ai = recipe.ollamaRecommendation;
      const confidence = ai.confidence === null || ai.confidence === undefined || ai.confidence === '' ? '' : ` | 신뢰도 ${Math.round(Number(ai.confidence) * 100)}%`;
      nutri.textContent = `${ai.source === 'fallback' ? '대체 추천' : 'Ollama 추천'}${ai.meal ? ` | ${ai.meal}` : ''}${confidence}${ai.reason ? ` | ${ai.reason}` : ''}`;
    } else if ((state.mode === 'pantry' || state.mode === 'prompt') && recipe.recommendation) {
      nutri.textContent = `매칭 ${recipe.recommendation.coverage}% | 점수 ${recipe.recommendation.score} | 일치 ${recipe.recommendation.matchedCount}개 | ${recipe.recommendation.canCookNow ? '바로 조리 가능' : '재료 보완 필요'}`;
    } else {
      nutri.textContent = `열량 ${withFallback(recipe.INFO_ENG)}kcal | 탄수 ${withFallback(recipe.INFO_CAR)}g | 단백 ${withFallback(recipe.INFO_PRO)}g | 지방 ${withFallback(recipe.INFO_FAT)}g | 나트륨 ${withFallback(recipe.INFO_NA)}mg`;
    }
    tags.textContent = withFallback(recipe.HASH_TAG, '해시태그 없음');

    detailBtn.addEventListener('click', () => openRecipeDetail(recipe.RCP_SEQ));

    container.appendChild(node);
  });
}

function createRawTable(recipe) {
  const entries = Object.entries(recipe);
  const rows = entries
    .map(([key, value]) => `<tr><th>${key}</th><td>${String(value ?? '')}</td></tr>`)
    .join('');

  return `<table class="raw-table"><tbody>${rows}</tbody></table>`;
}

function createStepsHtml(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return '<p>조리 단계 정보가 없습니다.</p>';
  }

  return `<div class="steps">${steps
    .map((step) => {
      return `<article class="step">
          <strong>${step.step}단계</strong>
          <p>${withFallback(step.text, '(설명 없음)')}</p>
          ${step.image ? `<img src="${step.image}" alt="${step.step}단계 이미지" />` : ''}
        </article>`;
    })
    .join('')}</div>`;
}

function buildDetailHtml(recipe) {
  const image = recipe.cardImage || 'https://dummyimage.com/800x600/e4efe9/6f7a82&text=No+Image';
  const recommendationBlock = recipe.recommendation
   ? `<p><strong>보유 재료 매칭</strong> ${recipe.recommendation.coverage}% (${recipe.recommendation.matchedCount}개 일치)</p>
       <p><strong>일치 재료</strong><br />${recipe.recommendation.matchedIngredients.join(', ') || '-'}</p>
     <p><strong>부족 재료</strong><br />${recipe.recommendation.missingIngredients.join(', ') || '-'}</p>
     <button class="btn small" data-action="shopping-from-detail" type="button">부족 재료 장바구니 담기</button>`
    : '';
  const ollamaBlock = recipe.ollamaRecommendation
    ? `<p><strong>${recipe.ollamaRecommendation.source === 'fallback' ? '대체 추천' : 'Ollama 추천'}</strong><br />${withFallback(recipe.ollamaRecommendation.reason)}${recipe.ollamaRecommendation.meal ? `<br />식사 시간: ${recipe.ollamaRecommendation.meal}` : ''}${recipe.ollamaRecommendation.confidence === null || recipe.ollamaRecommendation.confidence === undefined || recipe.ollamaRecommendation.confidence === '' ? '' : `<br />신뢰도: ${Math.round(Number(recipe.ollamaRecommendation.confidence) * 100)}%`}</p>`
    : '';

  return `<div class="detail-wrap">
      <div class="detail-head">
        <img src="${image}" alt="${withFallback(recipe.RCP_NM)}" />
        <div>
          <p class="meta">${withFallback(recipe.RCP_PAT2)} · ${withFallback(recipe.RCP_WAY2)} · 레시피번호 ${withFallback(recipe.RCP_SEQ)}</p>
          <h2>${withFallback(recipe.RCP_NM)}</h2>
          <p><strong>재료</strong><br />${withFallback(recipe.RCP_PARTS_DTLS).replaceAll('\n', '<br />')}</p>
          <p><strong>영양</strong> 열량 ${withFallback(recipe.INFO_ENG)}kcal / 탄수 ${withFallback(recipe.INFO_CAR)}g / 단백 ${withFallback(recipe.INFO_PRO)}g / 지방 ${withFallback(recipe.INFO_FAT)}g / 나트륨 ${withFallback(recipe.INFO_NA)}mg</p>
          <p><strong>조리 팁</strong><br />${withFallback(recipe.RCP_NA_TIP).replaceAll('\n', '<br />')}</p>
          ${recommendationBlock}
          ${ollamaBlock}
        </div>
      </div>

      <h3 class="section-title">조리 단계( MANUAL01~MANUAL20 )</h3>
      ${createStepsHtml(recipe.steps)}

      <h3 class="section-title">API 원본 필드 전체</h3>
      <div>${createRawTable(recipe)}</div>
    </div>`;
}

async function openRecipeDetail(seq) {
  try {
    const json = await safeFetchJson(`/api/recipes/${encodeURIComponent(seq)}`);
    state.detailRecipe = json.data;
    refs.detailContent.innerHTML = buildDetailHtml(json.data);
    refs.detailDialog.showModal();
  } catch (error) {
    alert(error.message);
  }
}

async function loadMeta() {
  const json = await safeFetchJson('/api/meta');
  state.meta = json;
  renderSelect(refs.way, json.wayOptions, '전체 조리방법');
  renderSelect(refs.pat, json.patOptions, '전체 요리유형');
}

function updateStateFromInputs() {
  state.q = refs.q.value.trim();
  state.way = refs.way.value;
  state.pat = refs.pat.value;
  state.sort = refs.sort.value;
  state.pageSize = toNum(refs.pageSize.value) || 12;
}

async function loadRecipes() {
  state.mode = 'all';
  updateStateFromInputs();
  showStats('레시피를 불러오는 중입니다...');

  try {
    const query = recipeToQuery();
    const json = await safeFetchJson(`/api/recipes?${query.toString()}`);

    state.lastData = json.data;
    state.pagination = json.pagination;

    renderCards(json.data);

    refs.pageInfo.textContent = `${json.pagination.page} / ${json.pagination.totalPages} 페이지`;
    refs.prevBtn.disabled = json.pagination.page <= 1;
    refs.nextBtn.disabled = json.pagination.page >= json.pagination.totalPages;

    const fetchedAt = state.meta?.fetchedAt ? new Date(state.meta.fetchedAt).toLocaleString('ko-KR') : '-';
    showStats(`총 ${state.meta?.totalCount ?? '-'}건 중 ${json.pagination.totalFiltered}건 검색됨 · 페이지당 ${json.pagination.pageSize}건 · API 캐시 갱신시각 ${fetchedAt}`);
  } catch (error) {
    showStats(error.message, true);
  }
}

function formatDate(value) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

function renderPantryRows(rows) {
  refs.pantryBody.innerHTML = '';
  if (!rows.length) {
    refs.pantryBody.innerHTML = '<tr><td colspan="7">등록된 식재료가 없습니다.</td></tr>';
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const hasNumericAmount = row.quantityValue !== null && row.quantityValue !== undefined && row.quantityValue !== '';
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${withFallback(row.ingredientName)}</td>
      <td>${withFallback(row.quantityText)}${hasNumericAmount ? ` (${row.quantityValue}${withFallback(row.unit, '')})` : ''}</td>
      <td>${formatDate(row.purchaseDate)}</td>
      <td>${formatDate(row.expiryDate)}</td>
      <td>${withFallback(row.memo)}</td>
      <td><button class="btn small" data-delete-id="${row.id}">삭제</button></td>
    `;
    refs.pantryBody.appendChild(tr);
  });
}

async function loadPantryList() {
  try {
    const json = await safeFetchJson('/api/pantry');
    renderPantryRows(json.data);
  } catch (error) {
    showStats(error.message, true);
  }
}

function renderShoppingRows(rows) {
  refs.shoppingBody.innerHTML = '';
  if (!rows.length) {
    refs.shoppingBody.innerHTML = '<tr><td colspan="6">장바구니가 비어 있습니다.</td></tr>';
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id}</td>
      <td><label><input type="checkbox" data-shopping-done-id="${row.id}" ${row.done ? 'checked' : ''} /> ${withFallback(row.name)}</label></td>
      <td>${withFallback(row.quantityText)}</td>
      <td>${withFallback(row.memo)}</td>
      <td>${row.done ? '구매완료' : '대기'}</td>
      <td>
        <button class="btn small" data-shopping-delete-id="${row.id}">삭제</button>
      </td>
    `;
    refs.shoppingBody.appendChild(tr);
  });
}

async function loadShoppingList() {
  const stored = localStorage.getItem(SHOPPING_STORAGE_KEY);
  let rows = [];

  try {
    rows = stored ? JSON.parse(stored) : [];
  } catch (error) {
    rows = [];
  }

  state.shoppingList = Array.isArray(rows) ? rows : [];
  renderShoppingRows(state.shoppingList);
}

async function addShoppingItem(event) {
  event.preventDefault();

  const name = refs.shoppingName.value.trim();
  if (!name) {
    showStats('장바구니 품목명을 입력해 주세요.', true);
    return;
  }

  const nextId = state.shoppingList.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  state.shoppingList.unshift({
    id: nextId,
    name,
    quantityText: refs.shoppingQuantity.value.trim(),
    memo: refs.shoppingMemo.value.trim(),
    done: false,
    sourceRecipeSeq: null,
    sourceRecipeName: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(state.shoppingList));
  refs.shoppingForm.reset();
  renderShoppingRows(state.shoppingList);
  showStats('장바구니에 추가되었습니다.');
}

async function addMissingIngredientsToShoppingList(recipe = state.detailRecipe) {
  const missing = Array.isArray(recipe?.recommendation?.missingIngredients) ? recipe.recommendation.missingIngredients : [];
  if (!missing.length) {
    showStats('장바구니에 담을 부족 재료가 없습니다.', true);
    return;
  }

  const existingNames = new Set(state.shoppingList.map((item) => normalizeIngredientName(item.name)));
  const nextId = state.shoppingList.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);

  let id = nextId;
  for (const name of missing) {
    const normalized = normalizeIngredientName(name);
    if (!normalized || existingNames.has(normalized)) continue;
    id += 1;
    state.shoppingList.unshift({
      id,
      name,
      quantityText: '',
      memo: `레시피: ${withFallback(recipe?.RCP_NM, '')}`,
      done: false,
      sourceRecipeSeq: recipe?.RCP_SEQ || null,
      sourceRecipeName: recipe?.RCP_NM || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    existingNames.add(normalized);
  }

  localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(state.shoppingList));
  renderShoppingRows(state.shoppingList);
  showStats('레시피 부족 재료를 장바구니에 담았습니다.');
}

async function toggleShoppingDone(id, done) {
  const item = state.shoppingList.find((row) => Number(row.id) === Number(id));
  if (!item) return;
  item.done = Boolean(done);
  item.updatedAt = new Date().toISOString();
  localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(state.shoppingList));
  renderShoppingRows(state.shoppingList);
}

async function deleteShoppingItem(id) {
  state.shoppingList = state.shoppingList.filter((row) => Number(row.id) !== Number(id));
  localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(state.shoppingList));
  renderShoppingRows(state.shoppingList);
  showStats('장바구니 항목을 삭제했습니다.');
}

function parseDurationText(text) {
  const source = String(text || '').replace(/\s+/g, '');
  if (!source) return null;

  const hourMatch = source.match(/(\d+)\s*시간/);
  const minuteMatch = source.match(/(\d+)\s*분/);
  const secondMatch = source.match(/(\d+)\s*초/);

  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const seconds = secondMatch ? Number(secondMatch[1]) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;

  return total > 0 ? total : null;
}

function renderTimer(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  refs.timerDisplay.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimerFromInput() {
  const seconds = parseDurationText(refs.timerInput.value);
  if (!seconds) {
    showStats('예: 3분 20초, 45초, 1시간 5분 같은 형식으로 입력해 주세요.', true);
    return;
  }

  stopTimer();
  timerTotalSeconds = seconds;
  timerRemainingSeconds = seconds;
  renderTimer(timerRemainingSeconds);

  timerInterval = setInterval(() => {
    timerRemainingSeconds -= 1;
    renderTimer(timerRemainingSeconds);
    if (timerRemainingSeconds <= 0) {
      stopTimer();
      showStats('타이머가 종료되었습니다.');
    }
  }, 1000);
}

function pauseTimer() {
  stopTimer();
  showStats('타이머를 일시정지했습니다.');
}

function resetTimer() {
  stopTimer();
  timerRemainingSeconds = 0;
  timerTotalSeconds = 0;
  renderTimer(0);
  showStats('타이머를 초기화했습니다.');
}

async function loadNutritionEstimate(event) {
  event.preventDefault();

  try {
    const sex = refs.sex.value;
    const age = toNum(refs.age.value) || 30;
    const height = toNum(refs.height.value) || 170;
    const weight = toNum(refs.weight.value) || 70;
    const goal = refs.goal.value;
    const ageBand = age < 13 ? 'child' : age < 19 ? 'teen' : age < 30 ? 'adult20' : age < 50 ? 'adult30' : age < 65 ? 'adult50' : 'senior';
    const baseEnergyBySex = sex === 'female' ? 2000 : 2500;
    const ageAdjust = ageBand === 'teen' ? 300 : ageBand === 'adult30' ? -50 : ageBand === 'adult50' ? -150 : ageBand === 'senior' ? -250 : 0;
    const idealWeight = Math.pow(height / 100, 2) * 22;
    const weightFactor = Math.min(1.2, Math.max(0.85, weight / idealWeight));
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
    const target = { calories, protein, fat, carbs, sodium: 2000, cholesterol: 300 };
    const reference = { idealWeight: Math.round(idealWeight * 10) / 10, bmi: Math.round((weight / Math.pow(height / 100, 2)) * 10) / 10 };

    state.nutritionEstimate = { profile: { sex, age, height, weight, goal }, reference, target };
    refs.nutritionResult.innerHTML = `
      <p><strong>기준 체중</strong> ${reference.idealWeight}kg · BMI ${reference.bmi}</p>
      <p><strong>열량</strong> ${target.calories}kcal</p>
      <p><strong>탄수화물</strong> ${target.carbs}g · <strong>단백질</strong> ${target.protein}g · <strong>지방</strong> ${target.fat}g</p>
      <p><strong>나트륨</strong> ${target.sodium}mg · <strong>콜레스테롤</strong> ${target.cholesterol}mg</p>
      <p>기본 KDRI 참고값과 체중/목표를 반영한 추정치입니다.</p>
    `;
    showStats('1일 섭취량을 계산했습니다.');
  } catch (error) {
    showStats(error.message, true);
  }
}

async function loadSeasonalRecommendations() {
  try {
    const month = Number(refs.seasonalMonth.value || state.seasonalMonth || new Date().getMonth() + 1);
    state.seasonalMonth = month;
    const keywords = SEASONAL_KEYWORDS[month] || [];

    if (!state.meta) {
      await loadMeta();
    }

    const pageSize = 100;
    const totalPages = Math.max(1, Math.ceil((state.meta?.totalCount || 0) / pageSize));
    const allRecipes = [];
    for (let page = 1; page <= totalPages; page += 1) {
      const json = await safeFetchJson(`/api/recipes?page=${page}&pageSize=${pageSize}&sort=name_asc`);
      allRecipes.push(...json.data);
    }

    const ranked = allRecipes
      .map((recipe) => {
        const haystack = [recipe.RCP_NM, recipe.RCP_PARTS_DTLS, recipe.RCP_NA_TIP, recipe.HASH_TAG].join(' ').toLowerCase();
        const matched = keywords.filter((keyword) => haystack.includes(String(keyword).toLowerCase()));
        return { ...recipe, seasonal: { matched, score: matched.length } };
      })
      .filter((recipe) => recipe.seasonal.score > 0)
      .sort((a, b) => {
        if (b.seasonal.score !== a.seasonal.score) return b.seasonal.score - a.seasonal.score;
        return String(a.RCP_NM || '').localeCompare(String(b.RCP_NM || ''), 'ko');
      })
      .slice(0, 12)
      .map(createRecipeViewModel);

    refs.seasonalInfo.textContent = `${month}월 제철 키워드: ${keywords.join(', ')}`;
    renderCards(ranked, refs.seasonalGrid);
  } catch (error) {
    showStats(error.message, true);
  }
}

async function reloadCurrentResults() {
  if (state.mode === 'ollama') {
    await loadOllamaRecommendations();
    return;
  }

  if (state.mode === 'pantry') {
    await loadPantryRecommendations();
    return;
  }

  if (state.mode === 'prompt') {
    await loadPromptRecommendations();
    return;
  }

  await loadRecipes();
}

async function addPantryItem(event) {
  event.preventDefault();

  try {
    await safeFetchJsonWithMethod('/api/pantry', 'POST', {
      ingredientName: refs.ingredientName.value.trim(),
      quantityText: refs.quantityText.value.trim(),
      quantityValue: refs.quantityValue.value,
      unit: refs.unit.value.trim(),
      purchaseDate: refs.purchaseDate.value,
      expiryDate: refs.expiryDate.value,
      memo: refs.memo.value.trim(),
    });

    refs.pantryForm.reset();
    refs.purchaseDate.valueAsDate = new Date();
    await loadPantryList();
    await reloadCurrentResults();
    showStats('식재료가 등록되었습니다.');
  } catch (error) {
    showStats(error.message, true);
  }
}

async function deletePantryItem(id) {
  try {
    await safeFetchJsonWithMethod(`/api/pantry/${id}`, 'DELETE');
    await loadPantryList();
    await reloadCurrentResults();
    showStats('식재료가 삭제되었습니다.');
  } catch (error) {
    showStats(error.message, true);
  }
}

async function loadPantryRecommendations() {
  state.mode = 'pantry';
  updateStateFromInputs();
  showStats('보유 식재료를 기준으로 추천 레시피를 계산하는 중입니다...');

  try {
    const json = await safeFetchJson(`/api/recommendations/pantry?page=${state.page}&pageSize=${state.pageSize}`);

    state.lastData = json.data;
    state.pagination = json.pagination;

    renderCards(json.data);
    refs.pageInfo.textContent = `${json.pagination.page} / ${json.pagination.totalPages} 페이지`;
    refs.prevBtn.disabled = json.pagination.page <= 1;
    refs.nextBtn.disabled = json.pagination.page >= json.pagination.totalPages;

    showStats(`보유 식재료 ${json.pantryCount}건 기준 추천 ${json.pagination.totalFiltered}건`);
  } catch (error) {
    showStats(error.message, true);
  }
}

async function loadOllamaRecommendations() {
  state.mode = 'ollama';
  updateStateFromInputs();
  showStats('Ollama가 보유 식재료 기반 메뉴를 추천하는 중입니다...');

  try {
    const json = await safeFetchJson(`/api/ai-recommendations?page=${state.page}&pageSize=${state.pageSize}`);

    state.lastData = json.data;
    state.pagination = json.pagination;

    renderCards(json.data);
    refs.pageInfo.textContent = `${json.pagination.page} / ${json.pagination.totalPages} 페이지`;
    refs.prevBtn.disabled = json.pagination.page <= 1;
    refs.nextBtn.disabled = json.pagination.page >= json.pagination.totalPages;

    const summary = [json.title, json.summary].filter(Boolean).join(' · ');
    if (json.source === 'fallback') {
      showStats(`Ollama를 사용할 수 없어 규칙 기반 추천으로 표시했습니다.${json.ollamaError ? ` · ${json.ollamaError}` : ''}` , true);
    } else {
      showStats(`${json.model} 기반 추천${summary ? ` · ${summary}` : ''}`);
    }
  } catch (error) {
    showStats(error.message, true);
  }
}

async function loadPromptRecommendations() {
  state.mode = 'prompt';
  updateStateFromInputs();
  state.ingredientsPrompt = refs.ingredientsPromptInput.value.trim();

  if (!state.ingredientsPrompt) {
    showStats('추천할 재료 문장을 입력해 주세요. 예: 사과 1개, 무 300g, 양파 2개', true);
    return;
  }

  showStats('입력한 식재료를 기준으로 추천 레시피를 계산하는 중입니다...');

  try {
    const json = await safeFetchJsonWithMethod('/api/recommendations/input', 'POST', {
      ingredientsPrompt: state.ingredientsPrompt,
      page: state.page,
      pageSize: state.pageSize,
      useOllama: true,
    });

    state.lastData = json.data;
    state.pagination = json.pagination;

    renderCards(json.data);
    refs.pageInfo.textContent = `${json.pagination.page} / ${json.pagination.totalPages} 페이지`;
    refs.prevBtn.disabled = json.pagination.page <= 1;
    refs.nextBtn.disabled = json.pagination.page >= json.pagination.totalPages;

    const ingredients = Array.isArray(json.inputIngredients) ? json.inputIngredients.join(', ') : '-';
    const summary = [json.title, json.summary].filter(Boolean).join(' · ');

    if (json.source === 'ollama') {
      showStats(`입력 재료 [${ingredients}] 기준 ${json.model} 추천 ${json.pagination.totalFiltered}건${summary ? ` · ${summary}` : ''}`);
      return;
    }

    showStats(`입력 재료 [${ingredients}] 기준 추천 ${json.pagination.totalFiltered}건${summary ? ` · ${summary}` : ''}${json.ollamaError ? ` · ${json.ollamaError}` : ''}`);
  } catch (error) {
    showStats(error.message, true);
  }
}

function downloadCurrentResults() {
  const blob = new Blob([JSON.stringify(state.lastData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recipes_page_${state.page}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function refreshCache() {
  showStats('API 캐시를 갱신하는 중입니다...');
  try {
    await safeFetchJson('/api/refresh');
    await loadMeta();
    await loadRecipes();
  } catch (error) {
    showStats(error.message, true);
  }
}

function wireEvents() {
  refs.searchBtn.addEventListener('click', () => {
    state.page = 1;
    loadRecipes();
  });

  refs.resetBtn.addEventListener('click', () => {
    refs.q.value = '';
    refs.way.value = '';
    refs.pat.value = '';
    refs.sort.value = 'name_asc';
    refs.pageSize.value = '12';
    state.page = 1;
    loadRecipes();
  });

  refs.randomBtn.addEventListener('click', async () => {
    try {
      const json = await safeFetchJson('/api/random');
      state.detailRecipe = json.data;
      refs.detailContent.innerHTML = buildDetailHtml(json.data);
      refs.detailDialog.showModal();
    } catch (error) {
      alert(error.message);
    }
  });

  refs.refreshBtn.addEventListener('click', refreshCache);
  refs.downloadBtn.addEventListener('click', downloadCurrentResults);
  refs.pantryForm.addEventListener('submit', addPantryItem);
  refs.recommendByPantryBtn.addEventListener('click', () => {
    state.page = 1;
    loadPantryRecommendations();
  });
  refs.recommendByOllamaBtn.addEventListener('click', () => {
    state.page = 1;
    loadOllamaRecommendations();
  });
  refs.recommendByPromptBtn.addEventListener('click', () => {
    state.page = 1;
    loadPromptRecommendations();
  });
  refs.showAllRecipesBtn.addEventListener('click', () => {
    state.page = 1;
    loadRecipes();
  });

  refs.pantryBody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-delete-id]');
    if (!button) return;
    deletePantryItem(button.getAttribute('data-delete-id'));
  });

  refs.shoppingBody.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('button[data-shopping-delete-id]');
    if (deleteButton) {
      deleteShoppingItem(deleteButton.getAttribute('data-shopping-delete-id'));
    }
  });

  refs.shoppingBody.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[data-shopping-done-id]');
    if (!checkbox) return;
    toggleShoppingDone(checkbox.getAttribute('data-shopping-done-id'), checkbox.checked);
  });

  refs.nutritionForm.addEventListener('submit', loadNutritionEstimate);
  refs.shoppingForm.addEventListener('submit', addShoppingItem);
  refs.timerStartBtn.addEventListener('click', startTimerFromInput);
  refs.timerPauseBtn.addEventListener('click', pauseTimer);
  refs.timerResetBtn.addEventListener('click', resetTimer);
  refs.seasonalRefreshBtn.addEventListener('click', loadSeasonalRecommendations);
  refs.seasonalMonth.addEventListener('change', loadSeasonalRecommendations);
  refs.detailContent.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="shopping-from-detail"]');
    if (!button) return;
    addMissingIngredientsToShoppingList();
  });

  refs.prevBtn.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      if (state.mode === 'pantry') {
        loadPantryRecommendations();
      } else if (state.mode === 'ollama') {
        loadOllamaRecommendations();
      } else if (state.mode === 'prompt') {
        loadPromptRecommendations();
      } else {
        loadRecipes();
      }
    }
  });

  refs.nextBtn.addEventListener('click', () => {
    if (state.pagination && state.page < state.pagination.totalPages) {
      state.page += 1;
      if (state.mode === 'pantry') {
        loadPantryRecommendations();
      } else if (state.mode === 'ollama') {
        loadOllamaRecommendations();
      } else if (state.mode === 'prompt') {
        loadPromptRecommendations();
      } else {
        loadRecipes();
      }
    }
  });

  refs.q.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      state.page = 1;
      loadRecipes();
    }
  });

  refs.ingredientsPromptInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      state.page = 1;
      loadPromptRecommendations();
    }
  });

  refs.closeDialog.addEventListener('click', () => refs.detailDialog.close());

  refs.detailDialog.addEventListener('click', (event) => {
    const rect = refs.detailDialog.getBoundingClientRect();
    const isOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (isOutside) refs.detailDialog.close();
  });
}

async function boot() {
  wireEvents();
  try {
    refs.purchaseDate.valueAsDate = new Date();
    refs.seasonalMonth.value = String(state.seasonalMonth);
    renderTimer(0);
    await loadMeta();
    await loadPantryList();
    await loadShoppingList();
    await loadSeasonalRecommendations();
    await loadRecipes();
  } catch (error) {
    showStats(error.message, true);
  }
}

boot();
