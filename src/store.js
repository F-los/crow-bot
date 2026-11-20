import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const file = path.join(dir, 'state.json');

function readInitialState() {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) return { guilds: {} };
  // 잘못된 JSON 파일일 때 조용히 초기화하지 않는다. 운영 정보 유실 방지.
  const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!loaded || !loaded.guilds || typeof loaded.guilds !== 'object') {
    throw new Error('저장 데이터 구조가 올바르지 않습니다. data/state.json을 확인하세요.');
  }
  return loaded;
}

export const state = readInitialState();

export function getGuild(guildId) {
  state.guilds[guildId] ??= { active: null, history: [] };
  return state.guilds[guildId];
}

export function persist() {
  const temp = path.join(dir, `state.${process.pid}.tmp`);
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, file);
}
