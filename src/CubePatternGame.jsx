import { useState, useRef, useCallback, useEffect } from "react";
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

const MODE_ICONS = { color: "🎨", number: "3", animal: "🐾", fruit: "🍎" };
const FACE_CONTENT = {
  number: { front: "1", back: "2", top: "3", bottom: "4", left: "5", right: "6" },
  animal: { front: "🐱", back: "🐶", top: "🐦", bottom: "🐟", left: "🐰", right: "🐻" },
  fruit: { front: "🍎", back: "🍌", top: "🍇", bottom: "🍒", left: "🍓", right: "🍊" },
};

// Safari-compatible 3D style helpers
const preserve3d = { transformStyle: "preserve-3d", WebkitTransformStyle: "preserve-3d" };
const hiddenBack = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

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

// ─── Ranking localStorage persistence ───
const RANKING_STORAGE_KEY = "cubePatternRankings";
const MAX_RANKINGS = 10;

function loadRankings() {
  try {
    const data = localStorage.getItem(RANKING_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}
function persistRankings(r) {
  try { localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(r)); } catch {}
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
export default function CubePatternGame() {
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
  const [score, setScore] = useState(0);
  const [pattern, setPattern] = useState([]);
  const [showIndex, setShowIndex] = useState(-1);
  const [playerInput, setPlayerInput] = useState([]);
  const [message, setMessage] = useState("");
  const [highlightFace, setHighlightFace] = useState(null);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [shakeAnim, setShakeAnim] = useState(false);
  const [cubeUnfolded, setCubeUnfolded] = useState(false);
  const [glowEdges, setGlowEdges] = useState(false);
  const [edgeBreathing, setEdgeBreathing] = useState(false);
  const [gameMode, setGameMode] = useState("color");
  const [lidOpen, setLidOpen] = useState(false);
  const [droppingIcon, setDroppingIcon] = useState(null);
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
  // Round countdown (10s per question)
  const ROUND_TIME_LIMIT = 10000;
  const [roundTimeLeft, setRoundTimeLeft] = useState(ROUND_TIME_LIMIT);
  const roundTimerRef = useRef(null);
  const roundTimeoutRef = useRef(null);
  const patternLength = level + 2;
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

  // ─── Load rankings on mount ───
  useEffect(() => {
    const stored = loadRankings();
    setRankings(stored);
    if (stored.length > 0) setBestScore(Math.max(...stored.map((r) => r.score)));
  }, []);

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
      roundTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, ROUND_TIME_LIMIT - (Date.now() - start));
        setRoundTimeLeft(remaining);
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
    setScore(0);
    setLevel(1);
    setLives(3);
    setCombo(0);
    setTotalAttempts(0);
    setCorrectAttempts(0);
    resetTimer();
    setShowRanking(false);
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
    // Phase 4 (3200ms): game starts + timer starts
    setTimeout(() => { startTimer(); startRound(1); }, 3200);
  };
  const handleModeSelect = (mode) => {
    if (mode === gameMode) return;
    if (gameState === "folding" || gameState === "lidAnim") return;
    const wasPlaying = gameState !== "idle" && gameState !== "gameover";
    if (wasPlaying) resetTimer();
    // Phase 1: lid animation (no overlay — cube visible)
    setGameState("lidAnim");
    setMessage("");
    setLidOpen(true);
    // Phase 2: icon drops into cube
    setTimeout(() => setDroppingIcon(MODE_ICONS[mode]), 800);
    // Phase 3: close lid, set new mode
    setTimeout(() => {
      setLidOpen(false);
      setDroppingIcon(null);
      setGameMode(mode);
    }, 2000);
    // Phase 4: show start button (inline if was playing, overlay if from idle)
    setTimeout(() => {
      setGlowEdges(false);
      setEdgeBreathing(false);
      setGameState(wasPlaying ? "modeReady" : "idle");
      setMessage(wasPlaying ? "모드가 변경되었습니다!" : "");
    }, 2600);
  };
  const startRound = (lvl) => {
    const p = generatePattern(lvl + 2);
    setPattern(p);
    setPlayerInput([]);
    setGameState("showing");
    setMessage(`레벨 ${lvl} — 패턴을 기억하세요!`);
    showPattern(p);
  };
  const showPattern = (p) => {
    let i = 0;
    setShowIndex(-1);
    const interval = setInterval(() => {
      if (i < p.length) {
        setShowIndex(i);
        setHighlightFace(p[i]);
        setTimeout(() => {
          setHighlightFace(null);
        }, 500);
        i++;
      } else {
        clearInterval(interval);
        setShowIndex(-1);
        setGameState("input");
        setMessage("큐브를 돌려서 면을 터치하세요!");
      }
    }, 800);
  };
  const handleFaceClick = useCallback(
    (faceKey) => {
      if (gameState !== "input") return;
      if (isDragMove.current) return;
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
        setShakeAnim(true);
        setTimeout(() => setShakeAnim(false), 500);
        if (newLives <= 0) {
          stopTimer();
          setGameState("gameover");
          setGlowEdges(false);
          setEdgeBreathing(false);
          setMessage(`게임 오버! 최종 스코어: ${score}`);
          if (score > bestScore) setBestScore(score);
          // Save ranking
          const finalAcc = totalAttempts + 1 > 0 ? Math.round((correctAttempts / (totalAttempts + 1)) * 100) : 0;
          const composite = calculateCompositeScore(score, elapsedTime, finalAcc);
          const entry = { score, level, time: elapsedTime, accuracy: finalAcc, compositeScore: composite, gameMode, date: new Date().toISOString() };
          const updated = [...loadRankings(), entry].sort((a, b) => b.compositeScore - a.compositeScore).slice(0, MAX_RANKINGS);
          persistRankings(updated);
          setRankings(updated);
          setBestScore(Math.max(score, bestScore));
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
        const bonus = newCombo >= 3 ? 50 : newCombo >= 2 ? 20 : 0;
        const earned = level * 100 + bonus;
        const newScore = score + earned;
        setScore(newScore);
        setMessage(
          bonus > 0
            ? `🔥 ${newCombo}콤보! +${earned}점`
            : `정답! +${earned}점`
        );
        setGameState("correct");
        setTimeout(() => {
          const nextLvl = level + 1;
          setLevel(nextLvl);
          startRound(nextLvl);
        }, 1500);
      }
    },
    [gameState, playerInput, pattern, score, level, lives, combo, bestScore, totalAttempts, correctAttempts, elapsedTime, gameMode, stopTimer]
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
      const entry = { score, level, time: elapsedTime, accuracy: finalAcc, compositeScore: composite, gameMode, date: new Date().toISOString() };
      const updated = [...loadRankings(), entry].sort((a, b) => b.compositeScore - a.compositeScore).slice(0, MAX_RANKINGS);
      persistRankings(updated);
      setRankings(updated);
      setBestScore(Math.max(score, bestScore));
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

  return (
    <div
      style={{
        minHeight: "100vh",
        minHeight: "100dvh",
        background: "linear-gradient(145deg, #0a0a1a 0%, #1a1a3e 40%, #0d0d2b 100%)",
        color: "#fff",
        fontFamily: "'Outfit', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
        WebkitOverflowScrolling: "touch",
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
      `}</style>
      {/* Background orbs */}
      <div style={{
        position: "absolute", top: "10%", left: "15%", width: 300, height: 300,
        background: "radial-gradient(circle, rgba(255,59,92,0.08) 0%, transparent 70%)",
        borderRadius: "50%", pointerEvents: "none", animation: "glow 4s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", top: "50%", right: "10%", width: 250, height: 250,
        background: "radial-gradient(circle, rgba(77,168,255,0.08) 0%, transparent 70%)",
        borderRadius: "50%", pointerEvents: "none", animation: "glow 5s ease-in-out infinite 1s",
      }} />
      {/* Header */}
      <div style={{
        width: "100%", maxWidth: 500, padding: "24px 20px 0",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        position: "relative", zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>
            CUBE PATTERN
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>
            패턴 매칭
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2 }}>BEST</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{bestScore}</div>
        </div>
      </div>
      {/* Mode selector - visible during gameplay, clickable */}
      {gameState !== "idle" && gameState !== "gameover" && gameState !== "folding" && gameState !== "lidAnim" && (
        <div style={{
          display: "flex", gap: 8, padding: "10px 20px 0", position: "relative", zIndex: 10,
        }}>
          {["color", "number", "animal", "fruit"].map((mode) => (
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
      {/* Stats bar */}
      {gameState !== "idle" && gameState !== "gameover" && gameState !== "folding" && gameState !== "lidAnim" && gameState !== "modeReady" && (
        <div style={{
          display: "flex", gap: 16, padding: "16px 20px", maxWidth: 520, width: "100%",
          justifyContent: "center", position: "relative", zIndex: 10, alignItems: "center",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 2 }}>LEVEL</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{level}</div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 2 }}>SCORE</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{score}</div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 2 }}>TIME</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatTime(elapsedTime)}</div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 2 }}>LIVES</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {"❤️".repeat(lives)}{"🖤".repeat(Math.max(0, 3 - lives))}
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 2 }}>ACC</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: accuracy === 100 ? "#00C9A7" : "#fff" }}>{accuracy}%</div>
          </div>
          {combo >= 2 && (
            <>
              <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#FFD93D", letterSpacing: 2, marginBottom: 2 }}>COMBO</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#FFD93D" }}>×{combo}</div>
              </div>
            </>
          )}
        </div>
      )}
      {/* Pattern display */}
      {gameState !== "idle" && gameState !== "gameover" && gameState !== "folding" && gameState !== "lidAnim" && gameState !== "modeReady" && (
        <div style={{
          display: "flex", gap: 10, padding: "12px 20px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)",
          margin: "8px 20px", flexWrap: "wrap", justifyContent: "center",
          maxWidth: 460, position: "relative", zIndex: 10,
        }}>
          {pattern.map((fKey, i) => {
            const isRevealed = gameState === "showing" && i <= showIndex;
            const isPlayerFilled = gameState === "input" && i < playerInput.length;
            const isCurrent = gameState === "input" && i === playerInput.length;
            if (isRevealed) {
              return <ColorDot key={i} faceKey={fKey} size={32} pulse gameMode={gameMode} />;
            }
            if (isPlayerFilled) {
              return <ColorDot key={i} faceKey={playerInput[i]} size={32} pulse gameMode={gameMode} />;
            }
            return (
              <div
                key={i}
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isCurrent ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                  border: isCurrent ? "2px dashed rgba(255,255,255,0.4)" : "2px solid rgba(255,255,255,0.08)",
                  transition: "all 0.3s",
                }}
              />
            );
          })}
        </div>
      )}
      {/* Round countdown bar */}
      {gameState === "input" && (
        <div style={{
          maxWidth: 460, width: "calc(100% - 40px)", margin: "6px 20px 0",
          position: "relative", zIndex: 10,
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
      {/* Message */}
      <div style={{
        padding: "12px 0", fontSize: 15, fontWeight: 400,
        color: "rgba(255,255,255,0.7)", textAlign: "center",
        minHeight: 44, display: "flex", alignItems: "center",
        position: "relative", zIndex: 10,
      }}>
        {message}
      </div>
      {/* 3D Cube area */}
      <div
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          width: "100%", minHeight: 280, paddingBottom: 60, cursor: "grab",
          touchAction: "none", WebkitTouchCallout: "none",
          position: "relative", zIndex: 10,
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
      {/* Inline start button — shown after mode switch during gameplay */}
      {gameState === "modeReady" && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          position: "relative", zIndex: 20, marginTop: -40,
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
          justifyContent: "center", zIndex: 100,
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
                레벨 {level}까지 도달 {score >= bestScore && score > 0 ? "— 🏆 새로운 최고 기록!" : ""}
              </div>
              <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 4 }}>TIME</div>
                  <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatTime(elapsedTime)}</div>
                </div>
                <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 4 }}>ACCURACY</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: accuracy === 100 ? "#00C9A7" : "#fff" }}>{accuracy}%</div>
                </div>
                <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 4 }}>RANK SCORE</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#FFD93D" }}>{calculateCompositeScore(score, elapsedTime, accuracy)}</div>
                </div>
              </div>
            </div>
          )}
          {gameState === "idle" && (
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 42, fontWeight: 800, marginBottom: 8, letterSpacing: -1 }}>
                CUBE<br/>PATTERN
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, maxWidth: 280 }}>
                3D 큐브를 드래그하여 회전시키고<br/>
                패턴 순서대로 면을 터치하세요
              </div>
            </div>
          )}
          {/* How to play */}
          {gameState === "idle" && (
            <div style={{
              display: "flex", gap: 20, marginBottom: 36, padding: "0 20px",
            }}>
              {[
                { icon: "👀", text: "패턴 기억" },
                { icon: "🔄", text: "큐브 회전" },
                { icon: "👆", text: "면 터치" },
              ].map((s, i) => (
                <div key={i} style={{
                  textAlign: "center", padding: "16px 12px",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)",
                  minWidth: 80,
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{s.text}</div>
                </div>
              ))}
            </div>
          )}
          {/* Mode selector inside overlay */}
          {(gameState === "idle" || gameState === "gameover") && (
            <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
              {["color", "number", "animal", "fruit"].map((mode) => (
                <button
                  key={mode}
                  onClick={(e) => { e.stopPropagation(); handleModeSelect(mode); }}
                  style={{
                    width: 48, height: 48, borderRadius: 14,
                    border: gameMode === mode ? "2px solid rgba(255,255,255,0.7)" : "2px solid rgba(255,255,255,0.15)",
                    background: gameMode === mode ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.04)",
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
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <button
                onClick={startGame}
                style={{
                  padding: "16px 48px", fontSize: 16, fontWeight: 700,
                  fontFamily: "'Outfit', sans-serif",
                  background: "linear-gradient(135deg, #FF3B5C, #FF8A5C)",
                  color: "#fff", border: "none", borderRadius: 50,
                  cursor: "pointer", letterSpacing: 1,
                  boxShadow: "0 4px 24px rgba(255,59,92,0.4)",
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
                {gameState === "gameover" ? "다시 도전" : "게임 시작"}
              </button>
              {rankings.length > 0 && (
                <button
                  onClick={() => setShowRanking(!showRanking)}
                  style={{
                    padding: "10px 32px", fontSize: 13, fontWeight: 600,
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
                  {showRanking ? "닫기" : "🏆 랭킹 보기"}
                </button>
              )}
            </div>
          )}
          {/* ─── RANKING TABLE ─── */}
          {showRanking && rankings.length > 0 && (
            <div style={{
              marginTop: 16, padding: "16px 20px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
              maxWidth: 440, width: "90%", maxHeight: 340, overflowY: "auto",
            }}>
              <div style={{ fontSize: 12, letterSpacing: 3, color: "rgba(255,255,255,0.4)", marginBottom: 14, textAlign: "center", fontWeight: 600 }}>
                TOP RANKINGS
              </div>
              {/* Table header */}
              <div style={{ display: "flex", padding: "0 12px 8px", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1, borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 6 }}>
                <div style={{ width: 24 }}>#</div>
                <div style={{ flex: 1 }}>SCORE</div>
                <div style={{ width: 44, textAlign: "center" }}>LV</div>
                <div style={{ width: 56, textAlign: "center" }}>TIME</div>
                <div style={{ width: 44, textAlign: "center" }}>ACC</div>
                <div style={{ width: 28, textAlign: "center" }}>MODE</div>
                <div style={{ width: 70, textAlign: "right" }}>DATE</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {rankings.map((entry, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center",
                    padding: "8px 12px", borderRadius: 10,
                    background: i === 0 ? "rgba(255,215,0,0.06)" : "rgba(255,255,255,0.015)",
                    border: i < 3 ? "1px solid rgba(255,215,0,0.12)" : "1px solid rgba(255,255,255,0.04)",
                    fontSize: 13,
                  }}>
                    <div style={{ width: 24, fontWeight: 700, color: i < 3 ? "#FFD93D" : "rgba(255,255,255,0.35)", fontSize: 14 }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </div>
                    <div style={{ flex: 1, fontWeight: 700 }}>{entry.score}<span style={{ fontSize: 10, fontWeight: 400, color: "rgba(255,255,255,0.4)", marginLeft: 2 }}>pts</span></div>
                    <div style={{ width: 44, textAlign: "center", color: "rgba(255,255,255,0.6)" }}>{entry.level}</div>
                    <div style={{ width: 56, textAlign: "center", fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.6)" }}>{formatTime(entry.time)}</div>
                    <div style={{ width: 44, textAlign: "center", color: entry.accuracy === 100 ? "#00C9A7" : "rgba(255,255,255,0.6)" }}>{entry.accuracy}%</div>
                    <div style={{ width: 28, textAlign: "center" }}>{MODE_ICONS[entry.gameMode] || "?"}</div>
                    <div style={{ width: 70, textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                      {new Date(entry.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
