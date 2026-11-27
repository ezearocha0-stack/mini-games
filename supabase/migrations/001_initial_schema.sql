-- =============================================================================
-- Mini-Games · Esquema Relacional PostgreSQL + Row Level Security (Supabase)
-- Tablas: profiles, friendships, friend_requests, blocks, rooms, room_members,
--         conversations, conversation_members, messages, notifications,
--         game_sessions, game_results, reports, user_settings, achievements,
--         user_achievements
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Profiles (IDs públicos inmutables; datos privados como email nunca en vista pública)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL CHECK (char_length(username) BETWEEN 2 AND 16),
  bio TEXT NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
  avatar_color TEXT NOT NULL DEFAULT '#f58229',
  avatar_icon TEXT NOT NULL DEFAULT '⚡',
  favorite_games JSONB NOT NULL DEFAULT '[]'::jsonb,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  elo_global INTEGER NOT NULL DEFAULT 1000,
  elo_hockey INTEGER NOT NULL DEFAULT 1000,
  elo_connect4 INTEGER NOT NULL DEFAULT 1000,
  elo_tictactoe INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
  draws INTEGER NOT NULL DEFAULT 0 CHECK (draws >= 0),
  matches_played INTEGER NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  playtime_seconds INTEGER NOT NULL DEFAULT 0,
  presence_status TEXT NOT NULL DEFAULT 'offline' CHECK (presence_status IN ('online', 'away', 'busy', 'playing', 'offline')),
  migrated_from_guest_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS idx_profiles_elo_global ON public.profiles (elo_global DESC);

-- Prevent modification of immutable public_id or competitive stats from client UPDATE
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

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_immutable_fields();

-- 2. User Settings
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  accent TEXT NOT NULL DEFAULT 'amber',
  ui_scale TEXT NOT NULL DEFAULT 'normal' CHECK (ui_scale IN ('compact', 'normal', 'large')),
  reduced_motion BOOLEAN NOT NULL DEFAULT false,
  master_volume NUMERIC(3,2) NOT NULL DEFAULT 0.85,
  sfx_volume NUMERIC(3,2) NOT NULL DEFAULT 0.90,
  music_volume NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  air_hockey_sensitivity NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  push_notifications BOOLEAN NOT NULL DEFAULT false,
  who_can_friend TEXT NOT NULL DEFAULT 'everyone' CHECK (who_can_friend IN ('everyone', 'nobody')),
  who_can_invite TEXT NOT NULL DEFAULT 'everyone' CHECK (who_can_invite IN ('everyone', 'friends', 'nobody')),
  who_can_message TEXT NOT NULL DEFAULT 'friends' CHECK (who_can_message IN ('everyone', 'friends', 'nobody')),
  show_online_status BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Friend Requests & Friendships & Blocks
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> receiver_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_req_receiver ON public.friend_requests (receiver_id, status);

CREATE TABLE IF NOT EXISTS public.friendships (
  user_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- 4. Rooms & Room Members
CREATE TABLE IF NOT EXISTS public.rooms (
  code TEXT PRIMARY KEY CHECK (char_length(code) = 5),
  host_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  title TEXT NOT NULL DEFAULT '',
  game_id TEXT NOT NULL DEFAULT 'air-hockey',
  max_members INTEGER NOT NULL DEFAULT 2 CHECK (max_members BETWEEN 2 AND 4),
  allow_spectators BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_game', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_members (
  room_code TEXT NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('host', 'guest', 'spectator')),
  is_ready BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, user_id)
);

-- 5. Conversations, Members & Messages
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('dm', 'group')),
  title TEXT NOT NULL DEFAULT '',
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  dm_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  muted BOOLEAN NOT NULL DEFAULT false,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 400),
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages (conversation_id, created_at DESC);

-- 6. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  ref_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications (user_id, is_read, created_at DESC);

-- 7. Competitive Sessions, Results & Achievements
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT,
  game_id TEXT NOT NULL,
  player1_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  player2_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'aborted')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID UNIQUE REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  player1_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  player2_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  winner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_draw BOOLEAN NOT NULL DEFAULT false,
  score_summary TEXT NOT NULL DEFAULT '',
  p1_elo_delta INTEGER NOT NULL DEFAULT 0,
  p2_elo_delta INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_results_played ON public.game_results (played_at DESC);

CREATE TABLE IF NOT EXISTS public.achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

-- 8. Moderation Reports
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Achievements
INSERT INTO public.achievements (id, name, description, icon) VALUES
  ('first_win', 'Primera Victoria', 'Gana tu primera partida competitiva registrada.', '🏆'),
  ('streak_3', 'Imparable', 'Alcanza una racha de 3 victorias seguidas.', '🔥'),
  ('streak_5', 'Invicto', 'Consigue 5 victorias consecutivas.', '⚡'),
  ('hockey_ace', 'As del Air Hockey', 'Alcanza 1100 ELO en Neo Air Hockey.', '🏒'),
  ('c4_tactician', 'Estratega 7×6', 'Alcanza 1100 ELO en Conecta 4 Táctico.', '🟡'),
  ('ttt_master', 'Mente Infinita', 'Alcanza 1100 ELO en Tres en Raya.', '❌'),
  ('veteran_25', 'Veterano Crossplay', 'Completa 25 partidas competitivas.', '🎖️'),
  ('social_butterfly', 'Conector', 'Agrega a tu primer amigo en la plataforma.', '🤝')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles public read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Profiles own update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Profiles own insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Settings own all" ON public.user_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Friend requests participants" ON public.friend_requests
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Friend requests create" ON public.friend_requests
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Friendships read own" ON public.friendships
  FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Blocks own" ON public.blocks
  FOR ALL USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Public rooms read" ON public.rooms
  FOR SELECT USING (visibility = 'public' OR auth.uid() = host_id);

CREATE POLICY "Conversations members read" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Conversation members read" ON public.conversation_members
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.conversation_members cm2
    WHERE cm2.conversation_id = conversation_id AND cm2.user_id = auth.uid()
  ));

CREATE POLICY "Messages members read" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
  );
CREATE POLICY "Messages members insert" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Notifications own" ON public.notifications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Game results public read" ON public.game_results FOR SELECT USING (true);
CREATE POLICY "Achievements public read" ON public.achievements FOR SELECT USING (true);
CREATE POLICY "User achievements public read" ON public.user_achievements FOR SELECT USING (true);
CREATE POLICY "Reports own insert" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
