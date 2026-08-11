/**
 * 康樂球 — 渲染、輸入（拖曳彈射）、AI、HUD。UI 層，物理在 game.js。
 */
import {
  W, H, RAIL, COLOR_BLACK, COLOR_WHITE, initialLayout, newGame, shoot,
  tick, allResting, resolveRound, countRemaining, aimInfo,
} from "./game.js";
import { CarromAudio } from "./audio.js";

const BEST_KEY = "pg-carrom-best";
const audio = new CarromAudio();

const els = {
  canvas: document.getElementById("game"),
  turn: document.getElementById("turn"),
  blackLeft: document.getElementById("black-left"),
  whiteLeft: document.getElementById("white-left"),
  blackChip: document.getElementById("black-chip"),
  whiteChip: document.getElementById("white-chip"),
  score: document.getElementById("score"),
  status: document.getElementById("status"),
  btnStart: document.getElementById("btn-start"),
  btnMute: document.getElementById("btn-mute"),
};
const ctx = els.canvas.getContext("2d");

let state = null;
let best = 0;
let humanPlaysWhite = true; // 人機：人=白，AI=黑
let vsAI = true;
let drag = null; // {px,py}
let pointerId = null;
let resolving = false;

const sfx = {};
const SOUNDS = {
  woodlight: "assets/sfx/impactWood_light_000.ogg",
  woodmedium: "assets/sfx/impactWood_medium_000.ogg",
  woodheavy: "assets/sfx/impactWood_heavy_000.ogg",
  metal: "assets/sfx/impactMetal_medium_000.ogg",
  plate: "assets/sfx/impactPlate_medium_000.ogg",
};
for (const [k, path] of Object.entries(SOUNDS)) {
  const a = new Audio(path);
  a.preload = "auto";
  sfx[k] = a;
}

function playSfx(name, rate = 1) {
  if (!audio.enabled) return;
  const a = sfx[name];
  if (!a) return;
  try {
    const clone = a.cloneNode();
    clone.volume = 0.7;
    clone.playbackRate = rate;
    clone.play().catch(() => {});
  } catch {
    /* */
  }
}

function setStatus(msg, tone = "") {
  els.status.textContent = msg;
  els.status.dataset.tone = tone;
}

function colorZh(c) {
  return c === COLOR_WHITE ? "白" : "黑";
}

function myColor() {
  return humanPlaysWhite ? COLOR_WHITE : COLOR_BLACK;
}

function canvasPos(ev) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * W,
    y: ((ev.clientY - rect.top) / rect.height) * H,
  };
}

function loadBest() {
  try {
    return Math.max(0, Number(localStorage.getItem(BEST_KEY) || 0));
  } catch {
    return 0;
  }
}
async function loadBestRemote() {
  try {
    const res = await fetch(`/api/kv/${BEST_KEY}`);
    if (res.ok) {
      const t = (await res.text()).trim();
      if (/^\d+$/.test(t)) best = Number(t);
    }
  } catch {}
  els.score.textContent = String(best);
}
async function saveBestRemote(v) {
  els.score.textContent = String(v);
  try {
    await fetch(`/api/kv/${BEST_KEY}`, { method: "PUT", body: String(v) });
  } catch {}
}

function start() {
  audio.unlock();
  audio.click();
  state = newGame();
  state.humanPlaysWhite = humanPlaysWhite;
  drag = null;
  resolving = false;
  setStatus(`白方先手${vsAI ? "（你）" : ""}：拖曳打擊珠彈射`);
  render();
}

function handleShoot(pointer) {
  if (!state || state.over || state.phase !== "aim") return;
  if (vsAI && state.turn !== myColor()) return;
  audio.unlock();
  playSfx("woodlight");
  const ev = shoot(state, pointer);
  playSfx("metal");
  if (ev.length === 0) return;
  setStatus(`${colorZh(state.turn)}方彈射中…`);
}

