import {randomUUID} from 'node:crypto';
import {ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder} from 'discord.js';
import {getGuild, persist} from './store.js';
import {
  MODE_META,TICKET_SOURCES,createModeSession,joinModeQueue,leaveModeQueue,
  removeModePlayer,approveSolo,pendingSolo,eligibleModePlayers,
  startModeGame,finishModeGame,closeModeSession,modeUserStatus,
  priorityFlexPlayers,flexRecords,adjustFlexMatches,missingModeProfiles
} from './mode-queue.js';
import {renderModeBoard} from './mode-render.js';
import {getProfile} from './profiles.js';
import {beginRegistration} from './registration.js';

const editJobs=new Map();
function currentSession(i,mode) {
  if(!i.guildId || !MODE_META[mode]) throw new Error('디스코드 서버의 유효한 게임 모드에서 사용해주세요.');
  const s=getGuild(i.guildId).modeQueues?.[mode];
  if(!s || s.status!=='open')throw new Error(`${MODE_META[mode].label} 모집 중이 아닙니다. / ${mode==='solo'?'솔랭':'자랭'} 모집 명령어를 사용해주세요.`);
  return s;
}
function checkPanel(s,i,sid) {
  if(s.id!==sid || s.messageId!==i.message.id)throw new Error('만료된 모집판입니다. 현재 모집판을 사용해주세요.');
}
async function refresh(s,client) {
  if(!s.messageId)return;
  const key=`${s.guildId}:${s.mode}`;
  const old=editJobs.get(key)??Promise.resolve();
  const promise=old.catch(()=>{}).then(async()=>{
    const channel=await client.channels.fetch(s.channelId);
    if(!channel?.isTextBased() || !('messages' in channel))throw new Error('모집 채널에 접근할 수 없습니다.');
    const message=await channel.messages.fetch(s.messageId);
    await message.edit(renderModeBoard(s));
  });
  editJobs.set(key,promise);
  return promise;
}
export async function safeRefresh(s,client) {
  try {await refresh(s,client);return '';}
  catch(e) {console.error('v4 모집판 갱신 실패',e);return '\n⚠️ 저장은 완료됐지만 모집판 표시가 갱신되지 않았습니다. 메시지 권한을 확인해주세요.';}
}
function queueSelect(s,action) {
  const entries=action==='approve'?pendingSolo(s):s.mode==='flex'?priorityFlexPlayers(s):s.waiting;
  if(!entries.length)throw new Error(action==='approve'?'승인 대기 중인 신청자가 없습니다.':'대기열에 참가자가 없습니다.');
  const options=entries.slice(0,25).map((p,i)=>({
    label:(p.displayName||p.id).slice(0,100),
    description:(s.mode==='solo'?`${i+1}번째 · ${TICKET_SOURCES[p.source]}`:`우선순위 ${i+1}위 · ${flexRecords(s)[p.id]?.matchesPlayed??0}판`).slice(0,100),
    value:p.id,
  }));
  const menu=new StringSelectMenuBuilder()
    .setCustomId(`crowv4:${s.mode}:${action}pick:${s.id}`)
    .setPlaceholder(action==='approve'?'승인할 듀오 신청자 선택':action==='count'?'판수를 변경할 자랭 참가자 선택':'제외할 참가자 선택')
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}
function adjustRow(s,userId) {
  const prefix=`crowv4:flex:adjust:${s.id}:${userId}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:+1`).setLabel('+1판').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${prefix}:-1`).setLabel('-1판').setStyle(ButtonStyle.Danger));
}
function statusText(s) {
  const meta=MODE_META[s.mode];
  const ready=eligibleModePlayers(s).length;
  return `🐦‍⬛ **${meta.label}** · ${s.phase==='playing'?'게임 중':'대기 중'}\n${s.round}판 진행 · 게임 ${s.current.length}/${meta.slots}명 · 대기 ${s.waiting.length}명${s.mode==='solo'?` (승인 ${ready} / 확인 대기 ${s.waiting.length-ready})`:''}\n<https://discord.com/channels/${s.guildId}/${s.channelId}/${s.messageId}>`;
}
function displayName(i) {return i.member?.nickname||i.user.globalName||i.user.username;}
async function perform(s,action,userId,client,source=null,name=null) {
  let notice;
  if(action==='join') {
    joinModeQueue(s,userId,name,source);
    notice=s.mode==='solo'?
      `✅ 듀오 신청이 접수됐습니다. (${TICKET_SOURCES[source]})\n🕓 후원 또는 룰렛 당첨 내역을 관리자에게 확인받으면 승인됩니다.\n${modeUserStatus(s,userId)}`:
      `✅ 무료 자랭 시참 신청 완료!\n${modeUserStatus(s,userId)}`;
  }else if(action==='leave') {
    leaveModeQueue(s,userId);
    notice='✅ 참가 신청을 취소했습니다.';
  }else if(action==='start') {
    // 구버전에서 이미 대기하던 미등록자도 프로필을 등록해야 시작 가능.
    const missing=missingModeProfiles(s,getProfile);
    if(missing.length)throw new Error(
      `다음 선발 예정자 ${missing.length}명의 롤 프로필이 없습니다. `+
      `(${missing.map(p=>`<@${p.id}>`).join(', ')}) /내전등록으로 등록한 뒤 시작해주세요.`);
    const selected=startModeGame(s);
    notice=`🎮 **${s.mode==='solo'?'듀오 시작':'자랭 팀 확정'}** · ${s.round}판\n${selected.map(p=>`<@${p.id}>`).join(', ')}\n※ ${s.mode==='solo'?'사용권 처리 및 실제 게임 진행은 관리자가 확인해주세요.':'스트리머 포함 5명입니다.'}`;
  }else if(action==='finish') {
    const done=finishModeGame(s);
    notice=`🏁 **${s.round}판 게임 종료** · ${done.length}명 자동 제외. 다른 대기자는 그대로 유지됩니다.`;
  }else if(action==='approve') {
    const p=approveSolo(s,userId);
    notice=`✅ <@${p.id}> 듀오 신청을 승인했습니다. (${TICKET_SOURCES[p.source]})`;
  }else if(action==='remove') {
    removeModePlayer(s,userId);
    notice=`🚫 <@${userId}> 대기열에서 제외했습니다.`;
  }else throw new Error('지원하지 않는 동작입니다.');
  persist();
  return notice+(await safeRefresh(s,client));
}

