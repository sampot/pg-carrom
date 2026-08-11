import { describe, it, expect } from "vitest";
import {
  W, H, RAIL, STRIKER_R, PIECE_R, QUEEN_R, COLOR_BLACK, COLOR_WHITE,
  BLACK_PIECES, initialLayout, newGame, aimInfo, shoot, potIfIn, collideWall,
  collideDisc, allResting, tick, resolveRound, countRemaining, dist,
} from "./game.js";

describe("初始佈局", () => {
  it("桌面包含 1 王、各 6 普通棋子、1 打擊珠", () => {
    const s = newGame();
    const queens = s.pieces.filter((p) => p.kind === "queen");
    const blacks = s.pieces.filter((p) => p.color === COLOR_BLACK);
    const whites = s.pieces.filter((p) => p.color === COLOR_WHITE);
    expect(queens).toHaveLength(1);
    expect(blacks).toHaveLength(BLACK_PIECES);
    expect(whites).toHaveLength(BLACK_PIECES);
    expect(s.striker).toBeTruthy();
  });

  it("王在桌面中央且無初始速度", () => {
    const s = newGame();
    const q = s.pieces.find((p) => p.kind === "queen");
    expect(q.x).toBe(W / 2);
    expect(q.y).toBe(H / 2);
    expect(q.vx).toBe(0);
    expect(q.vy).toBe(0);
  });

  it("所有棋子都在邊框範圍內", () => {
    const s = newGame();
    for (const p of s.pieces) {
      expect(p.x - p.r).toBeGreaterThanOrEqual(RAIL);
      expect(p.x + p.r).toBeLessThanOrEqual(W - RAIL);
      expect(p.y - p.r).toBeGreaterThanOrEqual(RAIL);
      expect(p.y + p.r).toBeLessThanOrEqual(H - RAIL);
    }
  });
});

describe("圓形碰撞", () => {
  it("兩個未重疊的圓不觸發碰撞", () => {
    const a = { x: 100, y: 100, r: PIECE_R, vx: 1, vy: 0 };
    const b = { x: 200, y: 100, r: PIECE_R, vx: -1, vy: 0 };
    expect(collideDisc(a, b)).toBe(false);
  });

  it("兩個重疊圓分開並交換衝量（彈性）", () => {
    const a = { x: 100, y: 100, r: PIECE_R, vx: 2, vy: 0 };
    const b = { x: 108, y: 100, r: PIECE_R, vx: 0, vy: 0 };
    expect(dist(a, b)).toBeLessThan(a.r + b.r);
    expect(collideDisc(a, b)).toBe(true);
    expect(dist(a, b)).toBeCloseTo(a.r + b.r, 5);
    // b 獲得朝 +x 的動量，a 減速
    expect(b.vx).toBeGreaterThan(0);
  });
});

describe("牆壁碰撞", () => {
  it("超左界的物體被推回並反彈", () => {
    const p = { x: RAIL + 1, y: 100, r: PIECE_R, vx: -5, vy: 0 };
    expect(collideWall(p)).toBe(true);
    expect(p.x).toBe(RAIL + PIECE_R);
    expect(p.vx).toBeGreaterThan(0);
  });

  it("全在框內不觸發牆壁", () => {
    const p = { x: 180, y: 180, r: PIECE_R, vx: 0, vy: 0 };
    expect(collideWall(p)).toBe(false);
  });
});

describe("口袋與進袋", () => {
  it("靠近角落會被吸附進袋", () => {
    const s = newGame();
    const piece = { kind: "piece", color: COLOR_WHITE, x: RAIL + 2, y: RAIL + 2, r: PIECE_R, vx: 0, vy: 0, potted: false };
    expect(potIfIn(s, piece)).toBeTruthy();
    expect(piece.potted).toBe(true);
  });

  it("桌中棋子不會進袋", () => {
    const s = newGame();
    const piece = { kind: "piece", color: COLOR_WHITE, x: 180, y: 180, r: PIECE_R, vx: 0, vy: 0, potted: false };
    expect(potIfIn(s, piece)).toBeNull();
    expect(piece.potted).toBe(false);
  });
});

