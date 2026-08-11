// Vitest 設定。以純 ESM 物件形式匯出：此 repo 零依賴、無 node_modules，
// 且需能以 `npx --yes vitest@latest run` 直接執行。等價於 defineConfig({...})。
export default {
  test: {
    include: ["game.test.js"],
    environment: "node",
  },
};
