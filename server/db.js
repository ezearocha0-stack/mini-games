import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let dbInstance = null;

const STATIC_ACHIEVEMENTS = [
  ['first_win', 'Primera Victoria', 'Gana tu primera partida competitiva registrada.', '🏆'],
  ['streak_3', 'Imparable', 'Alcanza una racha de 3 victorias seguidas.', '🔥'],
  ['streak_5', 'Invicto', 'Consigue 5 victorias consecutivas.', '⚡'],
  ['hockey_ace', 'As del Air Hockey', 'Alcanza 1100 ELO en Neo Air Hockey.', '🏒'],
  ['c4_tactician', 'Estratega 7×6', 'Alcanza 1100 ELO en Conecta 4 Táctico.', '🟡'],
  ['ttt_master', 'Mente Infinita', 'Alcanza 1100 ELO en Tres en Raya.', '❌'],
  ['pool_shark', 'Maestro del Taco', 'Alcanza 1100 ELO en Billar 8-Ball.', '🎱'],
  ['golf_pro', 'Bajo Par', 'Alcanza 1100 ELO en Mini Golf.', '⛳'],
  ['admiral', 'Almirante Táctico', 'Alcanza 1100 ELO en Batalla Naval.', '🚢'],
  ['artist_eye', 'Mente Creativa', 'Alcanza 1100 ELO en Dibuja y Adivina.', '🎨'],
  ['grandmaster', 'Gran Maestro', 'Alcanza 1100 ELO en Ajedrez.', '♟️'],
  ['veteran_25', 'Veterano Crossplay', 'Completa 25 partidas competitivas.', '🎖️'],
  ['social_butterfly', 'Conector', 'Agrega a tu primer amigo en la plataforma.', '🤝']
];

const RANKED_GAME_IDS = [
  'air-hockey',
  'connect-four',
  'tic-tac-toe',
  'eight-ball',
  'mini-golf',
  'battleship',
  'draw-guess',
  'chess'
];

export function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = process.env.MINIGAMES_DB_PATH || path.join(process.cwd(), '.data', 'minigames.sqlite');
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      public_id TEXT NOT NULL UNIQUE,
      tag TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT,
      google_sub TEXT UNIQUE,
      username TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      avatar_color TEXT NOT NULL DEFAULT '#f58229',
      avatar_icon TEXT NOT NULL DEFAULT '⚡',
      favorite_games TEXT NOT NULL DEFAULT '[]',
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      elo_global INTEGER NOT NULL DEFAULT 1000,
      elo_hockey INTEGER NOT NULL DEFAULT 1000,
      elo_connect4 INTEGER NOT NULL DEFAULT 1000,
      elo_tictactoe INTEGER NOT NULL DEFAULT 1000,
      elo_by_game TEXT NOT NULL DEFAULT '{}',
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      playtime_seconds INTEGER NOT NULL DEFAULT 0,
      presence_status TEXT NOT NULL DEFAULT 'online',
      migrated_from_guest_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_elo_global ON users(elo_global DESC);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      device_label TEXT NOT NULL DEFAULT 'Navegador',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      provider_error TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'dark',
      accent TEXT NOT NULL DEFAULT 'amber',
      ui_scale TEXT NOT NULL DEFAULT 'normal',
      reduced_motion INTEGER NOT NULL DEFAULT 0,
      master_volume REAL NOT NULL DEFAULT 0.85,
      sfx_volume REAL NOT NULL DEFAULT 0.9,
      music_volume REAL NOT NULL DEFAULT 0,
      air_hockey_sensitivity REAL NOT NULL DEFAULT 1.0,
      push_notifications INTEGER NOT NULL DEFAULT 0,
      who_can_friend TEXT NOT NULL DEFAULT 'everyone',
      who_can_invite TEXT NOT NULL DEFAULT 'everyone',
      who_can_message TEXT NOT NULL DEFAULT 'friends',
      show_online_status INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS friendships (
      user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_a, user_b)
    );

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      dm_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      muted INTEGER NOT NULL DEFAULT 0,
      last_read_at TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      reactions TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      ref_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS game_sessions (
      id TEXT PRIMARY KEY,
      room_code TEXT,
      game_id TEXT NOT NULL,
      player1_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      player2_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS game_results (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,
      game_id TEXT NOT NULL,
      player1_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      player2_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      winner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      is_draw INTEGER NOT NULL DEFAULT 0,
      score_summary TEXT NOT NULL DEFAULT '',
      p1_elo_delta INTEGER NOT NULL DEFAULT 0,
      p2_elo_delta INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      played_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY (user_id, achievement_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id TEXT,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('elo_by_game')) {
    db.exec("ALTER TABLE users ADD COLUMN elo_by_game TEXT NOT NULL DEFAULT '{}'");
  }

  const otpCols = db.prepare('PRAGMA table_info(otp_codes)').all().map((c) => c.name);
  if (!otpCols.includes('delivery_status')) {
    db.exec("ALTER TABLE otp_codes ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending'");
  }
  if (!otpCols.includes('provider_error')) {
    db.exec("ALTER TABLE otp_codes ADD COLUMN provider_error TEXT NOT NULL DEFAULT ''");
  }

  const insertAch = db.prepare(
    'INSERT OR IGNORE INTO achievements (id, name, description, icon) VALUES (?, ?, ?, ?)'
  );
  for (const [id, name, desc, icon] of STATIC_ACHIEVEMENTS) {
    insertAch.run(id, name, desc, icon);
  }

  dbInstance = db;
  return db;
}

export function closeDbForTests() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
  }
}

