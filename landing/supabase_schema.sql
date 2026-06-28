-- =====================================================================
-- iFoodMap — Supabase / Postgres schema (v1)
-- 在 Supabase SQL Editor 直接執行，或放進 supabase/migrations/0001_init.sql
-- =====================================================================

-- ---------- extensions ----------
create extension if not exists "uuid-ossp";

-- ---------- enums ----------
do $$ begin
  create type user_role as enum ('buyer','supplier','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type demand_status as enum ('new','matching','matched','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type match_status as enum ('pending','contacted','accepted','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cert_type as enum ('sgs','traceability','organic','haccp','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notify_channel as enum ('line','email');
exception when duplicate_object then null; end $$;

-- ---------- profiles (對應 auth.users) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'buyer',
  display_name text,
  phone text,
  line_id text,
  created_at timestamptz not null default now()
);

-- ---------- categories（28 類食材）----------
create table if not exists categories (
  id smallint primary key,
  name text not null,
  slug text not null unique,
  sort smallint not null default 0
);

-- ---------- suppliers ----------
create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references profiles(id) on delete set null,
  name text not null,
  description text,
  contact_phone text,
  contact_line text,
  service_regions text[] not null default '{}',     -- 例：{'台北市','新北市'}
  category_ids smallint[] not null default '{}',    -- 對應 categories.id
  rating numeric(2,1) not null default 0,           -- 評分快取 0.0–5.0
  rating_count int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_suppliers_categories on suppliers using gin (category_ids);
create index if not exists idx_suppliers_regions on suppliers using gin (service_regions);

-- ---------- supplier_certifications（標章 / 履歷連動）----------
create table if not exists supplier_certifications (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  type cert_type not null,
  doc_url text,                 -- Storage: supplier-docs
  authority_url text,           -- 認證機構查驗連結
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- demands（需求單；聯絡頁表單寫入這張）----------
create table if not exists demands (
  id uuid primary key default uuid_generate_v4(),
  buyer_id uuid references profiles(id) on delete set null,  -- 可為 null（匿名表單）
  company_name text,
  contact_phone text not null,
  contact_line text,
  items_text text,                  -- 使用者自填品項字串
  detail text,                      -- 需求說明（數量/頻率等）
  delivery_region text,
  contact_time_from time,
  contact_time_to time,
  note text,
  status demand_status not null default 'new',
  created_at timestamptz not null default now()
);
create index if not exists idx_demands_status on demands(status);

-- ---------- demand_items（需求 ↔ 分類）----------
create table if not exists demand_items (
  demand_id uuid not null references demands(id) on delete cascade,
  category_id smallint not null references categories(id),
  primary key (demand_id, category_id)
);

-- ---------- matches ----------
create table if not exists matches (
  id uuid primary key default uuid_generate_v4(),
  demand_id uuid not null references demands(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  score int not null default 0,        -- 0–100
  status match_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (demand_id, supplier_id)
);
create index if not exists idx_matches_demand on matches(demand_id);
create index if not exists idx_matches_supplier on matches(supplier_id);

-- ---------- reviews（雙邊評價）----------
create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references matches(id) on delete cascade,
  rater_id uuid references profiles(id) on delete set null,
  ratee_id uuid references profiles(id) on delete set null,
  stars smallint not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ---------- notifications（通知佇列）----------
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  channel notify_channel not null,
  to_ref text not null,            -- line userId 或 email
  payload jsonb not null,
  status text not null default 'queued',  -- queued / sent / failed
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ---------- CMS：合作夥伴 / 媒體 / 文章 ----------
create table if not exists cms_partners (
  id uuid primary key default uuid_generate_v4(),
  name text not null, logo_url text, link text, sort smallint default 0
);
create table if not exists cms_media (
  id uuid primary key default uuid_generate_v4(),
  name text not null, logo_url text, link text, sort smallint default 0
);
create table if not exists news (
  id uuid primary key default uuid_generate_v4(),
  title text not null, slug text unique, cover_url text,
  excerpt text, body text, published_at timestamptz, created_at timestamptz default now()
);

-- =====================================================================
-- seed: categories（對應前端 28 類；可依實際調整）
-- =====================================================================
insert into categories (id, name, slug, sort) values
  (1,'蔬菜類','vegetable',1),
  (2,'水果類','fruit',2),
  (3,'豬肉類','pork',3),
  (4,'牛肉類','beef',4),
  (5,'雞肉類','chicken',5),
  (6,'羊肉類','lamb',6),
  (7,'鴨肉類','duck',7),
  (8,'其他肉品','other-meat',8),
  (9,'水產類','seafood',9),
  (10,'乳製品類','dairy',10),
  (11,'蛋類','egg',11),
  (12,'五穀雜糧類','grain',12),
  (13,'調味品類','seasoning',13),
  (14,'南北雜貨','dry-goods',14),
  (15,'加工食品','processed',15),
  (16,'調理食品類','prepared',16),
  (17,'火鍋料','hotpot',17),
  (18,'串烤食材','skewer',18),
  (19,'滷味食材','braised',19),
  (20,'素食食材','vegetarian',20),
  (21,'早餐食材','breakfast',21),
  (22,'烘焙食材','bakery',22),
  (23,'酒及飲品','beverage',23),
  (24,'包材','packaging',24),
  (25,'清潔用品','cleaning',25),
  (26,'機械設備','equipment',26),
  (27,'麵包','bread',27),
  (28,'其他','other',28)
on conflict (id) do nothing;

-- =====================================================================
-- Row Level Security（基本範例；上線前請逐表審視）
-- =====================================================================
alter table profiles enable row level security;
alter table suppliers enable row level security;
alter table supplier_certifications enable row level security;
alter table demands enable row level security;
alter table demand_items enable row level security;
alter table matches enable row level security;
alter table reviews enable row level security;

-- profiles：本人可讀寫自己
create policy "profiles self" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- suppliers：已發佈者公開可讀；owner 可改自己的
create policy "suppliers read published" on suppliers
  for select using (is_published = true or auth.uid() = owner_id);
create policy "suppliers owner write" on suppliers
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- demands：任何人可送出需求（聯絡表單，含匿名）
create policy "demands insert public" on demands
  for insert with check (true);
-- demands：buyer 讀自己的
create policy "demands read own" on demands
  for select using (auth.uid() = buyer_id);

-- demand_items：跟隨 demand insert（由 server service_role 寫入較簡單）
create policy "demand_items insert public" on demand_items
  for insert with check (true);

-- matches：相關 buyer / supplier 可讀
create policy "matches read related" on matches
  for select using (
    exists (select 1 from demands d where d.id = demand_id and d.buyer_id = auth.uid())
    or exists (select 1 from suppliers s where s.id = supplier_id and s.owner_id = auth.uid())
  );

-- reviews：登入者可寫自己給出的評價、相關人可讀
create policy "reviews insert own" on reviews
  for insert with check (auth.uid() = rater_id);
create policy "reviews read related" on reviews
  for select using (auth.uid() = rater_id or auth.uid() = ratee_id);

-- 注意：server 端用 service_role key 會繞過 RLS（用於寫 matches / notifications / demand_items）。
-- categories / cms_* / news 設為公開可讀即可（未啟用 RLS 預設依專案設定，建議只給 select）。
