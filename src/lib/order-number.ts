// 訂單編號的唯一格式:「#」+ 訂單 id 最後 8 碼、英文大寫,例如 #A1E337B0。
//
// 以前三個後台各截各的(供應商取前 8 碼、管理員取後 8 碼小寫、餐廳與通知信取後 8 碼大寫),
// 同一張單在餐廳、供應商、信件裡看到三個不同的編號(DEMO_GUIDE 記錄的 #EDCF4143 vs #A1E337B0)。
// 現在餐廳、供應商、管理員三個後台與 notify 通知信全部呼叫這一支。
//
// 🔴 這支檔案會被 Edge Function(Deno)直接 import(supabase/functions/notify/index.ts),
//    所以不能 import 任何東西、不能用 "@/..." 路徑別名 —— 保持純函式。

/** 訂單編號(含 #)。id 是空的就回「#—」 */
export const formatOrderNo = (id: string | null | undefined): string => {
  const raw = String(id ?? "").trim();
  if (!raw) return "#—";
  return `#${raw.slice(-8).toUpperCase()}`;
};