export function getUserBadges(db, userId) {
  const all = db.prepare('SELECT id, name, description, icon FROM achievements').all();
  const mine = new Map(
    db
      .prepare('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?')
      .all(userId)
      .map((r) => [r.achievement_id, r.unlocked_at])
  );
  return all.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    unlocked: mine.has(a.id),
    unlockedAt: mine.get(a.id) || null
  }));
}

export function parseEloByGame(row) {
  let map = {};
  try {
    const parsed = JSON.parse(row?.elo_by_game || '{}');
    if (parsed && typeof parsed === 'object') map = { ...parsed };
  } catch {}
  if (typeof row?.elo_hockey === 'number' && !map['air-hockey']) map['air-hockey'] = row.elo_hockey;
  if (typeof row?.elo_connect4 === 'number' && !map['connect-four']) map['connect-four'] = row.elo_connect4;
  if (typeof row?.elo_tictactoe === 'number' && !map['tic-tac-toe']) map['tic-tac-toe'] = row.elo_tictactoe;
  const out = {};
  for (const id of RANKED_GAME_IDS) {
    out[id] = Number.isFinite(Number(map[id])) ? Number(map[id]) : 1000;
  }
  return out;
}

export function toPublicUser(row, db = null) {
  if (!row) return null;
  const total = row.matches_played || 0;
  const winRate = total > 0 ? Math.round((row.wins / total) * 100) : 0;
  let favs = [];
  try {
    favs = JSON.parse(row.favorite_games || '[]');
  } catch {}
  const eloByGame = parseEloByGame(row);
  return {
    id: row.id,
    publicId: row.public_id,
    tag: row.tag,
    username: row.username,
    bio: row.bio || '',
    avatarColor: row.avatar_color || '#f58229',
    avatarIcon: row.avatar_icon || '⚡',
    favoriteGames: Array.isArray(favs) ? favs : [],
    level: row.level || 1,
    xp: row.xp || 0,
    presenceStatus: row.presence_status || 'offline',
    stats: {
      eloGlobal: row.elo_global || 1000,
      eloHockey: eloByGame['air-hockey'] || 1000,
      eloConnect4: eloByGame['connect-four'] || 1000,
      eloTicTacToe: eloByGame['tic-tac-toe'] || 1000,
      eloByGame,
      wins: row.wins || 0,
      losses: row.losses || 0,
      draws: row.draws || 0,
      matchesPlayed: total,
      winRate,
      currentStreak: row.current_streak || 0,
      bestStreak: row.best_streak || 0,
      playtimeSeconds: row.playtime_seconds || 0
    },
    badges: db ? getUserBadges(db, row.id) : []
  };
}

export function toPrivateUser(row, db = null) {
  if (!row) return null;
  return {
    ...toPublicUser(row, db),
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at
  };
}

export function getSettingsRow(db, userId) {
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  if (!row) return null;
  return {
    theme: row.theme,
    accent: row.accent,
    uiScale: row.ui_scale,
    reducedMotion: Boolean(row.reduced_motion),
    masterVolume: Number(row.master_volume),
    sfxVolume: Number(row.sfx_volume),
    musicVolume: Number(row.music_volume),
    airHockeySensitivity: Number(row.air_hockey_sensitivity),
    pushNotifications: Boolean(row.push_notifications),
    privacy: {
      whoCanFriend: row.who_can_friend,
      whoCanInvite: row.who_can_invite,
      whoCanMessage: row.who_can_message,
      showOnlineStatus: Boolean(row.show_online_status)
    }
  };
}

export function isBlockedBetween(db, userA, userB) {
  if (!userA || !userB) return false;
  const row = db
    .prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1'
    )
    .get(userA, userB, userB, userA);
  return Boolean(row);
}

export function areFriends(db, userA, userB) {
  if (!userA || !userB) return false;
  const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
  const row = db
    .prepare('SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ? LIMIT 1')
    .get(a, b);
  return Boolean(row);
}

export function createNotification(db, { userId, type, title, body = '', refId = null }) {
  const id = 'ntf_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, ref_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).run(id, userId, type, title, body, refId, createdAt);
  return { id, userId, type, title, body, refId, read: false, createdAt };
}