function stepPhysics() {
  if (!state || state.phase !== "moving") return;
  const events = tick(state);
  for (const e of events) {
    if (e.type === "bump") {
      audio.unlock();
      playSfx("woodmedium", 0.9 + Math.random() * 0.4);
    } else if (e.type === "wall") {
      playSfx("woodlight", 0.7);
    } else if (e.type === "pot") {
      const who = e.who === "striker" ? "striker" : e.who;
      if (who === "striker") playSfx("woodheavy");
      else if (who === (humanPlaysWhite ? COLOR_WHITE : COLOR_BLACK)) playSfx("plate", 1.2);
      else playSfx("plate", 0.8);
      audio.pot();
    }
  }
  if (allResting(state)) {
    state.phase = "aim";
    finishMove();
  }
}

function finishMove() {
  if (!state || state.over) return;
  resolving = true;
  const potted = state.pieces.filter((p) => p.potted);
  const events = resolveRound(state);
  for (const e of events) {
    if (e.type === "win") {
      audio.win();
      const humanWon = e.winner === myColor() && vsAI;
      setStatus(e.message, humanWon ? "ok" : "warn");
    } else if (e.type === "foul") {
      audio.lose();
      setStatus(e.message, "warn");
    } else if (e.type === "turn") {
      setStatus(e.message, "");
    }
  }
  if (potted.length) {}
  render();
  resolving = false;
  if (state.over && vsAI) {
    if (state.winner === myColor()) {
      const winScore = 3;
      if (winScore > best) {
        best = winScore;
        saveBestRemote(best);
      }
    }
    return;
  }
  // AI 回合
  if (vsAI && !state.over && state.turn !== myColor()) {
    setTimeout(aiShoot, 700);
  }
}

function aiShoot() {
  if (!state || state.over) return;
  if (state.phase !== "aim") return;
  if (vsAI && state.turn === myColor()) return;
  const st = state.striker;
  // 找最近的敵方棋子（AI 目標），沿反向拖曳
  const targets = state.pieces.filter((p) => !p.potted && p.kind === "piece" && p.color !== state.turn);
  const nearest = targets.reduce((a, b) =>
    (Math.hypot(b.x - st.x, b.y - st.y) < Math.hypot(a.x - st.x, a.y - st.y) ? b : a));
  const ang = Math.atan2(nearest.y - st.y, nearest.x - st.x);
  // 拖曳終點放在與瞄準相反方向、距離 70
  const aimDist = 70;
  const pointer = { x: st.x - Math.cos(ang) * aimDist, y: st.y - Math.sin(ang) * aimDist };
  const ev = shoot(state, pointer);
  if (ev.length > 0) {
    playSfx("woodlight");
    setStatus(`AI（${colorZh(state.turn)}）彈射中…`);
  }
  if (ev.length === 0) {
    // 沒有目標可瞄（理論上不會）→ 亂射
    const pointer2 = { x: st.x - 60, y: st.y - 30 };
    shoot(state, pointer2);
  }
}

