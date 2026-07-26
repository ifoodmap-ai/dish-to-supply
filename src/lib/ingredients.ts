// 食材規格標準化 —— 全站共用的名稱比對層。
//
// 供應商會把同一個東西寫成「甘藍」「捲心菜」「高麗菜」;餐廳菜單寫「蛤蜊」、
// 供應商上架寫「文蛤」。純字串比對永遠對不上,比價與成本計算就會漏。
//
// 這一層先查食材主檔(ingredients + ingredient_aliases)把兩邊都正規化成同一個
// canonical id,對不上時才退回雙向 includes 的字串比對。

import { supabase } from "@/integrations/supabase/client";

export interface IngredientRef {
  id: string;
  canonical_name: string;
  category: string | null;
  base_unit: string;
}

/** 名稱 → canonical ingredient id 的查表器 */
export interface IngredientResolver {
  /** 任意寫法 → ingredient id(對不上回 null) */
  resolve: (rawName: string) => string | null;
  /** ingredient id → 主檔資料 */
  get: (id: string) => IngredientRef | undefined;
  /** 兩個名稱是否指向同一種食材(先走主檔,再退回字串比對) */
  sameIngredient: (a: string, b: string) => boolean;
  loaded: boolean;
}

export const normalizeName = (s: string): string =>
  (s ?? "").toLowerCase().replace(/\s+/g, "").replace(/[（(].*?[)）]/g, "");

/** 雙向包含比對 —— 主檔對不上時的退路,與 src/lib/api.ts 的媒合邏輯一致 */
export const looseMatch = (a: string, b: string): boolean => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
};

const loose = <T>(table: string) =>
  (supabase as never as {
    from: (t: string) => {
      select: (c: string) => Promise<{ data: T[] | null; error: { message: string } | null }>;
    };
  }).from(table).select("*");

/**
 * 載入食材主檔與別名,回傳一個可重複使用的比對器。
 * 主檔量小(數十到數百筆),一次載入後全部在記憶體比對。
 */
export const loadIngredientResolver = async (): Promise<IngredientResolver> => {
  let ingredients: IngredientRef[] = [];
  let aliases: { ingredient_id: string; alias: string }[] = [];

  try {
    const [{ data: ing }, { data: al }] = await Promise.all([
      loose<IngredientRef>("ingredients"),
      loose<{ ingredient_id: string; alias: string }>("ingredient_aliases"),
    ]);
    ingredients = ing ?? [];
    aliases = al ?? [];
  } catch {
    // 主檔讀不到就整層降級成字串比對,不要讓頁面壞掉
  }

  const byId = new Map(ingredients.map((i) => [i.id, i]));

  // 正規化後的名稱 → id。canonical 與 alias 都放進同一張表。
  const index = new Map<string, string>();
  for (const i of ingredients) index.set(normalizeName(i.canonical_name), i.id);
  for (const a of aliases) if (!index.has(normalizeName(a.alias))) index.set(normalizeName(a.alias), a.ingredient_id);

  // 長名優先,避免「牛肉」先吃掉「牛肉麵」這種誤配
  const entries = [...index.entries()].sort((a, b) => b[0].length - a[0].length);

  const resolve = (rawName: string): string | null => {
    const n = normalizeName(rawName);
    if (!n) return null;
    const exact = index.get(n);
    if (exact) return exact;
    for (const [key, id] of entries) {
      if (key.length >= 2 && (n.includes(key) || key.includes(n))) return id;
    }
    return null;
  };

  const sameIngredient = (a: string, b: string): boolean => {
    const ra = resolve(a);
    const rb = resolve(b);
    if (ra && rb) return ra === rb;
    return looseMatch(a, b);
  };

  return { resolve, get: (id) => byId.get(id), sameIngredient, loaded: ingredients.length > 0 };
};

/**
 * 用比對器在供應商品項中找某個食材的最低價。
 * 回傳 null 代表市場上目前沒有這個品項的報價。
 */
export interface PricedSupply {
  id?: string;
  name: string;
  price: number | null;
  unit?: string | null;
  supplier_id?: string;
}

export const lowestPriceFor = (
  rawName: string,
  supplies: PricedSupply[],
  resolver: IngredientResolver | null,
): { price: number; supply: PricedSupply } | null => {
  let best: { price: number; supply: PricedSupply } | null = null;
  for (const s of supplies) {
    if (s.price == null) continue;
    const hit = resolver ? resolver.sameIngredient(rawName, s.name) : looseMatch(rawName, s.name);
    if (!hit) continue;
    const p = Number(s.price);
    if (!Number.isFinite(p) || p <= 0) continue;
    if (!best || p < best.price) best = { price: p, supply: s };
  }
  return best;
};