describe("發射", () => {
  it("拖曳長度決定速度，方向與拖曳反向", () => {
    const s = newGame();
    const st = s.striker;
    const pointer = { x: st.x + 50, y: st.y };
    const ev = shoot(s, pointer);
    expect(ev.some((e) => e.type === "shoot")).toBe(true);
    expect(st.vx).toBeLessThan(0); // 往左（反向）
    expect(Math.hypot(st.vx, st.vy)).toBeGreaterThan(0);
  });

  it("太短的拖曳不發射", () => {
    const s = newGame();
    const st = s.striker;
    const ev = shoot(s, { x: st.x + 2, y: st.y });
    expect(ev).toHaveLength(0);
    expect(st.vx).toBe(0);
  });
});

describe("物理 tick 與靜止", () => {
  it("有速度的物體經多次 tick 會因摩擦而靜止", () => {
    const s = newGame();
    s.striker.vx = 30;
    let guard = 0;
    while (!allResting(s) && guard < 5000) {
      tick(s);
      guard++;
    }
    expect(allResting(s)).toBe(true);
  });

  it("tick 推進位置且不超出邊框", () => {
    const s = newGame();
    s.striker.vx = 20;
    s.striker.vy = 20;
    for (let i = 0; i < 50; i++) tick(s);
    const st = s.striker;
    expect(st.x - st.r).toBeGreaterThanOrEqual(RAIL - 0.001);
    expect(st.x + st.r).toBeLessThanOrEqual(W - RAIL + 0.001);
  });

  it("強力發射可使任一棋子進袋（整合）", () => {
    const s = newGame();
    // 直接把某棋子推向角落
    const piece = s.pieces.find((p) => p.color === COLOR_WHITE);
    piece.x = W - RAIL - 3;
    piece.y = H - RAIL - 3;
    const ev = tick(s);
    expect(s.pieces.some((p) => p.potted)).toBe(true);
    expect(ev.some((e) => e.type === "pot")).toBe(true);
  });
});

describe("回合結算與勝負", () => {
  it("己方棋子清空＋女王進袋 → 勝利", () => {
    const s = newGame();
    s.turn = COLOR_WHITE;
    for (const p of s.pieces) {
      if (p.color === COLOR_WHITE) p.potted = true;
    }
    s.pieces.find((p) => p.kind === "queen").potted = true;
    const ev = resolveRound(s);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(COLOR_WHITE);
    expect(ev.some((e) => e.type === "win")).toBe(true);
  });

  it("打擊珠進袋判犯規並換手", () => {
    const s = newGame();
    s.turn = COLOR_WHITE;
    s.striker.potted = true;
    // 讓玩家0的棋子還有剩，避免勝利
    const ev = resolveRound(s);
    expect(ev.some((e) => e.type === "foul" && e.reason === "striker")).toBe(true);
    expect(s.striker.potted).toBe(false); // 重擺
    expect(s.turn).toBe(COLOR_BLACK);
  });

  it("女王太早進袋判犯規並重擺回中央", () => {
    const s = newGame();
    s.turn = COLOR_WHITE;
    const queen = s.pieces.find((p) => p.kind === "queen");
    queen.potted = true;
    const yesLeft = s.pieces.some((p) => p.color === COLOR_WHITE && !p.potted);
    expect(yesLeft).toBe(true);
    const ev = resolveRound(s);
    expect(ev.some((e) => e.type === "foul" && e.reason === "early-queen")).toBe(true);
    expect(queen.potted).toBe(false);
    expect(queen.x).toBe(W / 2);
    expect(queen.y).toBe(H / 2);
  });

  it("正常換手：無犯規無進王時輪替", () => {
    const s = newGame();
    s.turn = COLOR_WHITE;
    const ev = resolveRound(s);
    expect(ev.some((e) => e.type === "turn")).toBe(true);
    expect(s.turn).toBe(COLOR_BLACK);
    expect(s.over).toBe(false);
  });
});

describe("計數", () => {
  it("countRemaining 只算未進袋的普通棋子", () => {
    const s = newGame();
    const before = countRemaining(s, COLOR_WHITE);
    expect(before).toBe(BLACK_PIECES);
    const w = s.pieces.find((p) => p.color === COLOR_WHITE);
    w.potted = true;
    expect(countRemaining(s, COLOR_WHITE)).toBe(BLACK_PIECES - 1);
  });
});
