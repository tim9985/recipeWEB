-- Recipe App Current Schema
-- Database: recipe_db
-- 현재 프로젝트에서 사용 중인 스키마

-- Pantry Items 테이블 (유일한 데이터베이스 테이블)
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

-- 참고: Shopping List 및 기타 데이터는 JSON 파일로 관리됨
-- - pantry_store.json: 팬트리 항목 (로컬 폴백)
-- - shopping_store.json: 장보기 리스트
