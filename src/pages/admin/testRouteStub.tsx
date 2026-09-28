// 路由表測試用的頁面空殼(只給 *.test.tsx 用):每個頁面換成一個標題寫著模組名稱的 <h1>,
// 用來確認「這個網址渲染的是哪一個頁面元件」,不跑頁面本身的查詢。
export const stubPage = (name: string) => ({
  default: () => <h1 data-stub-page={name}>{name}</h1>,
});
