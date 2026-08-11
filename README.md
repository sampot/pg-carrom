# pg-carrom

> 康樂球（彈珠）— 俯視方形桌面、拖曳彈射打擊珠、棋子入袋得分。行動裝置優先、無依賴。

![kind](https://img.shields.io/badge/kind-%E8%A1%97%E6%A9%9F-7aa6cc) ![series](https://img.shields.io/badge/series-batch%20C-ffcd5c) ![license](https://img.shields.io/badge/license-MIT-5cff5c)

`pg-carrom` 是 [Playgrounds](https://github.com/sampot/playgrounds) 系列中的一個街機：

- **桌面**：俯視方形木桌，四角落各有口袋；桌中央有「王」與散落的黑／白棋子。
- **玩法**：回合制（黑白輪替）。拖曳自己的打擊珠（slingshot）彈射，擊中棋子推進口袋。
  黑方吃黑棋、白方吃白棋；率先清光己方棋子、再把「王」打進者獲勝。
- **物理**：圓形碰撞、摩擦衰減、彈性反彈、口袋吸附。
- **人機／雙人**：可切「人機」（人=白，AI=黑）或「雙人」各自彈射。
- **最高分**跨沙盒持久化（`/api/kv/pg-carrom-best`）。

## 執行

```bash
npx --yes serve .
# 開 http://localhost:3000
```

無依賴、無建置：直接靜態伺服器即可。

## 控制

| 動作 | 方式 |
| --- | --- |
| 彈射 | 在打擊珠上按住拖曳（反向拖越遠越用力），放開即射 |
| 切換模式 | 點「人機」／「雙人」 |
| 音效 | 點「音效」切換開關 |

## 規則

- 把對方棋子（或自己的）打進角落口袋即入袋；但只有吃「自己顏色」的棋子才算進度。
  簡化規則下，任何一方點到口袋即吸附。
- 王只能在己方棋子全部入袋後合法打進；太早進袋判犯規、重擺回中央。
- 打擊珠進袋判犯規、換手並重擺打擊珠。
- 勝利：己方普通棋子全清＋王已入袋 → 勝。
- 最高分經 `PUT /api/kv/pg-carrom-best` 由 runtime 持久化；無 KV 環境照玩不報錯。

## 檔案結構

```
index.html          # 主畫面（zh-Hant、mobile-first、無原生 dialog）
styles.css          # mobile-first 樣式
app.js              # 渲染、輸入、AI、HUD（UI 層）
game.js             # 物理＋規則（純函式，可測試）
audio.js            # Web Audio 合成音效 ＋ assets 音效播放
game.test.js        # vitest 單元測試
functions.js        # Playgrounds Worker functions hook（預留）
vitest.config.js    # vitest 設定
assets/sfx/*.ogg    # Kenney Impact Sounds（CC0）＋ License.txt
LICENSE             # MIT
ATTRIBUTION.md      # 素材署名
```

## 開發

```bash
npx --yes vitest@latest run
```

## 授權

MIT（程式碼與自繪美術）。音效為 Kenney（CC0），署名見 [ATTRIBUTION.md](./ATTRIBUTION.md)。
