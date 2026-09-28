// 可用的記憶體版 Storage,給需要讀寫 localStorage 的測試用 vi.stubGlobal 換上。
//
// 為什麼需要:Node 25 內建了全域 localStorage,沒帶 --localstorage-file 時它是個
// 沒有任何方法的空物件,而 vitest 2 的 jsdom 環境不會蓋掉已存在的全域 ——
// 結果測試裡 localStorage.setItem 直接炸掉,程式端的 try/catch 則會默默吞掉。
export const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
};
