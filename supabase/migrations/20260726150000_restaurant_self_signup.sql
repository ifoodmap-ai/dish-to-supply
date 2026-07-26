CREATE OR REPLACE FUNCTION public.create_restaurant_onboarding(
  p_name text,
  p_contact_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_contact_name text := NULLIF(btrim(p_contact_name), '');
  v_contact_phone text := NULLIF(btrim(p_contact_phone), '');
  v_restaurant_id uuid;
  v_branch_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'restaurant name must contain between 2 and 100 characters'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(v_contact_name) > 80 THEN
    RAISE EXCEPTION 'contact name must not exceed 80 characters'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(v_contact_phone) > 30 THEN
    RAISE EXCEPTION 'contact phone must not exceed 30 characters'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT restaurant_id
    INTO v_restaurant_id
    FROM public.restaurant_accounts
   WHERE user_id = v_user_id
     AND is_active
   ORDER BY created_at, id
   LIMIT 1;

  IF v_restaurant_id IS NOT NULL THEN
    RETURN v_restaurant_id;
  END IF;

  INSERT INTO public.restaurants (name, contact_name, contact_phone)
  VALUES (v_name, v_contact_name, v_contact_phone)
  RETURNING id INTO v_restaurant_id;

  INSERT INTO public.restaurant_branches (restaurant_id, name)
  VALUES (v_restaurant_id, '總店')
  RETURNING id INTO v_branch_id;

  INSERT INTO public.restaurant_accounts (
    user_id,
    restaurant_id,
    branch_id,
    role,
    is_active
  )
  VALUES (
    v_user_id,
    v_restaurant_id,
    v_branch_id,
    'owner',
    true
  );

  RETURN v_restaurant_id;
END;
$$;

REVOKE ALL
  ON FUNCTION public.create_restaurant_onboarding(text, text, text)
  FROM PUBLIC;
REVOKE ALL
  ON FUNCTION public.create_restaurant_onboarding(text, text, text)
  FROM anon;
GRANT EXECUTE
  ON FUNCTION public.create_restaurant_onboarding(text, text, text)
  TO authenticated;
