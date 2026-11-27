-- =============================================================================
-- Mini-Games v2.1.0 · Expansión de Catálogo (ELO multi-juego + Nuevas Insignias)
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS elo_by_game JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.protect_profile_immutable_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_id <> OLD.public_id OR NEW.tag <> OLD.tag THEN
    RAISE EXCEPTION 'El identificador permanente no puede modificarse';
  END IF;
  IF current_setting('role', true) <> 'service_role' THEN
    NEW.level := OLD.level;
    NEW.xp := OLD.xp;
    NEW.elo_global := OLD.elo_global;
    NEW.elo_hockey := OLD.elo_hockey;
    NEW.elo_connect4 := OLD.elo_connect4;
    NEW.elo_tictactoe := OLD.elo_tictactoe;
    NEW.elo_by_game := OLD.elo_by_game;
    NEW.wins := OLD.wins;
    NEW.losses := OLD.losses;
    NEW.draws := OLD.draws;
    NEW.matches_played := OLD.matches_played;
    NEW.current_streak := OLD.current_streak;
    NEW.best_streak := OLD.best_streak;
    NEW.playtime_seconds := OLD.playtime_seconds;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO public.achievements (id, name, description, icon) VALUES
  ('pool_shark', 'Maestro del Taco', 'Alcanza 1100 ELO en Billar 8-Ball.', '🎱'),
  ('golf_pro', 'Bajo Par', 'Alcanza 1100 ELO en Mini Golf.', '⛳'),
  ('admiral', 'Almirante Táctico', 'Alcanza 1100 ELO en Batalla Naval.', '🚢'),
  ('artist_eye', 'Mente Creativa', 'Alcanza 1100 ELO en Dibuja y Adivina.', '🎨'),
  ('grandmaster', 'Gran Maestro', 'Alcanza 1100 ELO en Ajedrez.', '♟️')
ON CONFLICT (id) DO NOTHING;
