-- =============================================
-- Cube Pattern Game — Supabase 테이블 스키마
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- =============================================

-- 1. 랭킹 테이블
CREATE TABLE IF NOT EXISTS rankings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  score INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  time INTEGER NOT NULL DEFAULT 0,          -- milliseconds
  accuracy INTEGER NOT NULL DEFAULT 0,      -- 0-100
  composite_score INTEGER NOT NULL DEFAULT 0,
  game_mode TEXT NOT NULL DEFAULT 'color',  -- 'color' | 'number'
  player_name TEXT DEFAULT '익명',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 인지 세션 기록 테이블
CREATE TABLE IF NOT EXISTS cognitive_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  score INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  time INTEGER NOT NULL DEFAULT 0,          -- milliseconds
  accuracy INTEGER NOT NULL DEFAULT 0,      -- 0-100
  max_combo INTEGER NOT NULL DEFAULT 0,
  game_mode TEXT NOT NULL DEFAULT 'color',
  device_id TEXT DEFAULT NULL,              -- 기기별 식별용 (optional)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. RLS (Row Level Security) 비활성화 — 공개 게임이므로 누구나 읽기/쓰기
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_sessions ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능
CREATE POLICY "Anyone can read rankings"
  ON rankings FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read cognitive_sessions"
  ON cognitive_sessions FOR SELECT
  USING (true);

-- 누구나 쓰기 가능
CREATE POLICY "Anyone can insert rankings"
  ON rankings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can insert cognitive_sessions"
  ON cognitive_sessions FOR INSERT
  WITH CHECK (true);

-- 4. 인덱스 (빠른 조회용)
CREATE INDEX IF NOT EXISTS idx_rankings_composite ON rankings (composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_created ON rankings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cognitive_device ON cognitive_sessions (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cognitive_created ON cognitive_sessions (created_at DESC);
