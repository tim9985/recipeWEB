# 식약처 조리식품 레시피 웹 서비스

식품안전나라 Open API(`COOKRCP01`)를 사용해 레시피를 검색/탐색/상세조회하는 웹 서비스입니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

`.env.example`를 복사해 `.env`를 만들고 값을 채우면 자동으로 읽습니다.

## 환경 변수(선택)

기본 API 키는 코드에 포함되어 있으며, 운영 시에는 환경 변수를 권장합니다.

```bash
set FOOD_API_KEY=발급받은키
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_USER=root
set DB_PASSWORD=비밀번호
set DB_NAME=recipe_db
set OLLAMA_BASE_URL=http://127.0.0.1:11434
set OLLAMA_MODEL=llama3.1
npm run dev
```

서버 시작 시 `recipe_db`에 `pantry_items` 테이블을 자동 생성합니다.
Ollama 추천 버튼은 로컬 Ollama 서버가 실행 중이면 AI 추천을 사용하고, 아니면 규칙 기반 추천으로 자동 대체합니다.

## 구현 기능

- 식약처 레시피 API 전체 데이터 캐시 로드
- 통합 검색: 레시피명/재료/해시태그/팁/요리유형/조리방법
- 필터: 조리방법(`RCP_WAY2`), 요리유형(`RCP_PAT2`)
- 정렬: 이름/열량 오름차순·내림차순
- 페이지네이션, 페이지 크기 조정
- 랜덤 레시피 추천
- API 캐시 강제 새로고침
- 현재 결과 JSON 다운로드
- 상세 모달: 재료/영양/팁/조리 단계(MANUAL01~20 + 이미지)
- API 원본 필드 전체 테이블 표시
- 내 식재료 등록/조회/삭제 (구매일자, 유통기한, 메모 포함)
- 보유 식재료 기반 추천 레시피 점수화
- Ollama 기반 메뉴 추천 버튼 및 AI 추천 결과 표시

## API 엔드포인트

- `GET /api/health` : 서버/캐시 상태
- `GET /api/meta` : 전체 필드/옵션 목록
- `GET /api/recipes` : 검색/필터/정렬/페이지 목록
- `GET /api/recipes/:seq` : 레시피 상세
- `GET /api/random` : 랜덤 1건
- `GET /api/refresh` : API 재동기화
- `GET /api/pantry` : 식재료 목록 조회
- `POST /api/pantry` : 식재료 등록
- `PUT /api/pantry/:id` : 식재료 수정
- `DELETE /api/pantry/:id` : 식재료 삭제
- `GET /api/recommendations/pantry` : 보유 식재료 기반 추천
- `GET /api/recommendations/ollama` : Ollama 기반 메뉴 추천
