-- =============================================================================
-- Mini-Games · Trigger automático para crear perfil al registrarse en auth.users
-- Permite crear public.profiles aunque el correo todavía esté pendiente de OTP
-- (cuando auth.uid() del navegador aún es NULL hasta completar verifyOtp).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  generated_public_id TEXT;
  generated_tag TEXT;
  clean_username TEXT;
BEGIN
  generated_public_id := 'MG-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 6));
  generated_tag := lpad((floor(random() * 8999 + 1000))::int::text, 4, '0');
  clean_username := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
    split_part(COALESCE(NEW.email, 'Jugador'), '@', 1),
    'Jugador'
  );
  clean_username := left(clean_username, 16);
  IF char_length(clean_username) < 2 THEN
    clean_username := 'Jugador';
  END IF;

  INSERT INTO public.profiles (
    id, public_id, tag, username, avatar_color, avatar_icon
  ) VALUES (
    NEW.id,
    generated_public_id,
    generated_tag,
    clean_username,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_color', ''), '#f58229'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_icon', ''), '⚡')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    generated_tag := upper(substr(md5(random()::text), 1, 4));
    INSERT INTO public.profiles (id, public_id, tag, username)
    VALUES (NEW.id, 'MG-' || upper(substr(md5(NEW.id::text), 1, 6)), generated_tag, clean_username)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
