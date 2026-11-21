export const TIERS = ['UNRANKED', 'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
export const TIER_LABELS = {
  UNRANKED: '언랭크', IRON: '아이언', BRONZE: '브론즈', SILVER: '실버', GOLD: '골드',
  PLATINUM: '플래티넘', EMERALD: '에메랄드', DIAMOND: '다이아몬드', MASTER: '마스터',
  GRANDMASTER: '그랜드마스터', CHALLENGER: '챌린저',
};
export const LANES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
export const LANE_LABELS = {TOP:'탑', JUNGLE:'정글', MID:'미드', ADC:'원딜', SUPPORT:'서폿'};
export const isHighTier = t => ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(t);
export const hasDivision = t => t !== 'UNRANKED' && !isHighTier(t);

export function validateRiotId(value) {
  const riotId = String(value ?? '').trim();
  const matches = riotId.match(/^([^#]{2,16})#([^#\s]{3,5})$/u);
  if (!matches || !matches[1].trim() || /[\r\n@]/u.test(riotId)) {
    throw new Error('롤 계정은 게임이름#태그 형식으로 입력해주세요. (예: 까마귀#KR1)');
  }
  return riotId;
}
function validateRank(tier, division, lp) {
  if (!TIERS.includes(tier)) throw new Error('올바른 티어를 선택해주세요.');
  if (hasDivision(tier)) {
    if (!['1','2','3','4'].includes(String(division))) throw new Error('티어의 1~4단계를 선택해주세요.');
    return {tier, division:String(division), lp:null};
  }
  if (isHighTier(tier)) {
    const text=String(lp ?? '').trim();
    if (!/^\d{1,6}$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('마스터 이상 LP는 0 이상의 정수로 입력해주세요.');
    return {tier, division:null, lp:Number(text)};
  }
  return {tier, division:null, lp:null};
}
export function validateProfile(profile) {
  const riotId=validateRiotId(profile.riotId);
  const current=validateRank(profile.currentTier, profile.currentDivision, profile.currentLp);
  const peak=validateRank(profile.peakTier, profile.peakDivision, profile.peakLp);
  if (TIERS.indexOf(peak.tier) < TIERS.indexOf(current.tier) ||
      (peak.tier === current.tier && hasDivision(peak.tier) && Number(peak.division) > Number(current.division)) ||
      (peak.tier === current.tier && isHighTier(peak.tier) && peak.lp < current.lp)) {
    throw new Error('최고 티어는 현재 티어보다 낮을 수 없습니다.');
  }
  const lanes=[...new Set(profile.lanes ?? [])];
  if (!lanes.length || lanes.some(l=>!LANES.includes(l))) throw new Error('선호 라인을 1개 이상 선택해주세요.');
  return {riotId, currentTier:current.tier, currentDivision:current.division, currentLp:current.lp,
    peakTier:peak.tier, peakDivision:peak.division, peakLp:peak.lp, lanes};
}
export function rankLabel(tier, division, lp) {
  if (!tier) return '정보 없음';
  const base=TIER_LABELS[tier] ?? tier;
  if (hasDivision(tier)) return `${base} ${division}`;
  if (isHighTier(tier)) return `${base} ${lp}LP`;
  return base;
}
export function preferredLanes(lanes) { return (lanes ?? []).map(l=>LANE_LABELS[l] ?? l).join(', '); }
export function safeDiscordText(value) { return String(value ?? '').replaceAll('@', '＠').replaceAll('`', 'ˋ').replaceAll('*','＊').replaceAll('_','＿').replaceAll('|','｜').replaceAll('~','～').replace(/[\r\n]/g,' '); }
