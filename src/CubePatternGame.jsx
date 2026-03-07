import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabaseClient";
const FACE_COLORS = {
  front: "#FF3B5C",
  back: "#00C9A7",
  top: "#FFD93D",
  bottom: "#6C5CE7",
  left: "#FF8A5C",
  right: "#4DA8FF",
};
const FACE_NAMES = {
  front: "앞면",
  back: "뒷면",
  top: "윗면",
  bottom: "아랫면",
  left: "왼쪽",
  right: "오른쪽",
};
const FACE_KEYS = ["front", "back", "top", "bottom", "left", "right"];

const MODE_ICONS = { color: "🎨", number: "3" };
const FACE_CONTENT = {
  number: { front: "1", back: "2", top: "3", bottom: "4", left: "5", right: "6" },
};

// ─── Level Design (1~10) ───
// Each level: { patternLength, rounds, timeLimit (ms) }
const LEVEL_CONFIG = [
  { patternLength: 3, rounds: 3, timeLimit: 15000 },  // Lv1: 3개 패턴 × 3라운드, 15초
  { patternLength: 3, rounds: 4, timeLimit: 12000 },  // Lv2: 3개 패턴 × 4라운드, 12초
  { patternLength: 4, rounds: 3, timeLimit: 12000 },  // Lv3: 4개 패턴 × 3라운드, 12초
  { patternLength: 4, rounds: 4, timeLimit: 10000 },  // Lv4: 4개 패턴 × 4라운드, 10초
  { patternLength: 5, rounds: 3, timeLimit: 10000 },  // Lv5: 5개 패턴 × 3라운드, 10초
  { patternLength: 5, rounds: 4, timeLimit: 9000 },   // Lv6: 5개 패턴 × 4라운드, 9초
  { patternLength: 6, rounds: 3, timeLimit: 8000 },   // Lv7: 6개 패턴 × 3라운드, 8초
  { patternLength: 6, rounds: 4, timeLimit: 7000 },   // Lv8: 6개 패턴 × 4라운드, 7초
  { patternLength: 7, rounds: 3, timeLimit: 7000 },   // Lv9: 7개 패턴 × 3라운드, 7초
  { patternLength: 8, rounds: 4, timeLimit: 6000 },   // Lv10: 8개 패턴 × 4라운드, 6초
];
const MAX_LEVEL = LEVEL_CONFIG.length;

function getLevelConfig(lvl) {
  const idx = Math.min(lvl, MAX_LEVEL) - 1;
  return LEVEL_CONFIG[Math.max(0, idx)];
}

// Safari-compatible 3D style helpers
const preserve3d = { transformStyle: "preserve-3d", WebkitTransformStyle: "preserve-3d" };
const hiddenBack = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

// ─── Sound Engine (Web Audio API) ───
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

const FACE_NOTES = {
  front: 523.25,  // C5
  back: 587.33,   // D5
  top: 659.25,    // E5
  bottom: 698.46, // F5
  left: 783.99,   // G5
  right: 880.00,  // A5
};

function playTone(freq, duration = 0.15, type = "sine", volume = 0.3) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playFaceSound(faceKey) {
  playTone(FACE_NOTES[faceKey] || 523.25, 0.2, "sine", 0.25);
}

function playCorrectSound() {
  const ctx = getAudioCtx();
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.15, "sine", 0.25), i * 80);
  });
}

function playWrongSound() {
  playTone(200, 0.3, "sawtooth", 0.2);
  setTimeout(() => playTone(180, 0.3, "sawtooth", 0.2), 100);
}

function playComboSound(comboCount) {
  const base = 600 + comboCount * 50;
  [0, 1, 2].forEach((i) => {
    setTimeout(() => playTone(base + i * 100, 0.12, "triangle", 0.2), i * 60);
  });
}

function playLevelUpSound() {
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.2, "sine", 0.25), i * 100);
  });
}

function playGameOverSound() {
  [400, 350, 300, 250].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.3, "triangle", 0.2), i * 150);
  });
}

function playStartSound() {
  [392, 523.25, 659.25, 783.99].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.15, "sine", 0.3), i * 80);
  });
}

function playTickSound() {
  playTone(1000, 0.05, "square", 0.15);
}

// ─── Timer formatting ───
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return min > 0
    ? `${min}:${String(sec).padStart(2, "0")}.${tenths}`
    : `${sec}.${tenths}`;
}

// ─── Ranking composite score ───
function calculateCompositeScore(score, timeMs, accuracy) {
  const timeSec = Math.max(timeMs / 1000, 1);
  const timeBonus = Math.max(0, 1000 - timeSec * 2);
  const accuracyMultiplier = accuracy / 100;
  return Math.round((score + timeBonus) * accuracyMultiplier);
}

// ─── D-Day calculation ───
function getDDayCount() {
  const event = new Date(2026, 2, 30); // 2026.03.30
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  event.setHours(0, 0, 0, 0);
  return Math.ceil((event - today) / (1000 * 60 * 60 * 24));
}

// ─── Device ID for identifying this browser ───
const DEVICE_ID_KEY = "cubePatternDeviceId";
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ─── Ranking: local cache keys ───
const RANKING_STORAGE_KEY = "cubePatternRankings";
const MAX_RANKINGS = 50;

function filterBestPerUser(rankings) {
  const best = new Map();
  for (const r of rankings) {
    const key = r.userId || r.playerName || "unknown";
    if (!best.has(key) || (r.compositeScore || 0) > (best.get(key).compositeScore || 0)) {
      best.set(key, r);
    }
  }
  return [...best.values()].sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));
}
function loadRankingsLocal() {
  try {
    const data = localStorage.getItem(RANKING_STORAGE_KEY);
    return data ? filterBestPerUser(JSON.parse(data)) : [];
  } catch { return []; }
}
function persistRankingsLocal(r) {
  try { localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(r)); } catch {}
}

// ─── Supabase: Rankings ───
async function fetchRankingsFromDB() {
  if (!supabase) return loadRankingsLocal();
  try {
    const { data, error } = await supabase
      .from("rankings")
      .select("*")
      .order("composite_score", { ascending: false });
    if (error) throw error;
    const all = (data || []).map((r) => ({
      score: r.score, level: r.level, time: r.time,
      accuracy: r.accuracy, compositeScore: r.composite_score,
      gameMode: r.game_mode, date: r.created_at,
      playerName: r.player_name || "익명",
      userId: r.user_id,
    }));
    return filterBestPerUser(all).slice(0, MAX_RANKINGS);
  } catch {
    return loadRankingsLocal();
  }
}
async function insertRankingToDB(entry, userId) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from("rankings").insert({
      score: entry.score, level: entry.level, time: entry.time,
      accuracy: entry.accuracy, composite_score: entry.compositeScore,
      game_mode: entry.gameMode, player_name: entry.playerName || "익명",
      user_id: userId,
    });
    if (error) throw error;
  } catch {
    // fallback: save locally only
  }
}

// ─── Cognitive Report: local cache ───
const COGNITIVE_STORAGE_KEY = "cubePatternCognitive";

function loadCognitiveLocal() {
  try {
    const data = localStorage.getItem(COGNITIVE_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}
function persistCognitiveLocal(history) {
  try { localStorage.setItem(COGNITIVE_STORAGE_KEY, JSON.stringify(history)); } catch {}
}

// ─── Supabase: Cognitive Sessions ───
async function fetchCognitiveFromDB(userId) {
  if (!supabase || !userId) return loadCognitiveLocal();
  try {
    const { data, error } = await supabase
      .from("cognitive_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map((s) => ({
      score: s.score, level: s.level, time: s.time,
      accuracy: s.accuracy, maxCombo: s.max_combo,
      gameMode: s.game_mode, date: s.created_at,
    }));
  } catch {
    return loadCognitiveLocal();
  }
}
async function insertCognitiveToDB(session, userId) {
  if (!supabase || !userId) return;
  try {
    const { error } = await supabase.from("cognitive_sessions").insert({
      score: session.score, level: session.level, time: session.time,
      accuracy: session.accuracy, max_combo: session.maxCombo,
      game_mode: session.gameMode, user_id: userId,
    });
    if (error) throw error;
  } catch {
    // fallback: saved locally already
  }
}

// ─── Supabase: Fetch user nickname ───
async function fetchNickname(userId) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data?.nickname || null;
  } catch { return null; }
}

// ─── Supabase: Fetch user avatar URL ───
async function fetchAvatarUrl(userId) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data?.avatar_url || null;
  } catch { return null; }
}