/** 渲染。 */
function render() {
  if (!ctx) return;
  // HUD
  els.turn.textContent = state ? colorZh(state.turn) : "白";
  els.blackLeft.textContent = state ? String(countRemaining(state, COLOR_BLACK)) : "6";
  els.whiteLeft.textContent = state ? String(countRemaining(state, COLOR_WHITE)) : "6";
  els.blackChip.dataset.active = state && state.turn === COLOR_BLACK ? "true" : "false";
  els.whiteChip.dataset.active = state && state.turn === COLOR_WHITE ? "true" : "false";

  // 桌面
  ctx.clearRect(0, 0, W, H);
  drawTable();

  if (state) {
    for (const p of state.pieces) {
      if (p.potted) continue;
      if (p.kind === "queen") drawDisc(p, { fill: "#f7e26b", ring: "#b8992e" });
      else if (p.color === COLOR_BLACK) drawDisc(p, { fill: "#2a2e33", ring: "#111318" });
      else drawDisc(p, { fill: "#f5f7f8", ring: "#b8c0c8" });
    }
    drawDisc(state.striker, { fill: myColor() === COLOR_WHITE ? "#fff" : "#2a2e33", ring: "#f4b400", striker: true });

    // 瞄準線
    if (drag && state.phase === "aim" && state.turn === myColor()) {
      const st = state.striker;
      const info = aimInfo(state, drag);
      const len = Math.min(info.dist, 120);
      if (len > 6) {
        const inv = 1 / Math.max(1e-6, info.dist);
        const ex = -info.dx * inv;
        const ey = -info.dy * inv;
        ctx.strokeStyle = "rgba(244,180,0,0.85)";
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.lineTo(st.x + ex * len, st.y + ey * len);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

function drawTable() {
  // 木桌
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#7a4a21");
  g.addColorStop(0.5, "#5d3a18");
  g.addColorStop(1, "#7a4a21");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 內場
  ctx.fillStyle = "#3c2b1c";
  ctx.fillRect(RAIL, RAIL, W - RAIL * 2, H - RAIL * 2);
  // 中心圓
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 50, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 8, 0, Math.PI * 2);
  ctx.stroke();
  // 口袋（角落圓洞）
  for (const [x, y] of [[RAIL, RAIL], [W - RAIL, RAIL], [RAIL, H - RAIL], [W - RAIL, H - RAIL]]) {
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawDisc(p, { fill, ring, striker = false }) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  const rg = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.2, p.x, p.y, p.r);
  rg.addColorStop(0, lighten(fill));
  rg.addColorStop(1, fill);
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = striker ? 2.5 : 1.5;
  ctx.stroke();
  if (striker) {
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function lighten(hex) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 60);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 60);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 60);
  return `rgb(${r},${g},${b})`;
}

function frame() {
  stepPhysics();
  render();
  requestAnimationFrame(frame);
}

// 輸入
els.canvas.addEventListener("pointerdown", (ev) => {
  audio.unlock();
  if (!state || state.over || state.phase !== "aim") return;
  if (vsAI && state.turn !== myColor()) return;
  pointerId = ev.pointerId;
  els.canvas.setPointerCapture(ev.pointerId);
  drag = canvasPos(ev);
});
els.canvas.addEventListener("pointermove", (ev) => {
  if (drag && pointerId === ev.pointerId) drag = canvasPos(ev);
});
els.canvas.addEventListener("pointerup", (ev) => {
  if (pointerId !== ev.pointerId) return;
  pointerId = null;
  if (drag) {
    const p = drag;
    drag = null;
    handleShoot(p);
  }
});
els.canvas.addEventListener("pointercancel", () => {
  pointerId = null;
  drag = null;
});

els.btnStart.addEventListener("click", () => {
  audio.unlock();
  start();
});
els.btnMute.addEventListener("click", () => {
  audio.unlock();
  const on = els.btnMute.getAttribute("aria-pressed") !== "true";
  els.btnMute.setAttribute("aria-pressed", on ? "true" : "false");
  els.btnMute.textContent = on ? "音效" : "靜音";
  audio.setEnabled(on);
  audio.click();
});

// 模式切換：長按開始？簡化——按「人機／雙人」切換
const btnMode = document.createElement("button");
btnMode.type = "button";
btnMode.className = "ghost";
btnMode.textContent = "人機";
btnMode.setAttribute("aria-pressed", "true");
const controlsEl = document.querySelector(".controls");
controlsEl.appendChild(btnMode);
btnMode.addEventListener("click", () => {
  audio.unlock();
  vsAI = !vsAI;
  btnMode.textContent = vsAI ? "人機" : "雙人";
  audio.click();
  if (state && !state.over) {
    if (!vsAI || state.turn === myColor()) setStatus("輪到你彈射");
    else setTimeout(aiShoot, 600);
  }
});

best = loadBest();
els.score.textContent = String(best);
state = newGame();
state.humanPlaysWhite = humanPlaysWhite;
setStatus("白方先手：拖曳打擊珠彈射");
render();
loadBestRemote();
requestAnimationFrame(frame);
