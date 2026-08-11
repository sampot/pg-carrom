/**
 * pg-carrom — 康樂球（彈珠）純函式物理＋規則邏輯。
 *
 * 俯視方形桌面，四角落各有口袋。中央有「王」（Queen）與 4 顆玩家
 * 打擊珠之外，另有散落的普通棋子（黑／白）。玩家以手指／滑鼠拖曳
 * 自己的「打擊珠」（striker）彈射，擊中棋子推進口袋得分。
 *
 * 簡化規則（本實作）：
 *  - 黑方吃黑棋、白方吃白棋；率先吃完己方全部棋子＋最後進「王」者勝。
 *  - 王只在己方棋子全部進袋後才可合法打進；早進判犯規並重擺王。
 *  - 回合制（黑白輪替）；打擊珠進袋判犯規、換手並重擺打擊珠。
 *  - 物理：圓形碰撞、摩擦、彈性、口袋吸附（固定 dt=1 的離散 tick）。
 *
 * 對外用函式回傳事件陣列；所有函式皆純函式、不碰 DOM。
 */

export const W = 360; // 邏輯桌面寬
export const H = 360; // 邏輯桌面高
export const RAIL = 8; // 邊框厚度
export const POCKET_R = 26; // 口袋半徑
export const STRIKER_R = 13;
export const PIECE_R = 11;
export const QUEEN_R = 14;

export const COLOR_BLACK = "black";
export const COLOR_WHITE = "white";

export const BLACK_PIECES = 6; // 每色普通棋子數

export const FRICTION = 0.985; // 每 tick 速度衰減
export const REST_SPEED = 0.04; // 低於此視為靜止
export const ELASTICITY = 0.92; // 彈性

const CORNER_PTS = [
  [RAIL, RAIL],
  [W - RAIL, RAIL],
  [RAIL, H - RAIL],
  [W - RAIL, H - RAIL],
];

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 口袋位置（四角落，內縮於邊框內）。 */
export function pocketCenters() {
  return CORNER_PTS.map(([x, y]) => ({ x, y }));
}

/** 建立初始佈局：中央女王＋對稱棋子＋打擊珠。 */
export function initialLayout() {
  const pieces = [];
  const cx = W / 2;
  const cy = H / 2;
  pieces.push({ kind: "queen", color: "queen", x: cx, y: cy, r: QUEEN_R, vx: 0, vy: 0, potted: false });
  const blackSpots = [
    [cx - 46, cy - 46], [cx - 70, cy - 28], [cx - 28, cy - 70],
    [cx - 92, cy - 6], [cx - 6, cy - 92], [cx - 60, cy - 60],
  ];
  const whiteSpots = [
    [cx + 46, cy + 46], [cx + 70, cy + 28], [cx + 28, cy + 70],
    [cx + 92, cy + 6], [cx + 6, cy + 92], [cx + 60, cy + 60],
  ];
  for (let i = 0; i < BLACK_PIECES; i++) {
    const [x, y] = blackSpots[i];
    pieces.push({ kind: "piece", color: COLOR_BLACK, x, y, r: PIECE_R, vx: 0, vy: 0, potted: false });
  }
  for (let i = 0; i < BLACK_PIECES; i++) {
    const [x, y] = whiteSpots[i];
    pieces.push({ kind: "piece", color: COLOR_WHITE, x, y, r: PIECE_R, vx: 0, vy: 0, potted: false });
  }
  const striker = {
    color: COLOR_WHITE, kind: "striker",
    x: W / 2, y: H - RAIL - STRIKER_R - 2, r: STRIKER_R, vx: 0, vy: 0, potted: false,
  };
  return { pieces, striker, turn: COLOR_WHITE, phase: "aim", over: false, winner: null, message: "" };
}

/** 建立新局。 */
export function newGame() {
  const s = initialLayout();
  s.message = "白方先手：拖曳打擊珠再放開彈射";
  return s;
}

/** 拖曳資訊（供 UI 畫瞄準線）。 */
export function aimInfo(state, pointer) {
  const st = state.striker;
  return { dx: pointer.x - st.x, dy: pointer.y - st.y, dist: dist(st, pointer) };
}

/** 發射：以拖曳終點反向衝量。回傳事件。 */
export function shoot(state, pointer) {
  const info = aimInfo(state, pointer);
  const power = Math.min(info.dist, 120);
  if (power < 6) return [];
  const inv = power > 1e-6 ? 1 / Math.max(1e-6, info.dist) : 0;
  state.striker.vx = -info.dx * inv * power * 6.5;
  state.striker.vy = -info.dy * inv * power * 6.5;
  state.phase = "moving";
  return [{ type: "shoot", turn: state.turn }];
}

