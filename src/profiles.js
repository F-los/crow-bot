import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { validateProfile } from './profile-utils.js';

const folder=process.env.CROW_DATA_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
fs.mkdirSync(folder, {recursive:true});
const db=new DatabaseSync(path.join(folder,'profiles.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS player_profiles (
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  riot_id TEXT NOT NULL,
  current_tier TEXT NOT NULL,
  current_division TEXT,
  current_lp INTEGER,
  peak_tier TEXT NOT NULL,
  peak_division TEXT,
  peak_lp INTEGER,
  preferred_lanes TEXT NOT NULL,
  onnj_registered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, discord_id)
);
CREATE INDEX IF NOT EXISTS profiles_by_riot_id ON player_profiles (guild_id, riot_id);`);

function fromRow(row) {
  if(!row) return null;
  return {guildId:row.guild_id, discordId:row.discord_id, riotId:row.riot_id,
    currentTier:row.current_tier, currentDivision:row.current_division, currentLp:row.current_lp,
    peakTier:row.peak_tier, peakDivision:row.peak_division, peakLp:row.peak_lp,
    lanes:JSON.parse(row.preferred_lanes), onnjRegistered:Boolean(row.onnj_registered)};
}
export function getProfile(guildId, userId) {
  return fromRow(db.prepare('SELECT * FROM player_profiles WHERE guild_id=? AND discord_id=?').get(guildId,userId));
}
export function saveProfile(guildId,userId,form) {
  const p=validateProfile(form);
  const conflict=db.prepare('SELECT discord_id FROM player_profiles WHERE guild_id=? AND riot_id=? AND discord_id<>?').get(guildId,p.riotId,userId);
  if(conflict) throw new Error('이미 다른 디스코드 사용자에게 등록된 롤 계정입니다. 관리자에게 확인해주세요.');
  db.prepare(`INSERT INTO player_profiles (guild_id,discord_id,riot_id,current_tier,current_division,current_lp,peak_tier,peak_division,peak_lp,preferred_lanes)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,discord_id) DO UPDATE SET
    riot_id=excluded.riot_id,current_tier=excluded.current_tier,current_division=excluded.current_division,current_lp=excluded.current_lp,
    peak_tier=excluded.peak_tier,peak_division=excluded.peak_division,peak_lp=excluded.peak_lp,preferred_lanes=excluded.preferred_lanes,
    updated_at=CURRENT_TIMESTAMP`).run(guildId,userId,p.riotId,p.currentTier,p.currentDivision,p.currentLp,p.peakTier,p.peakDivision,p.peakLp,JSON.stringify(p.lanes));
  return getProfile(guildId,userId);
}
export function markOnnjRegistered(guildId, userIds) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const st=db.prepare('UPDATE player_profiles SET onnj_registered=1,updated_at=CURRENT_TIMESTAMP WHERE guild_id=? AND discord_id=?');
    for(const id of new Set(userIds)) st.run(guildId,id);
    db.exec('COMMIT');
  } catch(err) {db.exec('ROLLBACK');throw err;}
}
export function restoreOnnjStatuses(guildId, statuses) {
  db.exec('BEGIN IMMEDIATE');
  try { const st=db.prepare('UPDATE player_profiles SET onnj_registered=? WHERE guild_id=? AND discord_id=?');
    for(const {id,registered} of statuses) st.run(registered?1:0,guildId,id);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