// ─── Supabase: Upload avatar to storage ───
async function uploadAvatar(userId, file) {
  if (!supabase || !userId || !file) return null;
  const fileExt = file.name.split(".").pop();
  const filePath = `${userId}/avatar.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data: { publicUrl } } = supabase.storage
    .from("avatars")
    .getPublicUrl(filePath);
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", userId);
  if (updateError) throw updateError;
  return publicUrl;
}

// ─── Cognitive metrics calculation ───
function calculateCognitiveMetrics(history) {
  if (!history || history.length === 0) {
    return {
      memory: 0, reaction: 0, pattern: 0, focus: 0, creativity: 0,
      memoryTrend: [], reactionTrend: [], patternTrend: [], focusTrend: [], creativityTrend: [],
      totalSessions: 0, preventionScore: 0,
    };
  }

  const sessions = history.slice(-30); // Last 30 sessions for trends
  const totalSessions = history.length;

  // Calculate per-session metrics (normalized to 0-100)
  const perSession = sessions.map((s) => {
    const maxLevel = s.level || 1;
    const accuracy = s.accuracy || 0;
    const timeSec = Math.max((s.time || 0) / 1000, 1);
    const score = s.score || 0;
    const combo = s.maxCombo || 0;

    // Memory: based on max level reached (higher level = longer pattern memorized)
    const memory = Math.min(100, maxLevel * 12 + accuracy * 0.3);
    // Reaction: faster completion = better (inverse of avg time per pattern)
    const avgTimePerPattern = timeSec / Math.max(maxLevel, 1);
    const reaction = Math.min(100, Math.max(10, 100 - avgTimePerPattern * 5));
    // Pattern recognition: accuracy + level combo
    const pattern = Math.min(100, accuracy * 0.6 + maxLevel * 6);
    // Focus: consistency (high accuracy under time pressure)
    const focus = Math.min(100, accuracy * 0.5 + (combo > 0 ? combo * 8 : 0) + (maxLevel > 3 ? 20 : maxLevel * 6));
    // Creativity: mode variety + handling different pattern types
    const modeBonus = s.gameMode === "number" ? 10 : 5;
    const creativity = Math.min(100, score * 0.015 + modeBonus + maxLevel * 5);

    return { memory, reaction, pattern, focus, creativity, date: s.date };
  });

  // Current values (average of last 5 sessions, or all if fewer)
  const recent = perSession.slice(-5);
  const avg = (arr, key) => arr.reduce((sum, s) => sum + s[key], 0) / arr.length;

  const memory = Math.round(avg(recent, "memory"));
  const reaction = Math.round(avg(recent, "reaction"));
  const pattern = Math.round(avg(recent, "pattern"));
  const focus = Math.round(avg(recent, "focus"));
  const creativity = Math.round(avg(recent, "creativity"));

  // Trends (for graph: last N sessions)
  const memoryTrend = perSession.map((s) => Math.round(s.memory));
  const reactionTrend = perSession.map((s) => Math.round(s.reaction));
  const patternTrend = perSession.map((s) => Math.round(s.pattern));
  const focusTrend = perSession.map((s) => Math.round(s.focus));
  const creativityTrend = perSession.map((s) => Math.round(s.creativity));

  // Prevention score: based on overall progress + consistency
  const overallAvg = (memory + reaction + pattern + focus + creativity) / 5;
  const sessionFactor = Math.min(1, totalSessions / 20); // reaches max weight at 20 sessions
  const preventionScore = Math.min(95, Math.round(overallAvg * 0.6 * sessionFactor + totalSessions * 1.2));

  return {
    memory, reaction, pattern, focus, creativity,
    memoryTrend, reactionTrend, patternTrend, focusTrend, creativityTrend,
    totalSessions, preventionScore,
  };
}

function generatePattern(length) {
  const arr = [];
  for (let i = 0; i < length; i++) {
    arr.push(FACE_KEYS[Math.floor(Math.random() * 6)]);
  }
  return arr;
}
function Cube3D({ rotX, rotY, onFaceClick, highlightFace, scale = 1, unfolded = false, glowEdges = false, edgeBreathing = false, gameMode = "color", lidOpen = false, droppingIcon = null }) {
  const s = 100 * scale;
  const w = s, h = s, d = s;

  // Timing: fold is staggered, unfold is instant
  const fDur = "0.6s";
  const fEase = "cubic-bezier(0.4, 0, 0.2, 1)";
  const uDur = "0.5s";
  const uEase = "cubic-bezier(0.34, 1.3, 0.64, 1)";
  const dur = unfolded ? uDur : fDur;
  const ease = unfolded ? uEase : fEase;
  const dl = {
    lr: unfolded ? 0 : 0.1,
    tb: unfolded ? 0 : 0.35,
    back: unfolded ? 0 : 0.9,
    pivot: unfolded ? 0 : 0.2,
  };

  const faceStyle = (key, fw, fh) => ({
    position: "absolute",
    width: fw, height: fh, left: 0, top: 0,
    background: FACE_COLORS[key],
    ...hiddenBack,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer",
    border: highlightFace === key ? "4px solid #fff" : "2px solid rgba(255,255,255,0.15)",
    borderRadius: 3,
    boxShadow: highlightFace === key
      ? "0 0 20px rgba(255,255,255,0.6)"
      : "inset 0 0 30px rgba(0,0,0,0.15)",
    fontFamily: "'Outfit', sans-serif",
    fontSize: 14 * scale,
    color: "rgba(255,255,255,0.9)",
    fontWeight: 600, letterSpacing: 1,
    textTransform: "uppercase", userSelect: "none",
    WebkitUserSelect: "none",
    transition: "border 0.2s, box-shadow 0.2s",
  });

  const click = (key) => (e) => { e.stopPropagation(); onFaceClick && onFaceClick(key); };

  const fc = (key) => {
    if (gameMode === "color") return null;
    const content = FACE_CONTENT[gameMode]?.[key];
    if (!content) return null;
    const isNum = gameMode === "number";
    const needsFlip = key === "back" && isNum;
    return (
      <span style={{
        fontSize: isNum ? s * 0.52 : s * 0.55,
        fontWeight: isNum ? 900 : 400,
        color: "rgba(0,0,0,0.6)",
        pointerEvents: "none",
        userSelect: "none", WebkitUserSelect: "none",
        lineHeight: 1,
        filter: isNum ? "none" : "brightness(0)",
        opacity: isNum ? 1 : 0.55,
        transform: needsFlip ? "rotate(180deg)" : "none",
        display: "inline-block",
      }}>{content}</span>
    );
  };

  // Edge glow setup — burst on start, subtle breathing during play
  const eT = 3;
  const edgeBase = (idx) => ({
    position: "absolute", borderRadius: eT, pointerEvents: "none",
    background: "rgba(255,220,180,0.9)",
    opacity: 0,
    animation: glowEdges && !unfolded
      ? `edgeBurst 2s ease-out ${idx * 0.04}s forwards`
      : edgeBreathing && !unfolded
        ? `edgeBreathe 5s ease-in-out ${idx * 0.4}s infinite`
        : "none",
  });
  const hE = (x, y, z, len, idx) => ({ ...edgeBase(idx), left: x, top: y - eT / 2, width: len, height: eT, transform: `translateZ(${z}px)` });
  const vE = (x, y, z, len, idx) => ({ ...edgeBase(idx), left: x - eT / 2, top: y, width: eT, height: len, transform: `translateZ(${z}px)` });

  return (
    <div style={{ perspective: "800px", WebkitPerspective: "800px", perspectiveOrigin: "50% 50%", WebkitPerspectiveOrigin: "50% 50%" }}>
      {/* Rotation layer — NO transition, instant drag response */}
      <div style={{
        width: w, height: h, position: "relative", ...preserve3d,
        transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
      }}>
      {/* Fold offset layer — animated translateZ only */}
      <div style={{
        width: w, height: h, position: "relative", ...preserve3d,
        transform: `translateZ(${unfolded ? 0 : d / 2}px)`,
        transition: `transform 0.8s ${ease} ${dl.pivot}s`,
      }}>
        {/* ─── FRONT (anchor, stays flat at z=0) ─── */}
        <div onClick={click("front")} style={faceStyle("front", w, h)}>{fc("front")}</div>

        {/* ─── TOP (fold wrapper: hinge at front edge for cube assembly) ─── */}
        <div style={{
          position: "absolute", left: 0, top: -d, width: w, height: d,
          ...preserve3d, transformOrigin: "center bottom",
          transform: `rotateX(${unfolded ? 0 : 90}deg)`,
          transition: `transform ${dur} ${ease} ${dl.tb}s`,
        }}>
          {/* Lid wrapper: hinge at BACK edge (center top), opens upward toward viewer */}
          <div style={{
            position: "absolute", left: 0, top: 0, width: w, height: d,
            ...preserve3d, transformOrigin: "center top",
            transform: `rotateX(${lidOpen ? 110 : 0}deg)`,
            transition: "transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}>
            {/* Outer face of lid (colored) */}
            <div onClick={click("top")} style={faceStyle("top", w, d)}>{fc("top")}</div>
            {/* Inner face of lid (dark) — visible when lid opens */}
            <div style={{
              position: "absolute", left: 0, top: 0, width: w, height: d,
              background: "linear-gradient(180deg, #1a1a2e 0%, #111128 100%)",
              transform: "rotateX(180deg)",
              ...hiddenBack,
              borderRadius: 3,
              border: "2px solid rgba(255,255,255,0.08)",
              boxShadow: "inset 0 0 20px rgba(0,0,0,0.5)",
            }} />
          </div>
        </div>

        {/* ─── BOTTOM + BACK (bottom hinges at front's bottom edge) ─── */}
        <div style={{
          position: "absolute", left: 0, top: h, width: w, height: d + h,
          ...preserve3d, transformOrigin: "center top",
          transform: `rotateX(${unfolded ? 0 : -90}deg)`,
          transition: `transform ${dur} ${ease} ${dl.tb}s`,
        }}>
          <div onClick={click("bottom")} style={faceStyle("bottom", w, d)}>{fc("bottom")}</div>
          {/* BACK (hinges at bottom's far edge, child so it folds WITH bottom) */}
          <div style={{
            position: "absolute", left: 0, top: d, width: w, height: h,
            ...preserve3d, transformOrigin: "center top",
            transform: `rotateX(${unfolded ? 0 : -90}deg)`,
            transition: `transform ${dur} ${ease} ${dl.back}s`,
          }}>
            <div onClick={click("back")} style={faceStyle("back", w, h)}>{fc("back")}</div>
          </div>
        </div>

        {/* ─── LEFT (hinges at front's left edge) ─── */}
        <div style={{
          position: "absolute", left: -d, top: 0, width: d, height: h,
          ...preserve3d, transformOrigin: "right center",
          transform: `rotateY(${unfolded ? 0 : -90}deg)`,
          transition: `transform ${dur} ${ease} ${dl.lr}s`,
        }}>
          <div onClick={click("left")} style={faceStyle("left", d, h)}>{fc("left")}</div>
        </div>

        {/* ─── RIGHT (hinges at front's right edge) ─── */}
        <div style={{
          position: "absolute", left: w, top: 0, width: d, height: h,
          ...preserve3d, transformOrigin: "left center",
          transform: `rotateY(${unfolded ? 0 : 90}deg)`,
          transition: `transform ${dur} ${ease} ${dl.lr}s`,
        }}>
          <div onClick={click("right")} style={faceStyle("right", d, h)}>{fc("right")}</div>
        </div>

        {/* ─── DARK INNER SHELL (fills gaps between rounded faces) ─── */}
        <div style={{
          position: "absolute", left: 0, top: 0, width: s, height: s,
          ...preserve3d,
          transform: `translateZ(${-s / 2}px)`,
          pointerEvents: "none",
          opacity: unfolded ? 0 : 1,
          transition: "opacity 0.3s",
        }}>
          {[
            `translateZ(${s / 2 - 0.5}px)`,
            `translateZ(${-(s / 2 - 0.5)}px)`,
            `translateY(${-(s / 2 - 0.5)}px) rotateX(90deg)`,
            `translateY(${s / 2 - 0.5}px) rotateX(-90deg)`,
            `translateX(${-(s / 2 - 0.5)}px) rotateY(-90deg)`,
            `translateX(${s / 2 - 0.5}px) rotateY(90deg)`,
          ].map((tf, i) => (
            <div key={`sh${i}`} style={{
              position: "absolute", left: 0, top: 0,
              width: s, height: s,
              background: "#111128",
              transform: tf,
              ...hiddenBack,
            }} />
          ))}
        </div>

        {/* ─── EDGE GLOW (8 seam edges where faces meet) ─── */}
        {/* Front face seams (z=-0.1, tucked just behind front surface) */}
        <div style={hE(0, 0, -0.1, w, 0)} />
        <div style={hE(0, h, -0.1, w, 3)} />
        <div style={vE(0, 0, -0.1, h, 1)} />
        <div style={vE(w, 0, -0.1, h, 4)} />
        {/* Back face seams (z=-d+0.1, tucked just inside back surface) */}
        <div style={hE(0, 0, -d + 0.1, w, 6)} />
        <div style={hE(0, h, -d + 0.1, w, 9)} />
        <div style={vE(0, 0, -d + 0.1, h, 7)} />
        <div style={vE(w, 0, -d + 0.1, h, 10)} />

        {/* ─── DROPPING ICON (inside 3D space, occluded by cube faces) ─── */}
        {droppingIcon && (
          <div style={{
            position: "absolute",
            left: w / 2, top: h / 2,
            width: 0, height: 0,
            ...preserve3d,
            transform: `translateZ(${-d / 2}px)`,
            pointerEvents: "none",
          }}>
            <div style={{
              position: "absolute",
              left: 0, top: 0,
              transform: "translate(-50%, -50%)",
              animation: "dropInCube3D 1s cubic-bezier(0.45, 0.05, 0.55, 0.95) forwards",
              fontSize: s * 0.4,
              filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.6))",
              lineHeight: 1,
            }}>
              {droppingIcon}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
function ColorDot({ faceKey, size = 36, showLabel = false, dim = false, pulse = false, gameMode = "color" }) {
  const content = gameMode !== "color" ? FACE_CONTENT[gameMode]?.[faceKey] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: FACE_COLORS[faceKey],
          border: "3px solid rgba(255,255,255,0.3)",
          opacity: dim ? 0.3 : 1,
          animation: pulse ? "dotPulse 0.4s ease-out" : "none",
          boxShadow: `0 2px 12px ${FACE_COLORS[faceKey]}66`,
          transition: "opacity 0.3s",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {content && (
          <span style={{
            fontSize: gameMode === "number" ? size * 0.55 : size * 0.5,
            fontWeight: gameMode === "number" ? 800 : 400,
            lineHeight: 1,
            color: gameMode === "number" ? "rgba(255,255,255,0.95)" : undefined,
            filter: gameMode !== "number" ? "brightness(0) invert(1)" : "none",
            opacity: gameMode !== "number" ? 0.85 : 1,
          }}>{content}</span>
        )}
      </div>
      {showLabel && (
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'Outfit', sans-serif" }}>
          {FACE_NAMES[faceKey]}
        </span>
      )}
    </div>
  );
}
const ProgressRing = ({ value, color, size = 52, stroke = 4 }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease-out" }} />
    </svg>
  );
};

function AnimatedNumber({ value, color, fontSize, fontWeight = 700, suffix = "", duration = 1000 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const start = performance.now();
    let raf;
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span style={{ fontSize, fontWeight, color }}>{display}{suffix}</span>;
}

export default function CubePatternGame() {
  // ─── Auth state ───
  const [user, setUser] = useState(null); // Supabase user object
  const [nickname, setNickname] = useState("");
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup" | "forgot" | "reset"
  const [authLoading, setAuthLoading] = useState(true); // true while checking session
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState(""); // success message (e.g. reset email sent)
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authNickname, setAuthNickname] = useState("");
  const [authNewPassword, setAuthNewPassword] = useState(""); // for password reset
  const [authConfirmPassword, setAuthConfirmPassword] = useState(""); // for password reset confirm

  // ─── Profile/Avatar state ───
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const avatarInputRef = useRef(null);

  const [rotX, setRotX] = useState(-20);
  const [rotY, setRotY] = useState(30);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const isDragMove = useRef(false);
  // Inertia refs for horizontal rotation
  const velocityY = useRef(0);
  const lastMoveTime = useRef(0);
  const animFrameId = useRef(null);
  const isInertia = useRef(false);
  // Prevent double-processing on iOS (both pointer + touch events fire)
  const activeInput = useRef(null); // 'pointer' | 'touch' | null
  const [gameState, setGameState] = useState("idle");
  const [level, setLevel] = useState(1);
  const [currentRound, setCurrentRound] = useState(1); // round within current level
  const [score, setScore] = useState(0);
  const [pattern, setPattern] = useState([]);
  const [showIndex, setShowIndex] = useState(-1);
  const [playerInput, setPlayerInput] = useState([]);
  const [message, setMessage] = useState("");
  const [highlightFace, setHighlightFace] = useState(null);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const maxComboRef = useRef(0);
  const [bestScore, setBestScore] = useState(0);
  const [shakeAnim, setShakeAnim] = useState(false);
  const [cubeUnfolded, setCubeUnfolded] = useState(false);
  const [glowEdges, setGlowEdges] = useState(false);
  const [edgeBreathing, setEdgeBreathing] = useState(false);
  const [gameMode, setGameMode] = useState("color");
  const [lidOpen, setLidOpen] = useState(false);
  const [droppingIcon, setDroppingIcon] = useState(null);
  // Idle preview cube animation state
  const [previewAnim, setPreviewAnim] = useState(null); // null | "zooming" | "lidOpen" | "dropping" | "lidClose" | "waiting" | "returning"
  const [pendingMode, setPendingMode] = useState(null);
  // Timer
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);
  const timerStartRef = useRef(0);
  // Accuracy
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [correctAttempts, setCorrectAttempts] = useState(0);
  // Rankings
  const [rankings, setRankings] = useState([]);
  const [showRanking, setShowRanking] = useState(false);
  // Cognitive Report
  const [showReport, setShowReport] = useState(false);
  const [reportDetailOpen, setReportDetailOpen] = useState(false);
  const [reportAnimReady, setReportAnimReady] = useState(false);
  const [detailAnimReady, setDetailAnimReady] = useState(false);
  const [cognitiveHistory, setCognitiveHistory] = useState([]);
  // Event modal
  const [showEventModal, setShowEventModal] = useState(true);
  const [top3Avatars, setTop3Avatars] = useState({});
  // Round countdown (dynamic per level)
  const levelConfig = getLevelConfig(level);
  const ROUND_TIME_LIMIT = levelConfig.timeLimit;
  const [roundTimeLeft, setRoundTimeLeft] = useState(ROUND_TIME_LIMIT);
  const roundTimerRef = useRef(null);
  const roundTimeoutRef = useRef(null);
  const patternLength = levelConfig.patternLength;
  const accuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 100;

  // ─── Timer controls ───
  const startTimer = useCallback(() => {
    timerStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + (Date.now() - timerStartRef.current));
      timerStartRef.current = Date.now();
    }, 100);
  }, []);
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      setElapsedTime((prev) => prev + (Date.now() - timerStartRef.current));
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const resetTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setElapsedTime(0);
    timerStartRef.current = 0;
  }, []);

  // ─── Round countdown helpers ───
  const clearRoundTimer = useCallback(() => {
    if (roundTimerRef.current) { clearInterval(roundTimerRef.current); roundTimerRef.current = null; }
    if (roundTimeoutRef.current) { clearTimeout(roundTimeoutRef.current); roundTimeoutRef.current = null; }
  }, []);

  // ─── Auth: check session on mount + listen for changes ───
  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user || null;
      setUser(u);
      setAuthLoading(false);
      if (u) {
        fetchNickname(u.id).then((n) => { if (n) setNickname(n); });
        fetchAvatarUrl(u.id).then((url) => { if (url) setAvatarUrl(url); });
      }
    });
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUser(u);
      if (_event === "PASSWORD_RECOVERY") {
        setAuthMode("reset");
        setAuthError("");
        setAuthSuccess("");
        setAuthNewPassword("");
        setAuthConfirmPassword("");
      }
      if (u) {
        fetchNickname(u.id).then((n) => { if (n) setNickname(n); });
        fetchAvatarUrl(u.id).then((url) => { if (url) setAvatarUrl(url); });
      } else {
        setNickname("");
        setAvatarUrl(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Load rankings + cognitive history (after auth resolved) ───
  useEffect(() => {
    // Local cache first
    const localRankings = loadRankingsLocal();
    setRankings(localRankings);
    if (localRankings.length > 0) setBestScore(Math.max(...localRankings.map((r) => r.score)));
    const localCognitive = loadCognitiveLocal();
    setCognitiveHistory(localCognitive);

    // Fetch from Supabase
    (async () => {
      const dbRankings = await fetchRankingsFromDB();
      if (dbRankings.length > 0) {
        setRankings(dbRankings);
        persistRankingsLocal(dbRankings);
        setBestScore(Math.max(...dbRankings.map((r) => r.score)));
      }
      if (user) {
        const dbCognitive = await fetchCognitiveFromDB(user.id);
        if (dbCognitive.length > 0) {
          setCognitiveHistory(dbCognitive);
          persistCognitiveLocal(dbCognitive);
        }
      }
    })();
  }, [user]);

  // ─── Fetch top 3 user avatars when rankings change ───
  useEffect(() => {
    if (rankings.length === 0) return;
    const top3 = rankings.slice(0, 3);
    const userIds = top3.map(r => r.userId).filter(Boolean);
    if (userIds.length === 0) return;
    (async () => {
      const avatarMap = {};
      await Promise.all(userIds.map(async (uid) => {
        const [avatar, name] = await Promise.all([
          fetchAvatarUrl(uid),
          fetchNickname(uid),
        ]);
        avatarMap[uid] = { avatar, name };
      }));
      setTop3Avatars(avatarMap);
    })();
  }, [rankings]);

  // ─── Auth handlers ───
  const handleSignUp = async () => {
    if (!supabase) return;
    if (!authNickname.trim()) { setAuthError("닉네임을 입력해주세요"); return; }
    if (!authEmail.trim()) { setAuthError("이메일을 입력해주세요"); return; }
    if (authPassword.length < 6) { setAuthError("비밀번호는 6자 이상이어야 합니다"); return; }
    setAuthLoading(true); setAuthError("");
    const { error } = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
      options: { data: { nickname: authNickname.trim() } },
    });
    setAuthLoading(false);
    if (error) { setAuthError(error.message); return; }
    setNickname(authNickname.trim());
  };
  const handleLogin = async () => {
    if (!supabase) return;
    if (!authEmail.trim() || !authPassword) { setAuthError("이메일과 비밀번호를 입력해주세요"); return; }
    setAuthLoading(true); setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });
    setAuthLoading(false);
    if (error) { setAuthError(error.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 틀렸습니다" : error.message); }
  };
  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setNickname("");
    setAvatarUrl(null);
    setShowProfileModal(false);
    setCognitiveHistory([]);
  };
  const handleAvatarFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };
  const handleAvatarUpload = async () => {
    if (!avatarFile || !user) return;
    setAvatarUploading(true);
    try {
      const url = await uploadAvatar(user.id, avatarFile);
      if (url) {
        setAvatarUrl(url + "?t=" + Date.now());
        setAvatarFile(null);
        setAvatarPreview(null);
        setShowProfileModal(false);
      }
    } catch (err) {
      console.error("Avatar upload failed:", err);
    } finally {
      setAvatarUploading(false);
    }
  };
  const handleForgotPassword = async () => {
    if (!supabase) return;
    if (!authEmail.trim()) { setAuthError("이메일을 입력해주세요"); return; }
    setAuthLoading(true); setAuthError(""); setAuthSuccess("");
    const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
      redirectTo: window.location.hostname === "localhost" ? "https://3-dtest-deploy-2026.vercel.app" : window.location.origin,
    });
    setAuthLoading(false);
    if (error) { setAuthError(error.message); return; }
    setAuthSuccess("비밀번호 재설정 링크를 이메일로 보냈습니다. 이메일을 확인해주세요.");
  };
  const handleResetPassword = async () => {
    if (!supabase) return;
    if (authNewPassword.length < 6) { setAuthError("비밀번호는 6자 이상이어야 합니다"); return; }
    if (authNewPassword !== authConfirmPassword) { setAuthError("비밀번호가 일치하지 않습니다"); return; }
    setAuthLoading(true); setAuthError(""); setAuthSuccess("");
    const { error } = await supabase.auth.updateUser({ password: authNewPassword });
    setAuthLoading(false);
    if (error) { setAuthError(error.message); return; }
    setAuthSuccess("비밀번호가 변경되었습니다! 잠시 후 게임이 시작됩니다.");
    setAuthNewPassword(""); setAuthConfirmPassword("");
    setTimeout(() => { setAuthMode("login"); setAuthSuccess(""); }, 2000);
  };

  // ─── Timer cleanup on unmount ───
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearRoundTimer();
    };
  }, [clearRoundTimer]);

  // ─── Round countdown: start on "input", clear otherwise ───
  const roundTimeoutHandler = useRef(null);
  useEffect(() => {
    if (gameState === "input") {
      setRoundTimeLeft(ROUND_TIME_LIMIT);
      const start = Date.now();
      let lastTickSec = -1;
      roundTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, ROUND_TIME_LIMIT - (Date.now() - start));
        setRoundTimeLeft(remaining);
        const secLeft = Math.ceil(remaining / 1000);
        if (secLeft <= 3 && secLeft > 0 && secLeft !== lastTickSec) {
          lastTickSec = secLeft;
          playTickSound();
        }
      }, 50);
      roundTimeoutRef.current = setTimeout(() => {
        // Time's up — call the handler ref (always has fresh closure)
        if (roundTimeoutHandler.current) roundTimeoutHandler.current();
      }, ROUND_TIME_LIMIT);
    } else {
      clearRoundTimer();
    }
    return () => clearRoundTimer();
  }, [gameState, clearRoundTimer]);

  const startGame = () => {
    playStartSound();
    setScore(0);
    setLevel(1);
    setCurrentRound(1);
    setLives(3);
    setCombo(0);
    maxComboRef.current = 0;
    setTotalAttempts(0);
    setCorrectAttempts(0);
    resetTimer();
    setShowRanking(false);
    setShowReport(false);
    setRotX(-20);
    setRotY(30);
    setGameState("folding");
    setMessage("");
    setCubeUnfolded(false);
    setGlowEdges(false);
    setEdgeBreathing(false);
    // Phase 1 (0-600ms): overlay fades out
    // Phase 2 (600ms): edge burst fires from seams
    setTimeout(() => setGlowEdges(true), 600);
    // Phase 3 (2800ms): burst done, switch to breathing
    setTimeout(() => { setGlowEdges(false); setEdgeBreathing(true); }, 2800);
    // Phase 4 (3200ms): game starts (timer starts after pattern shown)
    setTimeout(() => { startRound(1, 1); }, 3200);
  };
  const handleModeSelect = (mode) => {
    if (mode === gameMode) return;
    if (gameState === "folding" || gameState === "lidAnim") return;
    if (previewAnim) return; // prevent double-click during animation

    // For gameover: just change mode directly (no preview cube visible)
    if (gameState === "gameover") {
      setGameMode(mode);
      return;
    }
    // For idle: animate preview cube in-place
    if (gameState === "idle") {
      setPendingMode(mode);
      setPreviewAnim("zooming"); // zoom in (0.4s)
      setTimeout(() => setPreviewAnim("lidOpen"), 400); // lid opens (0.5s transition)
      setTimeout(() => setPreviewAnim("dropping"), 900); // icon drops (0.7s)
      setTimeout(() => {
        setGameMode(mode);
        setPreviewAnim("lidClose"); // lid closes (0.5s transition)
      }, 1600);
      setTimeout(() => setPreviewAnim("waiting"), 2100); // wait 1s
      setTimeout(() => setPreviewAnim("returning"), 3100); // zoom out (0.5s)
      setTimeout(() => { setPreviewAnim(null); setPendingMode(null); }, 3600); // done
      return;
    }

    // For during gameplay
    const wasPlaying = true;
    resetTimer();
    setGameState("lidAnim");
    setMessage("");
    setLidOpen(true);
    setTimeout(() => setDroppingIcon(MODE_ICONS[mode]), 800);
    setTimeout(() => {
      setLidOpen(false);
      setDroppingIcon(null);
      setGameMode(mode);
    }, 2000);
    setTimeout(() => {
      setGlowEdges(false);
      setEdgeBreathing(false);
      setGameState("modeReady");
      setMessage("모드가 변경되었습니다!");
    }, 2600);
  };
  const startRound = (lvl, round) => {
    const cfg = getLevelConfig(lvl);
    const p = generatePattern(cfg.patternLength);
    setPattern(p);
    setPlayerInput([]);
    setGameState("showing");
    const roundNum = round || currentRound;
    setMessage(`레벨 ${lvl} (${roundNum}/${cfg.rounds}) — 패턴을 기억하세요!`);
    showPattern(p);
  };
  const showPattern = (p) => {
    let i = 0;
    setShowIndex(-1);
    stopTimer();
    const interval = setInterval(() => {
      if (i < p.length) {
        setShowIndex(i);
        setHighlightFace(p[i]);
        playFaceSound(p[i]);
        setTimeout(() => {
          setHighlightFace(null);
        }, 300);
        i++;
      } else {
        clearInterval(interval);
        setShowIndex(-1);
        setGameState("input");
        setMessage("큐브를 돌려서 면을 터치하세요!");
        startTimer();
      }
    }, 500);
  };
  const handleFaceClick = useCallback(
    (faceKey) => {
      if (gameState !== "input") return;
      if (isDragMove.current) return;
      playFaceSound(faceKey);
      setTotalAttempts((prev) => prev + 1);
      const newInput = [...playerInput, faceKey];
      setPlayerInput(newInput);
      setHighlightFace(faceKey);
      setTimeout(() => setHighlightFace(null), 200);
      const idx = newInput.length - 1;
      if (newInput[idx] !== pattern[idx]) {
        const newLives = lives - 1;
        setLives(newLives);
        setCombo(0);
        playWrongSound();
        setShakeAnim(true);
        setTimeout(() => setShakeAnim(false), 500);
        if (newLives <= 0) {
          stopTimer();
          playGameOverSound();
          setGameState("gameover");
          setGlowEdges(false);
          setEdgeBreathing(false);
          setMessage(`게임 오버! 최종 스코어: ${score}`);
          if (score > bestScore) setBestScore(score);
          // Save ranking (local + Supabase)
          const finalAcc = totalAttempts + 1 > 0 ? Math.round((correctAttempts / (totalAttempts + 1)) * 100) : 0;
          const composite = calculateCompositeScore(score, elapsedTime, finalAcc);
          const entry = { score, level, time: elapsedTime, accuracy: finalAcc, compositeScore: composite, gameMode, playerName: nickname || "익명", date: new Date().toISOString() };
          setBestScore(Math.max(score, bestScore));
          // Supabase insert → then fetch all players' rankings
          const uid = user?.id;
          insertRankingToDB(entry, uid).then(() => {
            fetchRankingsFromDB().then((dbRankings) => {
              if (dbRankings.length > 0) {
                setRankings(dbRankings);
                persistRankingsLocal(dbRankings);
              } else {
                // DB 실패 시 로컬 폴백
                const updated = [...loadRankingsLocal(), entry].sort((a, b) => b.compositeScore - a.compositeScore).slice(0, MAX_RANKINGS);
                persistRankingsLocal(updated);
                setRankings(updated);
              }
            });
          });
          // Save cognitive session (local + Supabase)
          const cogSession = { score, level, time: elapsedTime, accuracy: finalAcc, maxCombo: maxComboRef.current, gameMode, date: new Date().toISOString() };
          const localHistory = loadCognitiveLocal();
          localHistory.push(cogSession);
          persistCognitiveLocal(localHistory);
          setCognitiveHistory(localHistory);
          insertCognitiveToDB(cogSession, uid).then(() => {
            fetchCognitiveFromDB(uid).then((dbCognitive) => {
              if (dbCognitive.length > 0) {
                setCognitiveHistory(dbCognitive);
                persistCognitiveLocal(dbCognitive);
              }
            });
          });
        } else {
          setMessage(`틀렸어요! ❤️ ${newLives}개 남음 — 다시 보여줄게요`);
          setPlayerInput([]);
          setTimeout(() => {
            setGameState("showing");
            showPattern(pattern);
          }, 1200);
        }
        return;
      }
      setCorrectAttempts((prev) => prev + 1);
      if (newInput.length === pattern.length) {
        const newCombo = combo + 1;
        setCombo(newCombo);
        if (newCombo > maxComboRef.current) maxComboRef.current = newCombo;
        const bonus = newCombo >= 3 ? 50 : newCombo >= 2 ? 20 : 0;
        const earned = level * 100 + bonus;
        const newScore = score + earned;
        setScore(newScore);
        if (newCombo >= 2) playComboSound(newCombo);
        else playCorrectSound();
        setMessage(
          bonus > 0
            ? `🔥 ${newCombo}콤보! +${earned}점`
            : `정답! +${earned}점`
        );
        setGameState("correct");
        setTimeout(() => {
          const cfg = getLevelConfig(level);
          if (currentRound < cfg.rounds) {
            // Same level, next round
            const nextRound = currentRound + 1;
            setCurrentRound(nextRound);
            startRound(level, nextRound);
          } else if (level < MAX_LEVEL) {
            // Level cleared! Next level
            playLevelUpSound();
            const nextLvl = level + 1;
            setLevel(nextLvl);
            setCurrentRound(1);
            setMessage(`🎉 레벨 ${level} 클리어!`);
            setTimeout(() => startRound(nextLvl, 1), 800);
          } else {
            // All 10 levels cleared!
            stopTimer();
            playLevelUpSound();
            setGameState("gameover");
            setGlowEdges(false);
            setEdgeBreathing(false);
            const finalScore = newScore;
            if (finalScore > bestScore) setBestScore(finalScore);
            setMessage(`🏆 전 레벨 클리어! 최종 스코어: ${finalScore}`);
            const entry = {
              score: finalScore, level: MAX_LEVEL, time: elapsedTime,
              accuracy: totalAttempts > 0 ? Math.round(((correctAttempts + 1) / (totalAttempts + 1)) * 100) : 100,
              compositeScore: calculateCompositeScore(finalScore, elapsedTime, totalAttempts > 0 ? Math.round(((correctAttempts + 1) / (totalAttempts + 1)) * 100) : 100),
              gameMode, date: new Date().toISOString(),
              playerName: nickname || "익명",
            };
            if (user) {
              insertRankingToDB(entry, user.id).then(() => {
                fetchRankingsFromDB().then((dbR) => {
                  if (dbR.length > 0) { setRankings(dbR); persistRankingsLocal(dbR); }
                });
              });
              saveCognitiveSession({ score: finalScore, level: MAX_LEVEL, time: elapsedTime, accuracy: entry.accuracy, maxCombo: maxComboRef.current, gameMode }, user.id)
                .then((hist) => { if (hist) setCognitiveHistory(hist); });
            }
          }
        }, 1500);
      }
    },
    [gameState, playerInput, pattern, score, level, currentRound, lives, combo, bestScore, totalAttempts, correctAttempts, elapsedTime, gameMode, stopTimer, nickname, user]
  );

  // ─── Round timeout handler (keeps fresh closure via ref) ───
  roundTimeoutHandler.current = () => {
    if (gameState !== "input") return;
    clearRoundTimer();
    setTotalAttempts((prev) => prev + 1);
    const newLives = lives - 1;
    setLives(newLives);
    setCombo(0);
    setShakeAnim(true);
    setTimeout(() => setShakeAnim(false), 500);
    if (newLives <= 0) {
      stopTimer();
      setGameState("gameover");
      setGlowEdges(false);
      setEdgeBreathing(false);
      setMessage(`⏰ 시간 초과! 게임 오버! 최종 스코어: ${score}`);
      if (score > bestScore) setBestScore(score);
      const finalAcc = totalAttempts + 1 > 0 ? Math.round((correctAttempts / (totalAttempts + 1)) * 100) : 0;
      const composite = calculateCompositeScore(score, elapsedTime, finalAcc);
      const entry = { score, level, time: elapsedTime, accuracy: finalAcc, compositeScore: composite, gameMode, playerName: nickname || "익명", date: new Date().toISOString() };
      setBestScore(Math.max(score, bestScore));
      const uid2 = user?.id;
      insertRankingToDB(entry, uid2).then(() => {
        fetchRankingsFromDB().then((dbR) => {
          if (dbR.length > 0) { setRankings(dbR); persistRankingsLocal(dbR); }
          else {
            const updated = [...loadRankingsLocal(), entry].sort((a, b) => b.compositeScore - a.compositeScore).slice(0, MAX_RANKINGS);
            persistRankingsLocal(updated);
            setRankings(updated);
          }
        });
      });
      const cogSession = { score, level, time: elapsedTime, accuracy: finalAcc, maxCombo: maxComboRef.current, gameMode, date: new Date().toISOString() };
      const localH = loadCognitiveLocal();
      localH.push(cogSession);
      persistCognitiveLocal(localH);
      setCognitiveHistory(localH);
      insertCognitiveToDB(cogSession, uid2).then(() => {
        fetchCognitiveFromDB(uid2).then((dbC) => { if (dbC.length > 0) { setCognitiveHistory(dbC); persistCognitiveLocal(dbC); } });
      });
    } else {
      setMessage(`⏰ 시간 초과! ❤️ ${newLives}개 남음 — 다시 보여줄게요`);
      setPlayerInput([]);
      setTimeout(() => {
        setGameState("showing");
        showPattern(pattern);
      }, 1200);
    }
  };

  // --- Inertia animation loop ---
  const startInertia = useCallback(() => {
    const vel = velocityY.current;
    if (Math.abs(vel) < 0.3) {
      velocityY.current = 0;
      isInertia.current = false;
      return;
    }
    isInertia.current = true;
    const friction = 0.95;
    const step = () => {
      velocityY.current *= friction;
      if (Math.abs(velocityY.current) < 0.3) {
        velocityY.current = 0;
        isInertia.current = false;
        animFrameId.current = null;
        return;
      }
      setRotY((prev) => prev + velocityY.current);
      animFrameId.current = requestAnimationFrame(step);
    };
    animFrameId.current = requestAnimationFrame(step);
  }, []);

  const stopInertia = useCallback(() => {
    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
      animFrameId.current = null;
    }
    velocityY.current = 0;
    isInertia.current = false;
  }, []);

  // --- Pointer + Touch handlers (iOS Safari compat + inertia) ---
  // On iOS, BOTH pointer and touch events fire for the same gesture.
  // activeInput ref ensures only ONE system processes each gesture,
  // preventing double velocity updates and double inertia loops.

  const handlePointerDown = (e) => {
    activeInput.current = "pointer";
    stopInertia();
    dragging.current = true;
    isDragMove.current = false;
    lastPos.current = { x: e.clientX, y: e.clientY };
    lastMoveTime.current = Date.now();
    velocityY.current = 0;
  };
  const handlePointerMove = (e) => {
    if (!dragging.current || activeInput.current !== "pointer") return;
    const now = Date.now();
    const dt = Math.max(1, now - lastMoveTime.current);
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      isDragMove.current = true;
    }
    // Track horizontal velocity (smoothed)
    const instantVel = (dx * 0.6) / Math.max(dt / 16, 0.5);
    velocityY.current = velocityY.current * 0.3 + instantVel * 0.7;
    lastMoveTime.current = now;
    setRotY((prev) => prev + dx * 0.6);
    setRotX((prev) => Math.max(-89, Math.min(89, prev - dy * 0.6)));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerUp = () => {
    if (activeInput.current !== "pointer") return;
    dragging.current = false;
    activeInput.current = null;
    startInertia();
    setTimeout(() => { isDragMove.current = false; }, 50);
  };
  const handleTouchStart = (e) => {
    // If pointer events already claimed this gesture, skip
    if (activeInput.current === "pointer") return;
    activeInput.current = "touch";
    stopInertia();
    const t = e.touches[0];
    dragging.current = true;
    isDragMove.current = false;
    lastPos.current = { x: t.clientX, y: t.clientY };
    lastMoveTime.current = Date.now();
    velocityY.current = 0;
  };
  const handleTouchMove = useCallback((e) => {
    e.preventDefault(); // ALWAYS prevent iOS scroll/bounce regardless of activeInput
    if (!dragging.current || activeInput.current !== "touch") return;
    const now = Date.now();
    const dt = Math.max(1, now - lastMoveTime.current);
    const t = e.touches[0];
    const dx = t.clientX - lastPos.current.x;
    const dy = t.clientY - lastPos.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      isDragMove.current = true;
    }
    // Track horizontal velocity (smoothed)
    const instantVel = (dx * 0.6) / Math.max(dt / 16, 0.5);
    velocityY.current = velocityY.current * 0.3 + instantVel * 0.7;
    lastMoveTime.current = now;
    setRotY((prev) => prev + dx * 0.6);
    setRotX((prev) => Math.max(-89, Math.min(89, prev - dy * 0.6)));
    lastPos.current = { x: t.clientX, y: t.clientY };
  }, []);
  const handleTouchEnd = useCallback(() => {
    if (activeInput.current !== "touch") return;
    dragging.current = false;
    activeInput.current = null;
    startInertia();
    setTimeout(() => { isDragMove.current = false; }, 50);
  }, [startInertia]);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      // Clean up animation frame on unmount
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [handleTouchMove, handleTouchEnd]);

  // ─── AUTH SCREEN ───
  if (authLoading) {
    return (
      <div style={{
        minHeight: "100vh", background: "linear-gradient(145deg, #0a0a1a 0%, #1a1a3e 40%, #0d0d2b 100%)",
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit', sans-serif",
        paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>로딩 중...</div>
      </div>
    );
  }

  if ((!user && supabase) || authMode === "reset") {
    const inputStyle = {
      width: "100%", padding: "14px 16px", fontSize: 14, fontWeight: 500,
      fontFamily: "'Outfit', sans-serif",
      background: "rgba(255,255,255,0.06)", color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
      outline: "none", transition: "border-color 0.2s",
      boxSizing: "border-box",
    };
    return (
      <div style={{
        minHeight: "100vh", background: "linear-gradient(145deg, #0a0a1a 0%, #1a1a3e 40%, #0d0d2b 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Outfit', sans-serif",
        padding: "calc(20px + env(safe-area-inset-top)) calc(20px + env(safe-area-inset-right)) calc(20px + env(safe-area-inset-bottom)) calc(20px + env(safe-area-inset-left))",
      }}>
        <div style={{
          width: "100%", maxWidth: 360,
          padding: "36px 28px 28px",
          background: "linear-gradient(160deg, rgba(26,26,50,0.98) 0%, rgba(15,15,40,0.98) 100%)",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          animation: "modalFadeIn 0.4s cubic-bezier(0.34, 1.3, 0.64, 1)",
        }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 36, marginBottom: 4 }}>🧊</div>
            <div style={{
              fontSize: 22, fontWeight: 800, color: "#fff",
              letterSpacing: 2, lineHeight: 1.2,
            }}>
              CUBE PATTERN
            </div>
          </div>
          <div style={{
            fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center",
            marginBottom: 28, letterSpacing: 1,
          }}>
            {authMode === "signup" ? "회원가입" : authMode === "forgot" ? "비밀번호 재설정" : authMode === "reset" ? "새 비밀번호 설정" : "로그인"}
          </div>

          {/* Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {authMode === "signup" && (
              <input
                type="text" placeholder="닉네임" value={authNickname}
                onChange={(e) => setAuthNickname(e.target.value)}
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = "rgba(192,132,252,0.5)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; }}
              />
            )}
            {(authMode === "login" || authMode === "signup" || authMode === "forgot") && (
              <input
                type="email" placeholder="이메일" value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                style={inputStyle}
                onKeyDown={(e) => { if (e.key === "Enter" && authMode === "forgot") handleForgotPassword(); }}
                onFocus={(e) => { e.target.style.borderColor = "rgba(192,132,252,0.5)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; }}
              />
            )}
            {(authMode === "login" || authMode === "signup") && (
              <input
                type="password" placeholder="비밀번호 (6자 이상)" value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                style={inputStyle}
                onKeyDown={(e) => { if (e.key === "Enter") authMode === "signup" ? handleSignUp() : handleLogin(); }}
                onFocus={(e) => { e.target.style.borderColor = "rgba(192,132,252,0.5)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; }}
              />
            )}
            {authMode === "reset" && (
              <>
                <input
                  type="password" placeholder="새 비밀번호 (6자 이상)" value={authNewPassword}
                  onChange={(e) => setAuthNewPassword(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(192,132,252,0.5)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; }}
                />
                <input
                  type="password" placeholder="비밀번호 확인" value={authConfirmPassword}
                  onChange={(e) => setAuthConfirmPassword(e.target.value)}
                  style={inputStyle}
                  onKeyDown={(e) => { if (e.key === "Enter") handleResetPassword(); }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(192,132,252,0.5)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; }}
                />
              </>
            )}
          </div>

          {/* Error */}
          {authError && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 10,
              background: "rgba(255,59,92,0.1)", border: "1px solid rgba(255,59,92,0.2)",
              color: "#FF6B6B", fontSize: 12, textAlign: "center",
            }}>
              {authError}
            </div>
          )}

          {/* Success */}
          {authSuccess && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 10,
              background: "rgba(76,217,100,0.1)", border: "1px solid rgba(76,217,100,0.2)",
              color: "#4CD964", fontSize: 12, textAlign: "center",
            }}>
              {authSuccess}
            </div>
          )}

          {/* Forgot password link (login mode only) */}
          {authMode === "login" && (
            <div style={{ marginTop: 8, textAlign: "right" }}>
              <span
                onClick={() => { setAuthMode("forgot"); setAuthError(""); setAuthSuccess(""); }}
                style={{ color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 11, transition: "color 0.2s" }}
                onMouseEnter={(e) => { e.target.style.color = "#C084FC"; }}
                onMouseLeave={(e) => { e.target.style.color = "rgba(255,255,255,0.35)"; }}
              >
                비밀번호를 잊으셨나요?
              </span>
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={
              authMode === "signup" ? handleSignUp :
              authMode === "forgot" ? handleForgotPassword :
              authMode === "reset" ? handleResetPassword :
              handleLogin
            }
            disabled={authLoading}
            style={{
              width: "100%", marginTop: authMode === "login" ? 10 : 18, padding: "14px 0",
              fontSize: 15, fontWeight: 700,
              fontFamily: "'Outfit', sans-serif",
              background: "linear-gradient(135deg, #C084FC, #818CF8)",
              color: "#fff", border: "none", borderRadius: 14,
              cursor: "pointer", letterSpacing: 1,
              boxShadow: "0 4px 20px rgba(192,132,252,0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
              WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
            }}
            onMouseEnter={(e) => { e.target.style.transform = "scale(1.02)"; e.target.style.boxShadow = "0 6px 28px rgba(192,132,252,0.4)"; }}
            onMouseLeave={(e) => { e.target.style.transform = "scale(1)"; e.target.style.boxShadow = "0 4px 20px rgba(192,132,252,0.3)"; }}
          >
            {authMode === "signup" ? "회원가입" : authMode === "forgot" ? "재설정 링크 보내기" : authMode === "reset" ? "비밀번호 변경" : "로그인"}
          </button>

          {/* Toggle mode */}
          <div style={{
            marginTop: 18, textAlign: "center", fontSize: 12,
            color: "rgba(255,255,255,0.4)",
          }}>
            {authMode === "login" ? (
              <>
                계정이 없으신가요?{" "}
                <span
                  onClick={() => { setAuthMode("signup"); setAuthError(""); setAuthSuccess(""); }}
                  style={{ color: "#C084FC", cursor: "pointer", fontWeight: 600 }}
                >
                  회원가입
                </span>
              </>
            ) : authMode === "signup" ? (
              <>
                이미 계정이 있으신가요?{" "}
                <span
                  onClick={() => { setAuthMode("login"); setAuthError(""); setAuthSuccess(""); }}
                  style={{ color: "#C084FC", cursor: "pointer", fontWeight: 600 }}
                >
                  로그인
                </span>
              </>
            ) : (authMode === "forgot" || authMode === "reset") ? (
              <>
                <span
                  onClick={() => { setAuthMode("login"); setAuthError(""); setAuthSuccess(""); }}
                  style={{ color: "#C084FC", cursor: "pointer", fontWeight: 600 }}
                >
                  로그인으로 돌아가기
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        minHeight: "100dvh",
        background: "linear-gradient(145deg, #070714 0%, #0f0f2d 30%, #1a1a3e 60%, #0d0d2b 100%)",
        color: "#fff",
        fontFamily: "'Outfit', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
        WebkitOverflowScrolling: "touch",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @keyframes dotPulse {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-12px); }
          40% { transform: translateX(12px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes idleSpin {
          0% { transform: rotateX(-25deg) rotateY(0deg); }
          100% { transform: rotateX(-25deg) rotateY(360deg); }
        }
        @keyframes previewZoomIn {
          0% { transform: rotateX(-25deg) rotateY(0deg) scale(1); }
          100% { transform: rotateX(-15deg) rotateY(0deg) scale(1.6); }
        }
        @keyframes previewDropIcon {
          0% { transform: translate(-50%, -50%) translateY(-100px) scale(1.5) rotateZ(-10deg); opacity: 0; }
          12% { opacity: 1; }
          40% { transform: translate(-50%, -50%) translateY(-25px) scale(1.1) rotateZ(0deg); opacity: 1; }
          65% { transform: translate(-50%, -50%) translateY(5px) scale(0.7) rotateZ(3deg); opacity: 0.85; }
          85% { transform: translate(-50%, -50%) translateY(15px) scale(0.3) rotateZ(0deg); opacity: 0.4; }
          100% { transform: translate(-50%, -50%) translateY(25px) scale(0.1); opacity: 0; }
        }
        @keyframes previewZoomOut {
          0% { transform: rotateX(-15deg) rotateY(0deg) scale(1.6); }
          100% { transform: rotateX(-25deg) rotateY(0deg) scale(1); }
        }
        @keyframes faceEdgeShine {
          0%, 100% { opacity: 0.9; }
          8% { opacity: 0.4; }
          16%, 84% { opacity: 0; }
          92% { opacity: 0.4; }
        }
        @keyframes glow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        @keyframes edgeBurst {
          0% { opacity: 0; box-shadow: 0 0 2px 1px rgba(255,200,120,0.3); }
          18% { opacity: 1; box-shadow: 0 0 15px 8px rgba(255,200,120,0.9), 0 0 40px 20px rgba(255,150,80,0.5), 0 0 80px 40px rgba(255,100,50,0.2); }
          50% { opacity: 0.9; box-shadow: 0 0 25px 15px rgba(255,200,120,0.8), 0 0 60px 35px rgba(255,150,80,0.4), 0 0 120px 60px rgba(255,100,50,0.12); }
          82% { opacity: 0.15; box-shadow: 0 0 4px 2px rgba(255,200,120,0.2); }
          100% { opacity: 0; box-shadow: 0 0 0 0 transparent; }
        }
        @keyframes edgeBreathe {
          0%, 100% { opacity: 0; box-shadow: 0 0 0 0 transparent; }
          50% { opacity: 0.4; box-shadow: 0 0 8px 3px rgba(255,200,120,0.5), 0 0 20px 8px rgba(255,150,80,0.25); }
        }
        @keyframes dropInCube3D {
          0% { transform: translate(-50%, -50%) translateY(-220px) scale(1.5) rotateZ(-10deg); opacity: 0; }
          12% { opacity: 1; }
          40% { transform: translate(-50%, -50%) translateY(-60px) scale(1.1) rotateZ(0deg); opacity: 1; }
          65% { transform: translate(-50%, -50%) translateY(10px) scale(0.7) rotateZ(3deg); opacity: 0.85; }
          85% { transform: translate(-50%, -50%) translateY(40px) scale(0.3) rotateZ(0deg); opacity: 0.4; }
          100% { transform: translate(-50%, -50%) translateY(60px) scale(0.1); opacity: 0; }
        }
        @keyframes timerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes rippleHint {
          0% { transform: scale(0.8); opacity: 0.6; }
          50% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        @keyframes modalFadeIn {
          0% { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes modalBackdropIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes avatarRingPulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(192,132,252,0.3); }
          50% { box-shadow: 0 0 0 3px rgba(192,132,252,0.15), 0 0 10px rgba(192,132,252,0.2); }
        }
        @keyframes profileSlideIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes eventPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes eventGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,215,0,0.2); }
          50% { box-shadow: 0 0 40px rgba(255,215,0,0.4), 0 0 60px rgba(255,215,0,0.1); }
        }
        @keyframes eventSlideUp {
          0% { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Background orbs */}
      <div style={{
        position: "absolute", top: "10%", left: "15%", width: 300, height: 300,
        background: "radial-gradient(circle, rgba(255,59,92,0.06) 0%, transparent 70%)",
        borderRadius: "50%", pointerEvents: "none", animation: "glow 4s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", top: "50%", right: "10%", width: 250, height: 250,
        background: "radial-gradient(circle, rgba(77,168,255,0.06) 0%, transparent 70%)",
        borderRadius: "50%", pointerEvents: "none", animation: "glow 5s ease-in-out infinite 1s",
      }} />
      <div style={{
        position: "absolute", bottom: "20%", left: "40%", width: 350, height: 350,
        background: "radial-gradient(circle, rgba(192,132,252,0.05) 0%, transparent 70%)",
        borderRadius: "50%", pointerEvents: "none", animation: "glow 6s ease-in-out infinite 2s",
      }} />
      {/* ═══ PERSISTENT TOP BAR ═══ */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        paddingTop: "calc(10px + env(safe-area-inset-top))",
        paddingLeft: "calc(16px + env(safe-area-inset-left))",
        paddingRight: "calc(16px + env(safe-area-inset-right))",
        paddingBottom: 10,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        zIndex: 50,
        background: "linear-gradient(180deg, rgba(10,10,26,0.9) 0%, rgba(10,10,26,0.5) 60%, transparent 100%)",
        pointerEvents: "auto",
      }}>
        {/* Left: Game title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 18, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>🎲</div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: "rgba(255,255,255,0.85)", textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
            CUBE PATTERN
          </div>
        </div>
        {/* Right: Avatar + nickname */}
        {nickname && (
          <div
            onClick={() => setShowProfileModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              padding: "5px 10px 5px 5px", borderRadius: 24,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
              transition: "all 0.2s",
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: avatarUrl ? `url(${avatarUrl}) center/cover no-repeat` : "linear-gradient(135deg, #C084FC, #818CF8)",
              border: "2px solid rgba(192,132,252,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, color: "#fff", fontWeight: 700,
              animation: "avatarRingPulse 3s ease-in-out infinite",
            }}>
              {!avatarUrl && nickname.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.65)", maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {nickname}
            </span>
          </div>
        )}
      </div>
      {/* Mode selector — only visible on modeReady screen */}
      {gameState === "modeReady" && (
        <div style={{
          display: "flex", gap: 8, padding: "10px 20px 0", position: "relative", zIndex: 10,
        }}>
          {["color", "number"].map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeSelect(mode)}
              style={{
                width: 34, height: 34, borderRadius: 9,
                border: gameMode === mode ? "2px solid rgba(255,255,255,0.5)" : "2px solid rgba(255,255,255,0.1)",
                background: gameMode === mode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.02)",
                color: "#fff", fontSize: mode === "number" ? 15 : 14,
                fontWeight: mode === "number" ? 800 : 400,
                fontFamily: "'Outfit', sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: gameMode === mode ? 1 : 0.5,
                cursor: "pointer", transition: "all 0.3s",
                WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
              }}
            >
              {MODE_ICONS[mode]}
            </button>
          ))}
        </div>
      )}
      {/* 3D Cube area — always vertically centered */}
      {/* Outer wrapper handles centering (never animated) */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%", maxWidth: 500, height: 320,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 10, overflow: "visible",
        pointerEvents: "none",
      }}>
        {/* Inner wrapper handles animation + pointer events */}
        <div
          onPointerDown={handlePointerDown}
          onTouchStart={handleTouchStart}
          style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "grab", touchAction: "none", WebkitTouchCallout: "none",
            pointerEvents: "auto",
            animation: shakeAnim ? "shake 0.5s ease-in-out" : (gameState === "idle" ? "float 3s ease-in-out infinite" : "none"),
          }}
        >
          <Cube3D
            rotX={rotX}
            rotY={rotY}
            onFaceClick={handleFaceClick}
            highlightFace={highlightFace}
            scale={1.7}
            unfolded={cubeUnfolded}
            glowEdges={glowEdges}
            edgeBreathing={edgeBreathing}
            gameMode={gameMode}
            lidOpen={lidOpen}
            droppingIcon={droppingIcon}
          />
        </div>
      </div>
      {/* ═══ Game HUD — always visible during active gameplay (no fade transitions) ═══ */}
      {gameState !== "idle" && gameState !== "gameover" && gameState !== "folding" && gameState !== "lidAnim" && gameState !== "modeReady" && (
        <>
          {/* TOP: Pattern display — below top bar */}
          <div style={{
            position: "absolute", top: "calc(60px + env(safe-area-inset-top))", left: 0, right: 0,
            display: "flex", flexDirection: "column", alignItems: "center",
            zIndex: 30, pointerEvents: "none",
          }}>
            <div style={{
              display: "flex", gap: 14, padding: "14px 22px",
              background: "rgba(10,10,26,0.8)",
              backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
              borderRadius: 22, border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
              flexWrap: "wrap", justifyContent: "center",
              maxWidth: 500,
            }}>
              {pattern.map((fKey, i) => {
                const isRevealed = gameState === "showing" && i <= showIndex;
                const isPlayerFilled = gameState === "input" && i < playerInput.length;
                const isCurrent = gameState === "input" && i === playerInput.length;
                if (isRevealed) {
                  return <ColorDot key={i} faceKey={fKey} size={64} pulse gameMode={gameMode} />;
                }
                if (isPlayerFilled) {
                  return <ColorDot key={i} faceKey={playerInput[i]} size={64} pulse gameMode={gameMode} />;
                }
                return (
                  <div
                    key={i}
                    style={{
                      width: 64, height: 64, borderRadius: "50%",
                      background: isCurrent ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                      border: isCurrent ? "2px dashed rgba(255,255,255,0.4)" : "2px solid rgba(255,255,255,0.08)",
                      transition: "all 0.3s",
                    }}
                  />
                );
              })}
            </div>
            {/* Round countdown bar */}
            {gameState === "input" && (
              <div style={{
                maxWidth: 500, width: "calc(100% - 40px)", marginTop: 8,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{
                  flex: 1, height: 6, borderRadius: 3,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    width: `${(roundTimeLeft / ROUND_TIME_LIMIT) * 100}%`,
                    background: roundTimeLeft > 5000
                      ? "linear-gradient(90deg, #00C9A7, #4DA8FF)"
                      : roundTimeLeft > 3000
                        ? "linear-gradient(90deg, #FFD93D, #FF8A5C)"
                        : "linear-gradient(90deg, #FF3B5C, #FF3B5C)",
                    transition: "width 0.05s linear",
                    boxShadow: roundTimeLeft <= 3000
                      ? "0 0 10px rgba(255,59,92,0.6)"
                      : "none",
                  }} />
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  color: roundTimeLeft > 5000 ? "rgba(255,255,255,0.5)"
                    : roundTimeLeft > 3000 ? "#FFD93D"
                    : "#FF3B5C",
                  minWidth: 32, textAlign: "right",
                  animation: roundTimeLeft <= 3000 ? "timerPulse 0.5s ease-in-out infinite" : "none",
                }}>
                  {Math.ceil(roundTimeLeft / 1000)}s
                </div>
              </div>
            )}
          </div>
          {/* BOTTOM: Stats bar — fixed at bottom, always visible */}
          <div style={{
            position: "absolute", bottom: "calc(24px + env(safe-area-inset-bottom))", left: 0, right: 0,
            display: "flex", justifyContent: "center", alignItems: "center",
            zIndex: 30, pointerEvents: "none",
          }}>
            <div style={{
              display: "flex", gap: 16, padding: "12px 24px",
              background: "rgba(10,10,26,0.8)",
              backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
              borderRadius: 20, border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
              alignItems: "center",
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 2 }}>LV {level}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{currentRound}/{getLevelConfig(level).rounds}</div>
              </div>
              <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 2 }}>SCORE</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{score}</div>
              </div>
              <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {"❤️".repeat(lives)}{"🖤".repeat(Math.max(0, 3 - lives))}
                </div>
              </div>
              <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 2 }}>TIME</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatTime(elapsedTime)}</div>
              </div>
              {combo >= 2 && (
                <>
                  <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)" }} />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#FFD93D", letterSpacing: 2, marginBottom: 2 }}>COMBO</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#FFD93D" }}>×{combo}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
      {/* Message — only shown on non-gameplay screens (idle, modeReady, gameover transitions) */}
      {(gameState === "idle" || gameState === "modeReady" || gameState === "gameover" || gameState === "folding" || gameState === "lidAnim") && (
        <div style={{
          padding: "12px 0", fontSize: 15, fontWeight: 400,
          color: "rgba(255,255,255,0.7)", textAlign: "center",
          minHeight: 44, display: "flex", alignItems: "center",
          position: "relative", zIndex: 30,
        }}>
          {message}
        </div>
      )}
      {/* Spacer to push content below the centered cube */}
      <div style={{ flex: 1 }} />
      {/* Inline start button — shown after mode switch during gameplay */}
      {gameState === "modeReady" && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          position: "absolute", bottom: "calc(18% + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)",
          zIndex: 20,
        }}>
          <button
            onClick={startGame}
            style={{
              padding: "14px 44px", fontSize: 15, fontWeight: 700,
              fontFamily: "'Outfit', sans-serif",
              background: "linear-gradient(135deg, #FF3B5C, #FF8A5C)",
              color: "#fff", border: "none", borderRadius: 50,
              cursor: "pointer", letterSpacing: 1,
              boxShadow: "0 4px 24px rgba(255,59,92,0.4)",
              transition: "transform 0.2s, box-shadow 0.2s",
              WebkitAppearance: "none",
              WebkitTapHighlightColor: "transparent",
              animation: "dotPulse 0.4s ease-out",
            }}
          >
            게임 시작
          </button>
        </div>
      )}
      {/* Dropping icon is now rendered inside Cube3D's 3D space */}
      {/* Start / Game Over */}
      {(gameState === "idle" || gameState === "gameover" || gameState === "folding") && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: gameState === "gameover"
            ? "rgba(10,10,26,0.92)"
            : "rgba(10,10,26,0.85)",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: "clamp(4px, 1.2vh, 12px)", zIndex: 100,
          paddingBottom: "calc(2vh + env(safe-area-inset-bottom))",
          paddingTop: "calc(8px + env(safe-area-inset-top))",
          overflowY: "auto", WebkitOverflowScrolling: "touch",
          backdropFilter: gameState === "folding" ? "none" : "blur(8px)",
          WebkitBackdropFilter: gameState === "folding" ? "none" : "blur(8px)",
          opacity: gameState === "folding" ? 0 : 1,
          transition: "opacity 0.6s ease-out",
          pointerEvents: gameState === "folding" ? "none" : "auto",
        }}>
          {gameState === "gameover" && (
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 14, letterSpacing: 3, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
                GAME OVER
              </div>
              <div style={{ fontSize: 56, fontWeight: 800, marginBottom: 4 }}>{score}</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
                {level > MAX_LEVEL ? "🏆 전 레벨 클리어!" : `레벨 ${level}까지 도달`} {score >= bestScore && score > 0 ? "— 새로운 최고 기록!" : ""}
              </div>
              <div style={{
                display: "flex", gap: 20, justifyContent: "center",
                padding: "14px 20px", borderRadius: 16,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 2, marginBottom: 4 }}>TIME</div>
                  <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatTime(elapsedTime)}</div>
                </div>
                <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 2, marginBottom: 4 }}>ACCURACY</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: accuracy === 100 ? "#00C9A7" : "#fff" }}>{accuracy}%</div>
                </div>
                <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 2, marginBottom: 4 }}>RANK</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "#FFD93D" }}>{calculateCompositeScore(score, elapsedTime, accuracy)}</div>
                </div>
              </div>
            </div>
          )}
          {gameState === "idle" && (
            <div style={{ textAlign: "center", marginBottom: "clamp(4px, 1.5vh, 16px)" }}>
              <div style={{
                fontSize: "clamp(28px, 6vh, 44px)", fontWeight: 800, marginBottom: "clamp(2px, 0.8vh, 8px)", letterSpacing: 2, lineHeight: 1.1,
                background: "linear-gradient(135deg, #fff 30%, rgba(192,132,252,0.9) 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                CUBE<br/>PATTERN
              </div>
              {/* Top 3 Mini Leaderboard */}
              {rankings.length > 0 && (
                <div style={{
                  marginTop: "clamp(4px, 1vh, 14px)", display: "inline-flex", flexDirection: "column", gap: "clamp(2px, 0.5vh, 5px)",
                  padding: "clamp(6px, 1vh, 10px) 16px", background: "rgba(255,255,255,0.02)",
                  borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)",
                  minWidth: 220,
                }}>
                  {/* D-Day inside ranking card */}
                  {getDDayCount() > 0 && (
                    <div
                      onClick={() => setShowEventModal(true)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "5px 0 6px", marginBottom: 2, cursor: "pointer",
                        borderBottom: "1px solid rgba(255,215,0,0.1)",
                      }}
                    >
                      <span style={{ fontSize: 12 }}>☕</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#FFD93D", letterSpacing: 1 }}>D-{getDDayCount()}</span>
                      <span style={{ fontSize: 9, color: "rgba(255,215,0,0.5)", fontWeight: 600 }}>EVENT</span>
                    </div>
                  )}
                  <div style={{
                    fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.25)",
                    fontWeight: 600, marginBottom: 2, textAlign: "center",
                  }}>🏆 TOP RANKING</div>
                  {rankings.slice(0, 3).map((entry, i) => {
                    const uid = entry.userId;
                    const profile = top3Avatars[uid];
                    const avatarSrc = profile?.avatar;
                    const displayName = profile?.name || entry.playerName || "Anonymous";
                    const medals = ["🥇", "🥈", "🥉"];
                    const colors = ["#FFD93D", "#C0C0C0", "#CD7F32"];
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "3px 0",
                      }}>
                        <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>{medals[i]}</span>
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                          background: avatarSrc
                            ? `url(${avatarSrc}) center/cover no-repeat`
                            : "linear-gradient(135deg, #C084FC, #818CF8)",
                          border: `1.5px solid ${colors[i]}40`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, color: "#fff", fontWeight: 700,
                        }}>
                          {!avatarSrc && displayName.charAt(0).toUpperCase()}
                        </div>
                        <div style={{
                          flex: 1, fontSize: 11, fontWeight: 600, textAlign: "left",
                          color: "rgba(255,255,255,0.55)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {displayName}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: colors[i] }}>
                          {entry.compositeScore}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* Mini rotating cube preview */}
          {gameState === "idle" && (() => {
            const sz = 80;
            const h = sz / 2;
            // Cube container: CSS animation for spin/zoom, static transform for hold states
            const cubeContainerStyle = (() => {
              if (previewAnim === null) return { animation: "idleSpin 8s linear infinite" };
              if (previewAnim === "zooming") return { animation: "previewZoomIn 0.4s ease-out forwards" };
              if (previewAnim === "returning") return { animation: "previewZoomOut 0.5s ease-in-out forwards" };
              // lidOpen, dropping, lidClose, waiting → hold zoomed position
              return { transform: "rotateX(-15deg) rotateY(0deg) scale(1.6)" };
            })();
            // Lid open when lidOpen or dropping
            const isLidOpen = previewAnim === "lidOpen" || previewAnim === "dropping";
            const faceContent = (faceKey) => {
              const c = FACE_CONTENT[gameMode]?.[faceKey];
              if (!c) return null;
              return <span style={{ fontSize: gameMode === "number" ? sz * 0.45 : sz * 0.5, fontWeight: gameMode === "number" ? 900 : 400, color: "rgba(0,0,0,0.5)", pointerEvents: "none" }}>{c}</span>;
            };
            const faceStyle = (bg, tf) => ({
              position: "absolute", width: sz, height: sz,
              background: bg, borderRadius: 6, transform: tf,
              border: "1px solid rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            });
            // Light reflection overlay — synced with 8s idleSpin rotation
            const shineOverlay = (delay) => (
              <>
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: "35%",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
                  borderRadius: "6px 6px 0 0", pointerEvents: "none",
                  animation: `faceEdgeShine 8s linear ${delay}s infinite`,
                }} />
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 1.5,
                  background: "linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.5) 30%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.5) 70%, transparent 95%)",
                  pointerEvents: "none",
                  animation: `faceEdgeShine 8s linear ${delay}s infinite`,
                }} />
              </>
            );
            return (
              <div style={{
                marginBottom: 48, marginTop: 24, perspective: "500px", WebkitPerspective: "500px",
              }}>
                <div style={{
                  width: sz, height: sz, position: "relative",
                  ...preserve3d,
                  ...cubeContainerStyle,
                }}>
                  {/* Front — shines at 0°/360° */}
                  <div style={faceStyle(FACE_COLORS.front, `translateZ(${h}px)`)}>
                    {faceContent("front")}
                    {shineOverlay(0)}
                  </div>
                  {/* Back — shines at 180° */}
                  <div style={faceStyle(FACE_COLORS.back, `rotateY(180deg) translateZ(${h}px)`)}>
                    {faceContent("back")}
                    {shineOverlay(-4)}
                  </div>
                  {/* Top — lid with wrapper for hinge animation */}
                  <div style={{
                    position: "absolute", width: sz, height: sz,
                    transform: `rotateX(90deg) translateZ(${h}px)`,
                    ...preserve3d,
                  }}>
                    {/* Outer face of lid */}
                    <div style={{
                      width: sz, height: sz,
                      background: FACE_COLORS.top, borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transformOrigin: "center top",
                      transform: isLidOpen ? "rotateX(110deg)" : "rotateX(0deg)",
                      transition: "transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                      ...preserve3d,
                    }}>
                      {faceContent("top")}
                      {/* Inner face of lid (dark) — visible when lid opens */}
                      <div style={{
                        position: "absolute", left: 0, top: 0, width: sz, height: sz,
                        background: "linear-gradient(180deg, #1a1a2e 0%, #111128 100%)",
                        transform: "rotateX(180deg)",
                        ...hiddenBack,
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.08)",
                        boxShadow: "inset 0 0 15px rgba(0,0,0,0.5)",
                      }} />
                    </div>
                  </div>
                  {/* Bottom */}
                  <div style={faceStyle(FACE_COLORS.bottom, `rotateX(-90deg) translateZ(${h}px)`)}>{faceContent("bottom")}</div>
                  {/* Left — shines at 90° */}
                  <div style={faceStyle(FACE_COLORS.left, `rotateY(-90deg) translateZ(${h}px)`)}>
                    {faceContent("left")}
                    {shineOverlay(-6)}
                  </div>
                  {/* Right — shines at 270° */}
                  <div style={faceStyle(FACE_COLORS.right, `rotateY(90deg) translateZ(${h}px)`)}>
                    {faceContent("right")}
                    {shineOverlay(-2)}
                  </div>
                  {/* Dropping icon — falls into cube when mode is selected */}
                  {previewAnim === "dropping" && pendingMode && (
                    <div style={{
                      position: "absolute",
                      left: sz / 2, top: sz / 2,
                      width: 0, height: 0,
                      ...preserve3d,
                      transform: `translateZ(${h * 0.5}px)`,
                      pointerEvents: "none",
                    }}>
                      <div style={{
                        position: "absolute",
                        left: 0, top: 0,
                        transform: "translate(-50%, -50%)",
                        animation: "previewDropIcon 0.7s cubic-bezier(0.45, 0.05, 0.55, 0.95) forwards",
                        fontSize: sz * 0.45,
                        fontWeight: 900,
                        filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.6))",
                        lineHeight: 1,
                      }}>
                        {MODE_ICONS[pendingMode]}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          {/* Mode selector inside overlay */}
          {(gameState === "idle" || gameState === "gameover") && (
            <div style={{ display: "flex", gap: 10, marginBottom: "clamp(12px, 3vh, 32px)" }}>
              {["color", "number"].map((mode) => (
                <button
                  key={mode}
                  onClick={(e) => { e.stopPropagation(); handleModeSelect(mode); }}
                  style={{
                    width: 48, height: 48, borderRadius: 16,
                    border: gameMode === mode ? "2px solid rgba(255,255,255,0.5)" : "2px solid rgba(255,255,255,0.1)",
                    background: gameMode === mode ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                    color: "#fff", fontSize: mode === "number" ? 20 : 18,
                    fontWeight: mode === "number" ? 800 : 400,
                    fontFamily: "'Outfit', sans-serif",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.3s",
                    boxShadow: gameMode === mode ? "0 0 14px rgba(255,255,255,0.2)" : "none",
                    WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {MODE_ICONS[mode]}
                </button>
              ))}
            </div>
          )}
          {(gameState === "idle" || gameState === "gameover") && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(6px, 1.5vh, 14px)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={() => { setShowReport(true); setReportAnimReady(false); setDetailAnimReady(false); setReportDetailOpen(false); setTimeout(() => setReportAnimReady(true), 100); }}
                  style={{
                    padding: "10px 24px", fontSize: 13, fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 50, cursor: "pointer",
                    letterSpacing: 1, transition: "all 0.3s",
                    WebkitAppearance: "none",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  📊 리포트
                </button>
                <button
                  onClick={() => setShowRanking(true)}
                  style={{
                    padding: "10px 24px", fontSize: 13, fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 50, cursor: "pointer",
                    letterSpacing: 1, transition: "all 0.3s",
                    WebkitAppearance: "none",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  🏆 랭킹
                </button>
              </div>
              {gameState === "gameover" ? (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {/* 게임 종료 → 시작화면 */}
                  <button
                    onClick={() => {
                      setGameState("idle");
                      setMessage("");
                      setGlowEdges(false);
                      setEdgeBreathing(false);
                      setCubeUnfolded(false);
                      setRoundElapsed(null);
                    }}
                    style={{
                      padding: "16px 28px", fontSize: 15, fontWeight: 700,
                      fontFamily: "'Outfit', sans-serif",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 16,
                      cursor: "pointer", letterSpacing: 1,
                      transition: "all 0.2s",
                      WebkitAppearance: "none",
                      WebkitTapHighlightColor: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.1)";
                      e.target.style.transform = "scale(1.03)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "rgba(255,255,255,0.06)";
                      e.target.style.transform = "scale(1)";
                    }}
                  >
                    게임 종료
                  </button>
                  {/* 다시 도전 */}
                  <button
                    onClick={startGame}
                    style={{
                      padding: "16px 36px", fontSize: 16, fontWeight: 700,
                      fontFamily: "'Outfit', sans-serif",
                      background: "linear-gradient(135deg, #FF3B5C, #FF6B8A, #FF8A5C)",
                      color: "#fff", border: "none", borderRadius: 16,
                      cursor: "pointer", letterSpacing: 1,
                      boxShadow: "0 4px 24px rgba(255,59,92,0.4), 0 0 40px rgba(255,59,92,0.12)",
                      transition: "transform 0.2s, box-shadow 0.2s",
                      WebkitAppearance: "none",
                      WebkitTapHighlightColor: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = "scale(1.05)";
                      e.target.style.boxShadow = "0 6px 32px rgba(255,59,92,0.5)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = "scale(1)";
                      e.target.style.boxShadow = "0 4px 24px rgba(255,59,92,0.4)";
                    }}
                  >
                    다시 도전
                  </button>
                </div>
              ) : (
                <button
                  onClick={startGame}
                  style={{
                    padding: "16px 52px", fontSize: 16, fontWeight: 700,
                    fontFamily: "'Outfit', sans-serif",
                    background: "linear-gradient(135deg, #FF3B5C, #FF6B8A, #FF8A5C)",
                    color: "#fff", border: "none", borderRadius: 16,
                    cursor: "pointer", letterSpacing: 1,
                    boxShadow: "0 4px 24px rgba(255,59,92,0.4), 0 0 40px rgba(255,59,92,0.12)",
                    transition: "transform 0.2s, box-shadow 0.2s, opacity 0.4s",
                    WebkitAppearance: "none",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = "scale(1.05)";
                    e.target.style.boxShadow = "0 6px 32px rgba(255,59,92,0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = "scale(1)";
                    e.target.style.boxShadow = "0 4px 24px rgba(255,59,92,0.4)";
                  }}
                >
                  게임 시작
                </button>
              )}
              {/* Logout button — subtle, below start */}
              {nickname && (
                <button
                  onClick={handleLogout}
                  style={{
                    marginTop: "clamp(4px, 1.2vh, 16px)", padding: "8px 22px", fontSize: 12, fontWeight: 500,
                    fontFamily: "'Outfit', sans-serif", background: "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 20, cursor: "pointer", letterSpacing: 1, transition: "all 0.2s",
                    WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
                  }}
                >
                  로그아웃
                </button>
              )}
              <div style={{
                marginTop: "clamp(8px, 2vh, 28px)", fontSize: 11, color: "rgba(255,255,255,0.3)",
                letterSpacing: 1,
              }}>
                Cube v1.0.0
              </div>
            </div>
          )}
        </div>
      )}
      {/* ─── PROFILE MODAL ─── */}
      {showProfileModal && (
        <div
          onClick={() => { setShowProfileModal(false); setAvatarFile(null); setAvatarPreview(null); }}
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, animation: "modalBackdropIn 0.25s ease-out",
            padding: "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative", padding: "32px 28px 28px", textAlign: "center",
              background: "linear-gradient(160deg, rgba(26,26,50,0.98) 0%, rgba(15,15,40,0.98) 100%)",
              borderRadius: 24, border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(192,132,252,0.08)",
              maxWidth: 340, width: "88%",
              animation: "profileSlideIn 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)",
              fontFamily: "'Outfit', sans-serif", color: "#fff",
            }}
          >
            {/* Close button */}
            <button
              onClick={() => { setShowProfileModal(false); setAvatarFile(null); setAvatarPreview(null); }}
              style={{
                position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: "50%",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.5)", fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
              }}
            >✕</button>
            {/* Large avatar */}
            <div
              onClick={() => avatarInputRef.current?.click()}
              style={{
                width: 96, height: 96, borderRadius: "50%", margin: "0 auto 16px", cursor: "pointer",
                background: (avatarPreview || avatarUrl)
                  ? `url(${avatarPreview || avatarUrl}) center/cover no-repeat`
                  : "linear-gradient(135deg, #C084FC, #818CF8)",
                border: "3px solid rgba(192,132,252,0.4)",
                boxShadow: "0 0 20px rgba(192,132,252,0.2), 0 8px 32px rgba(0,0,0,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, color: "#fff", fontWeight: 700, position: "relative",
              }}
            >
              {!(avatarPreview || avatarUrl) && (nickname ? nickname.charAt(0).toUpperCase() : "?")}
              {/* Camera overlay */}
              <div style={{
                position: "absolute", bottom: 0, right: 0,
                width: 28, height: 28, borderRadius: "50%",
                background: "rgba(10,10,26,0.9)", border: "2px solid rgba(192,132,252,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
              }}>📷</div>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarFileSelect} />
            {/* Nickname & email */}
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{nickname}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 20 }}>{user?.email}</div>
            {/* Upload/Save button */}
            {avatarFile ? (
              <button
                onClick={handleAvatarUpload}
                disabled={avatarUploading}
                style={{
                  width: "100%", padding: "12px 0", fontSize: 14, fontWeight: 700,
                  fontFamily: "'Outfit', sans-serif",
                  background: avatarUploading ? "rgba(192,132,252,0.3)" : "linear-gradient(135deg, #C084FC, #818CF8)",
                  color: "#fff", border: "none", borderRadius: 14, cursor: avatarUploading ? "wait" : "pointer",
                  boxShadow: "0 4px 20px rgba(192,132,252,0.3)",
                  WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
                }}
              >
                {avatarUploading ? "업로드 중..." : "사진 저장"}
              </button>
            ) : (
              <button
                onClick={() => avatarInputRef.current?.click()}
                style={{
                  padding: "10px 24px", fontSize: 12, fontWeight: 600,
                  fontFamily: "'Outfit', sans-serif",
                  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, cursor: "pointer",
                  WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
                }}
              >
                📷 사진 변경
              </button>
            )}
          </div>
        </div>
      )}
      {/* ─── RANKING MODAL POPUP ─── */}
      {showRanking && (
        <div
          onClick={() => setShowRanking(false)}
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 999,
            animation: "modalBackdropIn 0.25s ease-out",
            padding: "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              padding: "28px 24px 24px",
              background: "linear-gradient(160deg, rgba(26,26,50,0.98) 0%, rgba(15,15,40,0.98) 100%)",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(77,168,255,0.08)",
              maxWidth: 460, width: "92%",
              maxHeight: "75vh",
              display: "flex", flexDirection: "column",
              animation: "modalFadeIn 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)",
              fontFamily: "'Outfit', sans-serif",
              color: "#fff",
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setShowRanking(false)}
              style={{
                position: "absolute", top: 12, right: 12,
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.6)",
                fontSize: 16, fontWeight: 300,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
                WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(255,255,255,0.12)";
                e.target.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "rgba(255,255,255,0.06)";
                e.target.style.color = "rgba(255,255,255,0.6)";
              }}
            >
              ✕
            </button>
            {/* Title */}
            <div style={{
              fontSize: 13, letterSpacing: 4, color: "rgba(255,255,255,0.4)",
              marginBottom: 18, textAlign: "center", fontWeight: 600,
            }}>
              🏆 TOP RANKINGS
            </div>
            {rankings.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "rgba(255,255,255,0.7)" }}>
                  아직 랭킹 기록이 없습니다
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                  게임을 플레이하면 랭킹이<br />이곳에 표시됩니다
                </div>
                <button
                  onClick={() => setShowRanking(false)}
                  style={{
                    marginTop: 24, padding: "12px 32px", fontSize: 13, fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    background: "linear-gradient(135deg, #C084FC, #818CF8)",
                    color: "#fff", border: "none", borderRadius: 12,
                    cursor: "pointer",
                    WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
                  }}
                >
                  게임 시작하기
                </button>
              </div>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "flex", padding: "0 12px 10px",
              fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1,
              borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8,
              flexShrink: 0,
            }}>
              <div style={{ width: 28 }}>#</div>
              <div style={{ width: 60 }}>PLAYER</div>
              <div style={{ flex: 1 }}>SCORE</div>
              <div style={{ width: 32, textAlign: "center" }}>LV</div>
              <div style={{ width: 48, textAlign: "center" }}>TIME</div>
              <div style={{ width: 36, textAlign: "center" }}>ACC</div>
              <div style={{ width: 28, textAlign: "center" }}>MODE</div>
            </div>
            {/* Scrollable ranking list */}
            <div style={{
              display: "flex", flexDirection: "column", gap: 5,
              overflowY: "auto", flex: 1,
              paddingRight: 4,
            }}>
              {rankings.map((entry, i) => {
                const isMe = entry.userId === user?.id || entry.playerName === nickname;
                return (
                <div key={i} style={{
                  display: "flex", alignItems: "center",
                  padding: "10px 12px", borderRadius: 12,
                  background: isMe ? "rgba(192,132,252,0.1)" : i === 0 ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.02)",
                  border: isMe ? "1px solid rgba(192,132,252,0.25)" : i < 3 ? "1px solid rgba(255,215,0,0.15)" : "1px solid rgba(255,255,255,0.04)",
                  fontSize: 13,
                  transition: "background 0.2s",
                }}>
                  <div style={{ width: 28, fontWeight: 700, color: i < 3 ? "#FFD93D" : "rgba(255,255,255,0.35)", fontSize: 15 }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </div>
                  <div style={{
                    width: 60, fontSize: 11, fontWeight: isMe ? 700 : 500,
                    color: isMe ? "#C084FC" : "rgba(255,255,255,0.5)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {entry.playerName || "익명"}
                  </div>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>
                    {entry.compositeScore}
                    <span style={{ fontSize: 10, fontWeight: 400, color: "rgba(255,255,255,0.4)", marginLeft: 3 }}>pts</span>
                  </div>
                  <div style={{ width: 32, textAlign: "center", color: "rgba(255,255,255,0.6)" }}>{entry.level}</div>
                  <div style={{ width: 48, textAlign: "center", fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{formatTime(entry.time)}</div>
                  <div style={{ width: 36, textAlign: "center", fontSize: 12, color: entry.accuracy === 100 ? "#00C9A7" : "rgba(255,255,255,0.6)" }}>{entry.accuracy}%</div>
                  <div style={{ width: 28, textAlign: "center" }}>{MODE_ICONS[entry.gameMode] || "?"}</div>
                </div>
                );
              })}
            </div>
            </div>)}
          </div>
        </div>
      )}
      {/* ─── COGNITIVE REPORT MODAL ─── */}
      {showReport && (() => {
        const metrics = calculateCognitiveMetrics(cognitiveHistory);
        const categories = [
          { key: "memory", label: "기억력", icon: "🧠", color: "#FF6B9D" },
          { key: "reaction", label: "반응속도", icon: "⚡", color: "#FFD93D" },
          { key: "pattern", label: "패턴인지", icon: "🔍", color: "#4DA8FF" },
          { key: "focus", label: "집중력", icon: "🎯", color: "#00C9A7" },
          { key: "creativity", label: "창의력", icon: "✨", color: "#C084FC" },
        ];
        const getTrendImprovement = (trend) => {
          if (trend.length < 2) return 0;
          const earlyCount = Math.min(3, Math.floor(trend.length / 2));
          const early = trend.slice(0, earlyCount).reduce((a, b) => a + b, 0) / earlyCount;
          const lateCount = Math.min(3, trend.length);
          const late = trend.slice(-lateCount).reduce((a, b) => a + b, 0) / lateCount;
          return Math.round(late - early);
        };
        const Sparkline = ({ data, color, height = 40, width = 120 }) => {
          if (!data || data.length < 2) return null;
          const max = Math.max(...data, 1);
          const min = Math.min(...data, 0);
          const range = max - min || 1;
          const pts = data.map((v, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((v - min) / range) * (height - 4) - 2;
            return `${x},${y}`;
          }).join(" ");
          const areaPath = `M0,${height} L${data.map((v, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((v - min) / range) * (height - 4) - 2;
            return `${x},${y}`;
          }).join(" L")} L${width},${height} Z`;
          return (
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
              <defs>
                <linearGradient id={`grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#grad-${color.replace("#","")})`} />
              <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {data.length > 0 && (() => {
                const lastX = width;
                const lastY = height - ((data[data.length - 1] - min) / range) * (height - 4) - 2;
                return <circle cx={lastX} cy={lastY} r="3" fill={color} />;
              })()}
            </svg>
          );
        };
        const overallScore = Math.round((metrics.memory + metrics.reaction + metrics.pattern + metrics.focus + metrics.creativity) / 5);
        const ScoreText = ({ value, color }) => (
          <span style={{ fontSize: 22, fontWeight: 800, color }}>{value}</span>
        );
        const getDoctorComment = () => {
          const s = metrics.totalSessions;
          const p = metrics.preventionScore;
          let analysisParts = [];
          if (s <= 2) {
            analysisParts = ["아직 ", <ScoreText key="s" value={`${s}회`} color="#C084FC" />, "의 게임 기록이 있어 정밀한 분석이 어렵지만, 초기 측정 결과 인지 능력의 기초 지표가 확인되었습니다. 꾸준한 훈련을 통해 더 정확한 분석이 가능해집니다."];
          } else if (overallScore < 40) {
            const weakest = categories.find(c => metrics[c.key] === Math.min(...categories.map(c2 => metrics[c2.key]))).label;
            analysisParts = ["현재 인지 기능 종합 점수는 ", <ScoreText key="os" value={`${overallScore}점`} color="#C084FC" />, "으로, 아직 훈련 초기 단계입니다. 특히 ", weakest, " 영역의 집중적인 훈련이 권장됩니다. 매일 2~3회의 꾸준한 반복 훈련이 인지 능력 향상에 큰 도움이 됩니다."];
          } else if (overallScore < 65) {
            const strongest = categories.find(c => metrics[c.key] === Math.max(...categories.map(c2 => metrics[c2.key]))).label;
            analysisParts = ["인지 기능 종합 점수 ", <ScoreText key="os" value={`${overallScore}점`} color="#C084FC" />, "으로 양호한 수준을 보이고 있습니다. ", strongest, " 분야에서 특히 좋은 성과를 보이며, 지속적인 훈련으로 전반적 인지 기능이 고르게 발달하고 있습니다."];
          } else {
            analysisParts = ["인지 기능 종합 점수 ", <ScoreText key="os" value={`${overallScore}점`} color="#C084FC" />, "으로 매우 우수한 수준입니다. 기억력, 반응속도, 패턴인지 능력이 고르게 발달되어 있으며, 꾸준한 훈련의 효과가 뚜렷하게 나타나고 있습니다."];
          }
          let preventionParts = [];
          if (p > 0) {
            preventionParts = [" 현재까지의 훈련 데이터를 기반으로, 인지 자극 활동을 통한 인지장애 및 치매 예방 기여도는 약 ", <ScoreText key="pv" value={`${p}%`} color="#00C9A7" />, "로 추정됩니다."];
            if (p >= 50) {
              preventionParts.push(" 이는 정기적인 두뇌 활동이 신경가소성을 촉진하고, 인지 예비력(cognitive reserve)을 강화하는 데 효과적으로 작용하고 있음을 시사합니다.");
            } else if (p >= 25) {
              preventionParts.push(" 꾸준한 훈련을 지속하면 인지 예비력이 더욱 강화되어 예방 수치가 향상될 것으로 기대됩니다.");
            } else {
              preventionParts.push(" 아직 초기 단계이지만, 매일 꾸준히 훈련하시면 인지 건강 유지에 유의미한 효과가 나타날 것입니다.");
            }
          }
          return <>{analysisParts}{preventionParts}</>;
        };
        return (
          <div
            style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              zIndex: 999,
              overflow: "hidden",
              animation: "modalBackdropIn 0.25s ease-out",
            }}
          >
            <div
              onClick={() => setShowReport(false)}
              style={{
                position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                overflowY: "scroll",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div style={{
                display: "flex", justifyContent: "center",
                padding: "40px 0",
              }}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                padding: "28px 20px 24px",
                background: "linear-gradient(160deg, rgba(26,26,50,0.98) 0%, rgba(15,15,40,0.98) 100%)",
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(192,132,252,0.08)",
                maxWidth: 420, width: "92%",
                alignSelf: "flex-start",
                animation: "modalFadeIn 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)",
                fontFamily: "'Outfit', sans-serif",
                color: "#fff",
              }}
            >
              {/* Close button */}
              <button
                onClick={() => setShowReport(false)}
                style={{
                  position: "absolute", top: 12, right: 12,
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.6)",
                  fontSize: 16, fontWeight: 300,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s", flexShrink: 0,
                  WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
                  zIndex: 2,
                }}
                onMouseEnter={(e) => { e.target.style.background = "rgba(255,255,255,0.12)"; e.target.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.target.style.background = "rgba(255,255,255,0.06)"; e.target.style.color = "rgba(255,255,255,0.6)"; }}
              >
                ✕
              </button>
              {/* Title */}
              <div style={{
                fontSize: 17, letterSpacing: 4, color: "rgba(255,255,255,0.4)",
                marginBottom: 6, textAlign: "center", fontWeight: 600, marginTop: -24,
              }}>
                📊 COGNITIVE REPORT
              </div>
              <div style={{
                fontSize: 14, color: "rgba(255,255,255,0.3)", textAlign: "center", marginBottom: 20,
              }}>
                {metrics.totalSessions > 0 ? `총 ${metrics.totalSessions}회 훈련 기반 분석` : "훈련 기록 없음"}
              </div>

              {/* Empty state */}
              {metrics.totalSessions === 0 && (
                <div style={{
                  padding: "40px 20px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 62, marginBottom: 16 }}>🧠</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "rgba(255,255,255,0.7)" }}>
                    아직 게임 기록이 없습니다
                  </div>
                  <div style={{ fontSize: 16, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                    게임을 플레이하면 인지 능력 분석 리포트가<br />이곳에 표시됩니다
                  </div>
                  <button
                    onClick={() => setShowReport(false)}
                    style={{
                      marginTop: 24, padding: "12px 32px", fontSize: 17, fontWeight: 600,
                      fontFamily: "'Outfit', sans-serif",
                      background: "linear-gradient(135deg, #C084FC, #818CF8)",
                      color: "#fff", border: "none", borderRadius: 12,
                      cursor: "pointer",
                      WebkitAppearance: "none", WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    게임 시작하기
                  </button>
                </div>
              )}

              {/* All metrics content — only when data exists */}
              {metrics.totalSessions > 0 && (
                <div>
                  {/* Overall Score Card — expandable */}
                  <div style={{
                    marginBottom: 20, borderRadius: 16,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    overflow: "hidden",
                  }}>
                    {/* Score header — clickable */}
                    <div
                      onClick={() => { setReportDetailOpen(v => { if (!v) { setDetailAnimReady(false); setTimeout(() => setDetailAnimReady(true), 100); } return !v; }); }}
                      style={{
                        position: "relative",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        gap: 16, padding: "16px 20px",
                        cursor: "pointer",
                        WebkitTapHighlightColor: "transparent",
                        userSelect: "none",
                        overflow: "hidden",
                      }}
                    >
                      {/* Ripple hint — only when collapsed */}
                      {!reportDetailOpen && (
                        <div style={{
                          position: "absolute", right: 56, top: "50%",
                          width: 28, height: 28,
                          marginTop: -14,
                          borderRadius: "50%",
                          background: "rgba(192,132,252,0.15)",
                          animation: "rippleHint 2s ease-in-out infinite",
                          pointerEvents: "none",
                        }} />
                      )}
                      <div style={{ position: "relative" }}>
                        <ProgressRing value={reportAnimReady ? overallScore : 0} color="#C084FC" size={68} stroke={5} />
                        <div style={{
                          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <AnimatedNumber value={reportAnimReady ? overallScore : 0} color="#C084FC" fontSize={26} fontWeight={800} />
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>종합 인지 점수</div>
                        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
                          {overallScore >= 65 ? "매우 우수" : overallScore >= 45 ? "양호" : overallScore >= 25 ? "보통" : "훈련 초기"}
                        </div>
                      </div>
                      <div style={{
                        fontSize: 14, color: "rgba(255,255,255,0.35)",
                        transition: "transform 0.3s ease",
                        transform: reportDetailOpen ? "rotate(180deg)" : "rotate(0deg)",
                        flexShrink: 0,
                      }}>
                        ▼
                      </div>
                    </div>

                    {/* Expandable metric cards */}
                    <div style={{
                      maxHeight: reportDetailOpen ? 700 : 0,
                      opacity: reportDetailOpen ? 1 : 0,
                      overflow: "hidden",
                      transition: "max-height 0.35s ease, opacity 0.25s ease",
                    }}>
                      <div style={{
                        display: "flex", flexDirection: "column", gap: 6,
                        padding: "0 12px 14px",
                      }}>
                        {categories.map((cat) => {
                          const val = metrics[cat.key];
                          const trend = metrics[`${cat.key}Trend`];
                          const improvement = getTrendImprovement(trend);
                          return (
                            <div key={cat.key} style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "10px 12px", borderRadius: 12,
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid rgba(255,255,255,0.05)",
                            }}>
                              <div style={{ position: "relative", flexShrink: 0 }}>
                                <ProgressRing value={detailAnimReady ? val : 0} color={cat.color} size={42} stroke={3.5} />
                                <div style={{
                                  position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                  <AnimatedNumber value={detailAnimReady ? val : 0} color={cat.color} fontSize={14} />
                                </div>
                              </div>
                              <div style={{ minWidth: 62 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                                  {cat.icon} {cat.label}
                                </div>
                                <div style={{
                                  fontSize: 13,
                                  color: improvement > 0 ? "#00C9A7" : improvement < 0 ? "#FF6B6B" : "rgba(255,255,255,0.3)",
                                  fontWeight: 600,
                                }}>
                                  {improvement > 0 ? `▲ +${improvement}` : improvement < 0 ? `▼ ${improvement}` : "—"}
                                </div>
                              </div>
                              <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                                <Sparkline data={trend} color={cat.color} height={32} width={100} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Prevention Score Bar */}
                  <div style={{
                    padding: "14px 16px", borderRadius: 14,
                    background: "linear-gradient(135deg, rgba(0,201,167,0.08) 0%, rgba(77,168,255,0.08) 100%)",
                    border: "1px solid rgba(0,201,167,0.15)",
                    marginBottom: 18,
                  }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
                    }}>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>🛡️ 인지장애 예방 기여도</span>
                      <AnimatedNumber value={reportAnimReady ? metrics.preventionScore : 0} color="#00C9A7" fontSize={21} fontWeight={800} suffix="%" />
                    </div>
                    <div style={{
                      height: 6, borderRadius: 3,
                      background: "rgba(255,255,255,0.06)",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        background: "linear-gradient(90deg, #00C9A7, #4DA8FF)",
                        width: `${reportAnimReady ? metrics.preventionScore : 0}%`,
                        transition: "width 1s ease-out",
                      }} />
                    </div>
                  </div>

                  {/* Doctor's Comment */}
                  <div style={{
                    padding: "16px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                    }}>
                      <span style={{ fontSize: 26 }}>🩺</span>
                      <span style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>전문가 소견</span>
                    </div>
                    <p style={{
                      fontSize: 18, lineHeight: 1.8,
                      color: "rgba(255,255,255,0.55)",
                      margin: 0,
                      wordBreak: "keep-all",
                    }}>
                      {getDoctorComment()}
                    </p>
                  </div>
                </div>
              )}
            </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Event Modal ─── */}
      {showEventModal && rankings.length > 0 && getDDayCount() > 0 && (
        <div
          onClick={() => setShowEventModal(false)}
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1001, animation: "modalBackdropIn 0.25s ease-out",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative", padding: "28px 22px 22px", textAlign: "center",
              background: "linear-gradient(160deg, rgba(35,20,65,0.98) 0%, rgba(15,10,40,0.98) 100%)",
              borderRadius: 24,
              border: "1px solid rgba(255,215,0,0.15)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 80px rgba(255,215,0,0.06)",
              maxWidth: 360, width: "100%", maxHeight: "85vh", overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              animation: "modalFadeIn 0.35s cubic-bezier(0.34, 1.3, 0.64, 1)",
              fontFamily: "'Outfit', sans-serif", color: "#fff",
            }}
          >
            {/* Close */}
            <button onClick={() => setShowEventModal(false)} style={{
              position: "absolute", top: 12, right: 14,
              background: "none", border: "none", color: "rgba(255,255,255,0.3)",
              fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 4,
            }}>✕</button>

            {/* Title */}
            <div style={{ fontSize: 42, marginBottom: 2 }}>☕</div>
            <div style={{
              fontSize: 11, letterSpacing: 4, color: "rgba(255,215,0,0.7)", fontWeight: 700, marginBottom: 4,
            }}>SPECIAL EVENT</div>
            <div style={{
              fontSize: 18, fontWeight: 800, marginBottom: 14,
              background: "linear-gradient(135deg, #FFD93D, #FF8C42)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>CUBE PATTERN CHALLENGE</div>

            {/* D-Day */}
            <div style={{
              display: "inline-block", padding: "6px 22px", borderRadius: 30,
              background: "linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,140,66,0.15))",
              border: "1px solid rgba(255,215,0,0.25)",
              fontSize: 22, fontWeight: 900, color: "#FFD93D", letterSpacing: 2,
              animation: "eventPulse 2s ease-in-out infinite",
              marginBottom: 18,
            }}>D-{getDDayCount()}</div>

            {/* Event date */}
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
              📅 2026.03.30 (월) AM 9:00 기준 순위 확정
            </div>

            {/* Hooking text */}
            <div style={{
              padding: "14px 16px", borderRadius: 14,
              background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.08)",
              marginBottom: 16, textAlign: "left",
              fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.75)",
              animation: "eventSlideUp 0.5s ease-out 0.2s both",
            }}>
              🔥 <span style={{ color: "#FFD93D", fontWeight: 700 }}>매일 플레이할수록 순위가 올라갑니다!</span><br/>
              지금 이 순간에도 순위가 바뀌고 있어요.<br/>
              상위권에 도전해서 <span style={{ color: "#00C9A7", fontWeight: 700 }}>스타벅스 커피 쿠폰</span>을 받아가세요! ☕
            </div>

            {/* Prizes */}
            <div style={{
              display: "flex", flexDirection: "column", gap: 8, marginBottom: 18,
              animation: "eventSlideUp 0.5s ease-out 0.35s both",
            }}>
              {[
                { medal: "🥇", rank: "1등", cups: 3, color: "#FFD93D" },
                { medal: "🥈", rank: "2등", cups: 2, color: "#C0C0C0" },
                { medal: "🥉", rank: "3등", cups: 1, color: "#CD7F32" },
              ].map((p) => (
                <div key={p.rank} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 12,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <span style={{ fontSize: 22 }}>{p.medal}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: p.color, minWidth: 28 }}>{p.rank}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                    스타벅스 커피 쿠폰 <span style={{ color: "#fff", fontWeight: 700 }}>{p.cups}장</span>
                  </span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={() => setShowEventModal(false)}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 16,
                background: "linear-gradient(135deg, #FF3B5C, #FF8C42)",
                border: "none", color: "#fff", fontSize: 16, fontWeight: 800,
                cursor: "pointer", letterSpacing: 1,
                boxShadow: "0 6px 24px rgba(255,59,92,0.3)",
                animation: "eventSlideUp 0.5s ease-out 0.65s both",
              }}
            >
              🎮 지금 도전하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