export async function handleModeCommand(i,client,requireAdmin) {
  if(!i.guildId)throw new Error('서버에서만 사용할 수 있습니다.');
  const mode=i.commandName==='솔랭'?'solo':'flex';
  const sub=i.options.getSubcommand();
  if(sub!=='현황')requireAdmin(i);
  await i.deferReply({flags:MessageFlags.Ephemeral});
  const guild=getGuild(i.guildId);
  if(sub==='모집') {
    guild.modeQueues??={};
    const active=guild.modeQueues[mode];
    if(active?.status==='open') {
      await i.editReply(`이미 ${MODE_META[mode].label} 모집 중입니다. <https://discord.com/channels/${i.guildId}/${active.channelId}/${active.messageId}>`);
      return;
    }
    if(!i.channel?.isTextBased() || !('send' in i.channel))throw new Error('텍스트 채널에서 실행해주세요.');
    const s=createModeSession(i.guildId,i.channel.id,randomUUID().slice(0,12),mode);
    const message=await i.channel.send(renderModeBoard(s));
    s.messageId=message.id;guild.modeQueues[mode]=s;persist();
    await i.editReply(`✅ ${MODE_META[mode].label} 모집판을 만들었습니다. ${message.url}`);return;
  }
  const s=currentSession(i,mode);
  if(sub==='현황'){await i.editReply(statusText(s));return;}
  if(sub==='판수변경') {
    if(mode!=='flex')throw new Error('자랭 판수만 변경할 수 있습니다.');
    const user=i.options.getUser('유저',true);
    const delta=i.options.getInteger('증감',true);
    const player=adjustFlexMatches(s,user.id,delta);
    persist();
    const note=await safeRefresh(s,client);
    await i.editReply(`✅ 자랭 <@${user.id}> 판수 ${delta>0?'+':''}${delta} → **${player.matchesPlayed}판**${note}`);
    return;
  }
  if(sub==='승인') {
    const user=i.options.getUser('유저',true);
    await i.editReply(await perform(s,'approve',user.id,client));return;
  }
  if(sub==='제외') {
    const user=i.options.getUser('유저',true);
    await i.editReply(await perform(s,'remove',user.id,client));return;
  }
  if(sub==='시작' || sub==='게임종료') {
    await i.editReply(await perform(s,sub==='시작'?'start':'finish',i.user.id,client));return;
  }
  if(sub==='종료') {
    closeModeSession(s);
    guild.modeQueueHistory??={};guild.modeQueueHistory[mode]??=[];
    guild.modeQueueHistory[mode].push(s);
    guild.modeQueueHistory[mode]=guild.modeQueueHistory[mode].slice(-30);
    guild.modeQueues[mode]=null;persist();
    const note=await safeRefresh(s,client);
    await i.editReply(`✅ ${MODE_META[mode].label} 모집 종료 · 총 ${s.round}판 기록 보관.${note}`);
    return;
  }
  throw new Error('알 수 없는 명령어입니다.');
}

