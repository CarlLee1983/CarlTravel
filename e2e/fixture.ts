// e2e fixture 的景點總數：手寫 2 筆 + scripts/scale/generate-spots.ts 的 FIXTURE_COUNT 筆。
// 改動產生器的筆數時要同步這裡；tests/scale-generator.test.ts 固定產生器那一側。
export const TOTAL_SPOTS = 62;
export const COUNT_RESULT = /^找到 \d+ 個景點。$/;