/** 口袋吸附：距角落夠近 → 進袋。 */
export function potIfIn(state, piece) {
  for (const [px, py] of CORNER_PTS) {
    if (Math.hypot(piece.x - px, piece.y - py) < POCKET_R + piece.r * 0.6) {
      piece.potted = true;
      return { corner: [px, py] };
    }
  }
  return null;
}

/** 與牆壁碰撞（內縮方形邊界）。 */
export function collideWall(p) {
  let hit = false;
  if (p.x - p.r < RAIL) {
    p.x = RAIL + p.r;
    p.vx = Math.abs(p.vx) * ELASTICITY;
    hit = true;
  } else if (p.x + p.r > W - RAIL) {
    p.x = W - RAIL - p.r;
    p.vx = -Math.abs(p.vx) * ELASTICITY;
    hit = true;
  }
  if (p.y - p.r < RAIL) {
    p.y = RAIL + p.r;
    p.vy = Math.abs(p.vy) * ELASTICITY;
    hit = true;
  } else if (p.y + p.r > H - RAIL) {
    p.y = H - RAIL - p.r;
    p.vy = -Math.abs(p.vy) * ELASTICITY;
    hit = true;
  }
  return hit;
}

/** 兩圓彈性碰撞（等質量）。 */
export function collideDisc(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const min = a.r + b.r;
  if (d >= min) return false;
  const nx = dx / d;
  const ny = dy / d;
  const overlap = min - d;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;
  const rvx = a.vx - b.vx;
  const rvy = a.vy - b.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn <= 0) return true; // 已分離（相離），不再加衝量
  const imp = (-(1 + ELASTICITY) * vn) * 0.5;
  a.vx += imp * nx;
  a.vy += imp * ny;
  b.vx -= imp * nx;
  b.vy -= imp * ny;
  return true;
}

/** 所有在桌上的物體是否靜止。 */
export function allResting(state) {
  const bodies = [state.striker, ...state.pieces.filter((p) => !p.potted)];
  return bodies.every((p) => Math.hypot(p.vx, p.vy) < REST_SPEED);
}

/** 一次物理 tick（固定 dt=1）。回傳事件陣列。 */
export function tick(state) {
  const events = [];
  const active = [state.striker, ...state.pieces.filter((p) => !p.potted)];
  for (const p of active) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= FRICTION;
    p.vy *= FRICTION;
    if (Math.hypot(p.vx, p.vy) < REST_SPEED) {
      p.vx = 0;
      p.vy = 0;
    }
    if (collideWall(p)) events.push({ type: "wall" });
  }
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (collideDisc(active[i], active[j])) events.push({ type: "bump" });
    }
  }
  for (const piece of active) {
    if (potIfIn(state, piece)) {
      piece.vx = 0;
      piece.vy = 0;
      events.push({ type: "pot", who: piece.kind === "striker" ? "striker" : piece.color, kind: piece.kind, piece });
    }
  }
  return events;
}

/** 靜止後結算（UI 在 allResting 時呼叫）。回傳事件含勝負。 */
export function resolveRound(state) {
  const events = [];
  const queen = state.pieces.find((p) => p.kind === "queen");
  const queenPotted = !!queen?.potted;
  const strikerPotted = state.striker.potted;
  const myLeft = state.pieces.filter((p) => !p.potted && p.color === state.turn);

  if (strikerPotted) {
    events.push({ type: "foul", reason: "striker", message: "打擊珠進袋，犯規！換手。" });
  }
  if (queenPotted && myLeft.length > 0) {
    queen.potted = false;
    queen.x = W / 2;
    queen.y = H / 2;
    queen.vx = 0;
    queen.vy = 0;
    events.push({ type: "foul", reason: "early-queen", message: "女王太早進袋！犯規，重擺女王。" });
  }

  if (myLeft.length === 0 && queenPotted) {
    state.over = true;
    state.winner = state.turn;
    events.push({ type: "win", winner: state.turn, message: `${state.turn} 方獲勝！` });
    return events;
  }

  state.turn = state.turn === COLOR_BLACK ? COLOR_WHITE : COLOR_BLACK;
  if (strikerPotted) {
    state.striker.potted = false;
    state.striker.x = W / 2;
    state.striker.y = strikerSideY(state.turn);
    state.striker.vx = 0;
    state.striker.vy = 0;
  }
  if (!state.over) {
    events.push({ type: "turn", turn: state.turn, message: `換 ${state.turn} 方彈射` });
  }
  return events;
}

function strikerSideY(color) {
  return color === COLOR_WHITE ? H - RAIL - STRIKER_R - 2 : RAIL + STRIKER_R + 2;
}

/** 某方剩餘普通棋子數。 */
export function countRemaining(state, color) {
  return state.pieces.filter((p) => !p.potted && p.kind === "piece" && p.color === color).length;
}
