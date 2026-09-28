// 測試用:把 src/lib/metrics.ts 的每個函式包成 vi.fn(行為不變,只多記錄呼叫)。
// 只給 *.test.tsx 用。用法(vi.mock 會被提到檔案最上面,所以 helper 要在 factory 裡動態 import):
//
//   vi.mock('@/lib/metrics', async (importOriginal) =>
//     (await import('@/test/metricsSpy')).spyOnMetrics(await importOriginal()));
//
// vitest 設定了 clearMocks,每個測試開始時呼叫紀錄會歸零 —— 測試本身不要在 it() 裡呼叫 metrics 的函式
// (預期值請在 describe 層先算好),這樣測試裡看到的呼叫就一定是頁面發出的,證明頁面用的是共用定義。
import { vi } from 'vitest';

export const spyOnMetrics = <T extends Record<string, unknown>>(mod: T): T =>
  Object.fromEntries(
    Object.entries(mod).map(([key, value]) => [
      key,
      typeof value === 'function' ? vi.fn(value as (...args: unknown[]) => unknown) : value,
    ]),
  ) as T;