export async function handleModeButton(i,client,requireAdmin) {
  if(!i.guildId)throw new Error('서버에서만 사용할 수 있습니다.');
  const [,mode,action,sid,targetId,deltaStr]=i.customId.split(':');
  const s=currentSession(i,mode);
  if(action==='adjust'){
    requireAdmin(i);
    if(s.id!==sid || mode!=='flex')throw new Error('만료되었거나 잘못된 판수 조정 버튼입니다.');
    const record=adjustFlexMatches(s,targetId,Number(deltaStr));
    persist();
    await i.update({
      content:`✅ <@${targetId}> 자랭 참여 판수 **${record.matchesPlayed}판**`,
      components:[adjustRow(s,targetId)],allowedMentions:{parse:[]}});
    await safeRefresh(s,client);
    return;
  }
  checkPanel(s,i,sid);
  if(['approve','remove','count','start','finish'].includes(action))requireAdmin(i);
  if(action==='approve' || action==='remove' || action==='count') {
    await i.reply({content:action==='approve'?'승인할 듀오 참가자를 선택하세요.':action==='count'?'판수를 변경할 자랭 참가자를 선택하세요.':'대기열에서 제외할 사람을 선택하세요.',
      components:[queueSelect(s,action)],flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
    return;
  }
  if(action==='donation'||action==='roulette'||action==='join'){
    const source=action==='join'?null:action;
    if(s.mode==='solo' && !source)throw new Error('듀오권 획득 방법을 선택해주세요.');
    if(s.mode==='flex' && source)throw new Error('자랭은 무료 시참으로 신청해주세요.');
    if(!getProfile(i.guildId,i.user.id)){
      await beginRegistration(i,s.id,false,{mode:s.mode,source});
      return;
    }
  }
  await i.deferReply({flags:MessageFlags.Ephemeral});
  if(action==='status'){await i.editReply(modeUserStatus(s,i.user.id));return;}
  if(action==='donation'||action==='roulette'||action==='join'){
    const source=action==='join'?null:action;
    if(s.mode==='solo' && !source)throw new Error('듀오권 획득 방법을 선택해주세요.');
    if(s.mode==='flex' && source)throw new Error('자랭은 무료 시참으로 신청해주세요.');
    await i.editReply(await perform(s,'join',i.user.id,client,source,displayName(i)));return;
  }
  if(['leave','start','finish'].includes(action)) {
    await i.editReply(await perform(s,action,i.user.id,client));return;
  }
  throw new Error('알 수 없는 버튼입니다.');
}

export async function handleModeSelect(i,client,requireAdmin) {
  if(!i.guildId)throw new Error('서버에서만 사용할 수 있습니다.');
  const [,mode,action,sid]=i.customId.split(':');
  requireAdmin(i);
  const s=currentSession(i,mode);
  if(s.id!==sid)throw new Error('만료된 모집판입니다.');
  const userId=i.values[0];
  if(action==='countpick'){
    if(mode!=='flex')throw new Error('자랭 참가자만 판수를 변경할 수 있습니다.');
    if(!s.waiting.some(p=>p.id===userId))throw new Error('해당 참가자가 자랭 대기열에 없습니다.');
    await i.update({content:`➕➖ <@${userId}> · 현재 자랭 **${flexRecords(s)[userId]?.matchesPlayed??0}판**`,
      components:[adjustRow(s,userId)],allowedMentions:{parse:[]}});
    return;
  }
  const operation=action==='approvepick'?'approve':action==='removepick'?'remove':null;
  if(!operation)throw new Error('알 수 없는 관리자 선택 메뉴입니다.');
  await i.deferUpdate();
  const result=await perform(s,operation,userId,client);
  await i.editReply({content:result,components:[],allowedMentions:{parse:[]}});
}
