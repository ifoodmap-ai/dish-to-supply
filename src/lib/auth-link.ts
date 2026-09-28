// 解析 Supabase Auth 信件連結導回來的網址(/reset-password 用)。
//
// GoTrue 驗證完連結後會導回 redirect_to,並把結果放在 hash:
//   成功:#access_token=...&refresh_token=...&type=invite|recovery
//   失敗:#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
// redirect_to 自己也可以帶 query(我們用 ?type=invite / ?type=recovery 指定頁面要顯示哪一種流程)。
//
// 跟 supabase-js 一樣「query 參數優先於 hash」:餐廳成員邀請的連結是
//   /reset-password?type=recovery#access_token=...&type=invite
// supabase-js 會把它當成 recovery(觸發 PASSWORD_RECOVERY),這裡的 type 也要是 recovery。
//
// 注意:supabase-js 換到 session 之後會把 hash 清掉(query 不會動),所以要在頁面一掛上就讀。

export interface AuthLinkInfo {
  /** 頁面流程:query 的 type 優先,沒有才看 hash 的 type */
  type: string | null;
  /** hash 裡 GoTrue 給的 type(原本的 recovery 判斷用) */
  hashType: string | null;
  /** hash 裡有沒有 access_token(= 連結有效、supabase-js 正在換 session) */
  hasAccessToken: boolean;
  /** 連結過期 / 無效 / 已用過時 GoTrue 帶回來的錯誤 */
  error: { code: string | null; description: string | null } | null;
}

export const parseAuthLink = (href: string): AuthLinkInfo => {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { type: null, hashType: null, hasAccessToken: false, error: null };
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const query = url.searchParams;
  const pick = (key: string) => query.get(key) ?? hash.get(key);

  const errorCode = pick("error_code") ?? pick("error");
  const errorDescription = pick("error_description");

  return {
    type: query.get("type") ?? hash.get("type"),
    hashType: hash.get("type"),
    hasAccessToken: Boolean(hash.get("access_token")),
    error: errorCode || errorDescription ? { code: errorCode, description: errorDescription } : null,
  };
};
