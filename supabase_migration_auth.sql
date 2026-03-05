-- =============================================
-- Cube Pattern Game — Auth Migration
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- =============================================

-- 1. 프로필 테이블 (닉네임 저장)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nickname TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 기존 테이블에 user_id 컬럼 추가
ALTER TABLE rankings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE cognitive_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 3. 기존 device_id 기반 데이터 정리 (선택사항 — 이전 데이터 삭제)
-- DELETE FROM rankings WHERE user_id IS NULL;
-- DELETE FROM cognitive_sessions WHERE user_id IS NULL;

-- 4. RLS 정책 업데이트

-- profiles: 누구나 읽기, 본인만 쓰기
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read profiles"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- rankings: 기존 정책 삭제 후 재생성
DROP POLICY IF EXISTS "Anyone can read rankings" ON rankings;
DROP POLICY IF EXISTS "Anyone can insert rankings" ON rankings;

CREATE POLICY "Anyone can read rankings"
  ON rankings FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert rankings"
  ON rankings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- cognitive_sessions: 기존 정책 삭제 후 재생성
DROP POLICY IF EXISTS "Anyone can read cognitive_sessions" ON cognitive_sessions;
DROP POLICY IF EXISTS "Anyone can insert cognitive_sessions" ON cognitive_sessions;

CREATE POLICY "Users can read own cognitive_sessions"
  ON cognitive_sessions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cognitive_sessions"
  ON cognitive_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. 회원가입 시 자동 프로필 생성 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nickname', '익명'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
