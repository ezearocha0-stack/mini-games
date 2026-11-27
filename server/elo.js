import crypto from 'node:crypto';
import { getDb, createNotification } from './db.js';

const GAME_ELO_COLUMN = {
  'air-hockey': 'elo_hockey',
  'connect-four': 'elo_connect4',
  'tic-tac-toe': 'elo_tictactoe'
};

function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function unlockAchievement(db, userId, achievementId) {
  const exists = db
    .prepare('SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = ?')
    .get(userId, achievementId);
  if (exists) return false;
  db.prepare(
    'INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)'
  ).run(userId, achievementId, new Date().toISOString());
  const ach = db.prepare('SELECT name, icon FROM achievements WHERE id = ?').get(achievementId);
  if (ach) {
    createNotification(db, {
      userId,
      type: 'achievement',
      title: `${ach.icon} Insignia desbloqueada: ${ach.name}`,
      body: 'Consulta tu perfil para ver todas tus insignias.'
    });
  }
  return true;
}

export function startCompetitiveSession({ roomCode, gameId, player1UserId, player2UserId }) {
  if (!GAME_ELO_COLUMN[gameId] || !player1UserId || !player2UserId || player1UserId === player2UserId) {
    return null;
  }
  const db = getDb();
  const id = 'gms_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  db.prepare(
    'INSERT INTO game_sessions (id, room_code, game_id, player1_id, player2_id, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, roomCode || null, gameId, player1UserId, player2UserId, 'active', Date.now());
  return id;
}

export function recordValidatedMatchResult({
  sessionId,
  gameId,
  winnerSlot, // 1 | 2 | 0 (draw)
  scoreSummary = ''
}) {
  if (!sessionId || !GAME_ELO_COLUMN[gameId]) return null;
  const db = getDb();
  const sess = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId);
  if (!sess || sess.status !== 'active' || sess.game_id !== gameId) {
    return null;
  }

  const nowMs = Date.now();
  const durationSec = Math.max(1, Math.round((nowMs - sess.started_at) / 1000));
  const p1 = db.prepare('SELECT * FROM users WHERE id = ?').get(sess.player1_id);
  const p2 = db.prepare('SELECT * FROM users WHERE id = ?').get(sess.player2_id);
  if (!p1 || !p2) return null;

  const col = GAME_ELO_COLUMN[gameId];
  const r1 = p1[col] || 1000;
  const r2 = p2[col] || 1000;
  const exp1 = expectedScore(r1, r2);
  const exp2 = expectedScore(r2, r1);

  const actual1 = winnerSlot === 1 ? 1 : winnerSlot === 0 ? 0.5 : 0;
  const actual2 = winnerSlot === 2 ? 1 : winnerSlot === 0 ? 0.5 : 0;

  // Anti-boosting protection: reduce ELO gain/loss after 5 consecutive rematches in last 24h
  const recentPairCount = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM game_results
       WHERE ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?))
         AND played_at > ?`
    )
    .get(p1.id, p2.id, p2.id, p1.id, new Date(nowMs - 86400_000).toISOString()).cnt;

  const baseK1 = (p1.matches_played || 0) < 20 ? 32 : 24;
  const baseK2 = (p2.matches_played || 0) < 20 ? 32 : 24;
  const damp = recentPairCount >= 5 ? 0.35 : 1;

  const delta1 = Math.round(baseK1 * damp * (actual1 - exp1));
  const delta2 = Math.round(baseK2 * damp * (actual2 - exp2));

  const gDelta1 = Math.round(24 * damp * (actual1 - expectedScore(p1.elo_global || 1000, p2.elo_global || 1000)));
  const gDelta2 = Math.round(24 * damp * (actual2 - expectedScore(p2.elo_global || 1000, p1.elo_global || 1000)));

  const xp1 = winnerSlot === 1 ? 60 : winnerSlot === 0 ? 30 : 20;
  const xp2 = winnerSlot === 2 ? 60 : winnerSlot === 0 ? 30 : 20;

  const applyForPlayer = (u, won, draw, delta, gDelta, xpGain) => {
    const nextGameElo = Math.max(100, (u[col] || 1000) + delta);
    const nextGlobalElo = Math.max(100, (u.elo_global || 1000) + gDelta);
    const nextXp = (u.xp || 0) + xpGain;
    const nextLevel = levelFromXp(nextXp);
    const nextWins = (u.wins || 0) + (won ? 1 : 0);
    const nextLosses = (u.losses || 0) + (!won && !draw ? 1 : 0);
    const nextDraws = (u.draws || 0) + (draw ? 1 : 0);
    const nextMatches = (u.matches_played || 0) + 1;
    const nextStreak = won ? (u.current_streak || 0) + 1 : draw ? u.current_streak || 0 : 0;
    const nextBest = Math.max(u.best_streak || 0, nextStreak);
    const nextPlaytime = (u.playtime_seconds || 0) + Math.min(durationSec, 3600);

    db.prepare(
      `UPDATE users SET
        ${col} = ?, elo_global = ?, xp = ?, level = ?,
        wins = ?, losses = ?, draws = ?, matches_played = ?,
        current_streak = ?, best_streak = ?, playtime_seconds = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      nextGameElo,
      nextGlobalElo,
      nextXp,
      nextLevel,
      nextWins,
      nextLosses,
      nextDraws,
      nextMatches,
      nextStreak,
      nextBest,
      nextPlaytime,
      new Date().toISOString(),
      u.id
    );

    if (nextWins >= 1) unlockAchievement(db, u.id, 'first_win');
    if (nextStreak >= 3) unlockAchievement(db, u.id, 'streak_3');
    if (nextStreak >= 5) unlockAchievement(db, u.id, 'streak_5');
    if (nextMatches >= 25) unlockAchievement(db, u.id, 'veteran_25');
    if (gameId === 'air-hockey' && nextGameElo >= 1100) unlockAchievement(db, u.id, 'hockey_ace');
    if (gameId === 'connect-four' && nextGameElo >= 1100) unlockAchievement(db, u.id, 'c4_tactician');
    if (gameId === 'tic-tac-toe' && nextGameElo >= 1100) unlockAchievement(db, u.id, 'ttt_master');
  };

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE game_sessions SET status = ?, ended_at = ? WHERE id = ?').run('finished', nowMs, sessionId);

    const winnerId = winnerSlot === 1 ? p1.id : winnerSlot === 2 ? p2.id : null;
    const resId = 'res_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    db.prepare(
      `INSERT INTO game_results
       (id, session_id, game_id, player1_id, player2_id, winner_id, is_draw, score_summary, p1_elo_delta, p2_elo_delta, duration_seconds, played_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      resId,
      sessionId,
      gameId,
      p1.id,
      p2.id,
      winnerId,
      winnerSlot === 0 ? 1 : 0,
      String(scoreSummary || '').slice(0, 40),
      delta1,
      delta2,
      durationSec,
      new Date(nowMs).toISOString()
    );

    applyForPlayer(p1, winnerSlot === 1, winnerSlot === 0, delta1, gDelta1, xp1);
    applyForPlayer(p2, winnerSlot === 2, winnerSlot === 0, delta2, gDelta2, xp2);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    sessionId,
    gameId,
    winnerSlot,
    p1Delta: delta1,
    p2Delta: delta2
  };
}
