// 單筆訂單頁 /admin/orders/:id(App.tsx 的路由仍指向這個檔,網址不變)。
//
// 後台精簡第一期:舊的「訂單明細」與「訂單履歷」併成同一頁,以履歷為底 —— 實作在 AdminOrderTimelinePage。
// 舊明細獨有的「買方聯絡資訊」「對應分析來源」兩張卡已經搬過去;
// 舊明細的「改狀態」下拉與「刪除」沒有搬:直接 UPDATE supplier_orders.status 會被 trg_guard_order_status 擋,
// 直接 DELETE 會被 order_events 的 append-only 護欄擋(按了只會報錯,見 PROPOSAL.md §5 #2)。
// 同一張卡上的「備註」編輯也先不搬(狀態不變時存得進去,但不留事件),細節見 AdminOrderTimelinePage 檔頭。
// 管理員正式的動作列(派單/取消/結案/刪單,走 recordOrderEvent / admin_delete_order)是第二期。
export { default } from './AdminOrderTimelinePage';
