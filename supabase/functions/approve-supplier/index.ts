// Edge Function: approve a supplier application.
// Creates the auth user (role=supplier), the suppliers row, and the
// supplier_accounts link, then marks the application approved.
// Requires the caller to be an admin (app_metadata.role === 'admin').
// Runs on Supabase Edge Runtime — service-role key is platform-injected.
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });

const genTempPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => chars[n % chars.length]).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405);

  // --- admin check ---
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ message: "Missing Authorization" }, 401);
  const { data: caller, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !caller.user) return json({ message: "Invalid token" }, 401);
  if ((caller.user.app_metadata as { role?: string })?.role !== "admin") {
    return json({ message: "Not an admin" }, 401);
  }

  const body = await req.json().catch(() => null) as { application_id?: string } | null;
  const applicationId = body?.application_id;
  if (!applicationId) return json({ message: "application_id is required" }, 400);

  const { data: appRow, error: ae } = await supabase
    .from("supplier_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();
  if (ae || !appRow) return json({ message: "Application not found", details: ae?.message }, 404);
  if (appRow.status === "approved") return json({ message: "Application already approved" }, 409);

  // --- 1) create (or reuse) the auth user with role=supplier ---
  const tempPassword = genTempPassword();
  let userId: string | null = null;
  let createdNew = false;
  const created = await supabase.auth.admin.createUser({
    email: appRow.contact_email,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { role: "supplier" },
    user_metadata: { display_name: appRow.contact_name ?? appRow.company_name }
  });
  if (created.error) {
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find(
      (u) => u.email?.toLowerCase() === String(appRow.contact_email).toLowerCase()
    );
    if (!existing) return json({ message: "Failed to create supplier user", details: created.error.message }, 500);
    userId = existing.id;
    await supabase.auth.admin.updateUserById(userId, { app_metadata: { role: "supplier" } });
  } else {
    userId = created.data.user.id;
    createdNew = true;
  }

  // --- 2) supplier row + account link ---
  const { data: supplier, error: se } = await supabase
    .from("suppliers")
    .insert({
      name: appRow.company_name,
      description: appRow.description,
      contact_name: appRow.contact_name,
      contact_email: appRow.contact_email,
      phone: appRow.contact_phone,
      service_areas: appRow.service_areas
        ? String(appRow.service_areas).split(/[,、\s]+/).filter(Boolean)
        : [],
      is_active: true
    })
    .select("id, name")
    .single();
  if (se) return json({ message: "Failed to create supplier", details: se.message }, 500);

  const { error: le } = await supabase
    .from("supplier_accounts")
    .insert({ user_id: userId, supplier_id: supplier.id, is_active: true });
  if (le) return json({ message: "Failed to link supplier account", details: le.message }, 500);

  await supabase
    .from("supplier_applications")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", appRow.id);

  return json({
    data: {
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      login_email: appRow.contact_email,
      temp_password: createdNew ? tempPassword : null
    }
  });
});
