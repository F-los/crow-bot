import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Events, GatewayIntentBits,
  MessageFlags, PermissionFlagsBits, StringSelectMenuBuilder,
} from 'discord.js';
import {
  adjustMatchesPlayed,closeSession,finishRound,isGameRunning,joinSession,kickPlayer,
  leaveSession,makeSession,myStatus,nextRound,priorityPlayers,
} from './rotation.js';
import { getGuild,persist } from './store.js';
import { renderBoard } from './render.js';
import { getProfile,markOnnjRegistered,restoreOnnjStatuses } from './profiles.js';
import { rosterMessages } from './roster.js';
import { beginGame as beginGameSafe } from './game-service.js';
import { beginRegistration,formatOwnProfile,handleRegistrationInteraction } from './registration.js';

const {DISCORD_TOKEN}=process.env;
if(!DISCORD_TOKEN) throw new Error('.env에 DISCORD_TOKEN을 설정하세요.');
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const panelJobs=new Map();
function refreshPanel(session){
  if(!session.messageId)return Promise.resolve();
  const previous=panelJobs.get(session.guildId)??Promise.resolve();
  const job=previous.catch(()=>{}).then(async()=>{
    const channel=await client.channels.fetch(session.channelId);
    if(!channel?.isTextBased()||!('messages' in channel))return;
    const message=await channel.messages.fetch(session.messageId);
    await message.edit(renderBoard(session));
  });
  panelJobs.set(session.guildId,job);return job;
}
async function safeRefresh(session){
  try{await refreshPanel(session);return '';}
  catch(e){console.error('모집 게시판 업데이트 실패:',e);
    return '\n⚠️ 저장은 완료됐으나 모집판 갱신에 실패했습니다. 봇의 메시지 권한을 확인해주세요.';}
}
function isAdmin(i){return i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ||i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)||i.guild?.ownerId===i.user.id;}
function requireAdmin(i){if(!isAdmin(i))throw new Error('이 기능은 서버 관리자만 사용할 수 있습니다.');}
function activeSession(i){
  if(!i.guildId)throw new Error('디스코드 서버에서만 사용할 수 있습니다.');
  const s=getGuild(i.guildId).active;
  if(!s||s.status!=='open')throw new Error('모집 중인 내전이 없습니다. `/내전 모집`으로 시작해주세요.');
  return s;
}
function requireSessionId(session,id){if(session.id!==id)throw new Error('만료된 모집판입니다. 현재 모집판을 사용해주세요.');}
function selectionRow(session,kind){
  const list=priorityPlayers(session);
  if(!list.length)throw new Error('현재 대기열이 비어 있습니다.');
  const options=list.slice(0,25).map((p,i)=>({label:(p.displayName||p.id).slice(0,100),description:`${i+1}위 · 참여 ${p.matchesPlayed}판`,value:p.id}));
  const menu=new StringSelectMenuBuilder().setCustomId(`crow:${kind}pick:${session.id}`)
    .setPlaceholder(kind==='remove'?'대기열 제외 참가자':'판수 변경 참가자').addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}
function adjustRow(sessionId,userId){return new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`crow:adjust:${sessionId}:${userId}:+1`).setLabel('+1판').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`crow:adjust:${sessionId}:${userId}:-1`).setLabel('-1판').setStyle(ButtonStyle.Danger));}

// 기존 nextRound가 판수를 한 번만 올린다. v3에서는 별도의 판수 증가가 없다.
function beginGame(session){
  return beginGameSafe(session,{getProfile,persist,markOnnjRegistered});
}
async function publishRoster(session,roster){
  const channel=await client.channels.fetch(session.channelId);
  if(!channel?.isTextBased()||!('send' in channel))throw new Error('명단을 게시할 수 있는 채널이 아닙니다.');
  for(const chunk of rosterMessages(session,roster)){
    await channel.send({content:chunk,allowedMentions:{parse:[]}});
  }
}
async function startAndReport(interaction,session){
  const {selected,roster}=beginGame(session);
  const note=await safeRefresh(session);
  let postNote='';
  try{await publishRoster(session,roster);}
  catch(e){console.error('참가 명단 게시 실패:',e);postNote='\n⚠️ 명단 공개 게시에 실패했습니다. 모집판을 확인해주세요.';}
  await interaction.editReply(`🎮 **${session.round}판 시작!** 시청자 ${selected.length}명 선발 · 스트리머 필참.\n`
    +`기존 ${roster.filter(r=>r.wasRegistered).length}명 / 이번 판 등록 처리 ${roster.filter(r=>!r.wasRegistered&&!r.missing).length}명 · 프로필 미등록 ${roster.filter(r=>r.missing).length}명.\n`
    +`참여 판수는 기존 로테이션 기준으로 이미 반영됐습니다.${note}${postNote}`);
}
async function handleProfileCommand(i){
  if(!i.guildId)throw new Error('디스코드 서버에서만 사용할 수 있습니다.');
  if(i.commandName==='내전정보'){
    await i.reply({content:formatOwnProfile(getProfile(i.guildId,i.user.id)),flags:MessageFlags.Ephemeral});
    return;
  }
  if(i.commandName==='내전등록'||i.commandName==='내전수정'){
    await beginRegistration(i,null,i.commandName==='내전수정');return;
  }
}
async function handleCommand(i){
  if(!i.guildId)throw new Error('디스코드 서버에서만 사용할 수 있습니다.');
  const sub=i.options.getSubcommand();
  if(sub!=='현황')requireAdmin(i);
  await i.deferReply({flags:MessageFlags.Ephemeral});
  const guild=getGuild(i.guildId);
  if(sub==='모집'){
    if(guild.active?.status==='open'){
      await i.editReply(`이미 모집 중입니다. <https://discord.com/channels/${i.guildId}/${guild.active.channelId}/${guild.active.messageId}>`);return;}
    if(!i.channel?.isTextBased()||!('send' in i.channel))throw new Error('텍스트 채널에서 사용해주세요.');
    const session=makeSession(i.guildId,i.channel.id,randomUUID().slice(0,12));
    const message=await i.channel.send(renderBoard(session));
    session.messageId=message.id;guild.active=session;persist();
    await i.editReply(`✅ 까마귀봇 v3 모집판을 만들었습니다. ${message.url}`);return;
  }
  const s=activeSession(i);
  if(sub==='테스트모드'){
    s.testMode=i.options.getBoolean('활성화',true);persist();
    const note=await safeRefresh(s);
    await i.editReply(`${s.testMode?'🧪 테스트 모드 활성화 (1명 이상 시작 가능)':'✅ 테스트 모드 비활성화 (9명 필수)'}${note}`);return;
  }
  if(sub==='현황'){
    await i.editReply(`🐦‍⬛ **까마귀봇 v3**\n${s.round}판 · 게임 중 시청자 ${isGameRunning(s)?s.currentIds.length:0}명 · 대기 ${priorityPlayers(s).length}명\n<https://discord.com/channels/${s.guildId}/${s.channelId}/${s.messageId}>`);return;
  }
  if(sub==='시작'||sub==='다음판'){
    if(sub==='시작'&&s.round!==0)throw new Error('첫 판은 시작됐습니다. `/내전 다음판`을 사용해주세요.');
    if(sub==='다음판'&&s.round===0)throw new Error('먼저 `/내전 시작`을 사용해주세요.');
    await startAndReport(i,s);return;
  }
  if(sub==='게임종료'){
    const finished=finishRound(s);persist();const note=await safeRefresh(s);
    await i.editReply(`🏁 **${s.round}판 종료!** 참가자 ${finished.length}명은 대기열에서 자동 제외되었습니다. 다음 판은 재신청이 필요합니다.${note}`);return;
  }
  if(sub==='제외'){
    const user=i.options.getUser('유저',true);kickPlayer(s,user.id);persist();const note=await safeRefresh(s);
    await i.editReply(`🚫 <@${user.id}>님을 대기열에서 제외했습니다. 판수는 유지됩니다.${note}`);return;
  }
  if(sub==='판수변경'){
    const user=i.options.getUser('유저',true),amount=i.options.getInteger('증감',true);
    const p=adjustMatchesPlayed(s,user.id,amount);persist();const note=await safeRefresh(s);
    await i.editReply(`✅ <@${user.id}>님 판수 ${amount>0?'+':''}${amount} → 현재 ${p.matchesPlayed}판.${note}`);return;
  }
  if(sub==='종료'){
    closeSession(s);guild.history??=[];guild.history.push(s);guild.history=guild.history.slice(-30);guild.active=null;persist();
    const note=await safeRefresh(s);await i.editReply(`✅ 모집 종료. 총 ${s.round}판 기록을 저장했습니다.${note}`);return;
  }
}
async function handleButton(i){
  if(!i.guildId)throw new Error('디스코드 서버에서만 사용 가능합니다.');
  const [,action,sessionId,targetId,amountStr]=i.customId.split(':');
  const s=activeSession(i);requireSessionId(s,sessionId);
  if(action==='adjust'){
    requireAdmin(i);const p=adjustMatchesPlayed(s,targetId,Number(amountStr));persist();
    await i.update({content:`✅ <@${targetId}> 현재 **${p.matchesPlayed}판**입니다.`,components:[adjustRow(s.id,targetId)],allowedMentions:{parse:[]}});
    await safeRefresh(s);return;
  }
  if(s.messageId!==i.message.id)throw new Error('현재 공개 모집판에서 실행해주세요.');
  if(action==='remove'||action==='count'){
    requireAdmin(i);const queue=priorityPlayers(s);
    await i.reply({content:`${action==='remove'?'🚫 제외':'➕➖ 판수 변경'}할 참가자를 선택하세요.${queue.length>25?'\n※ 상위 25명만 표시됩니다.':''}`,
      components:[selectionRow(s,action)],flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});return;
  }
  if(action==='join'){
    const registered=getProfile(i.guildId,i.user.id);
    if(!registered){await beginRegistration(i,s.id);return;}
  }
  if(action==='next'||action==='finish')requireAdmin(i);
  await i.deferReply({flags:MessageFlags.Ephemeral});
  if(action==='status'){await i.editReply(myStatus(s,i.user.id));return;}
  if(action==='join'){
    const name=i.member?.nickname||i.user.globalName||i.user.username;
    joinSession(s,i.user.id,name);persist();const note=await safeRefresh(s);
    await i.editReply(`✅ 참가 신청 완료!\n${myStatus(s,i.user.id)}${note}`);return;
  }
  if(action==='leave'){
    leaveSession(s,i.user.id);persist();const note=await safeRefresh(s);
    await i.editReply(`✅ 참가 신청을 취소했습니다. 참여 판수는 유지됩니다.${note}`);return;
  }
  if(action==='next'){await startAndReport(i,s);return;}
  if(action==='finish'){
    const finished=finishRound(s);persist();const note=await safeRefresh(s);
    await i.editReply(`🏁 ${s.round}판 종료! 시청자 ${finished.length}명이 대기열에서 제외되었습니다. 다시 참가 신청해주세요.${note}`);return;
  }
}
async function handleSelect(i){
  if(!i.guildId)throw new Error('서버에서만 사용할 수 있습니다.');
  requireAdmin(i);
  const [,action,sessionId]=i.customId.split(':');
  const s=activeSession(i);requireSessionId(s,sessionId);
  const target=i.values[0];const p=priorityPlayers(s).find(x=>x.id===target);
  if(!p)throw new Error('대기열에서 해당 참가자를 찾지 못했습니다.');
  if(action==='removepick'){
    kickPlayer(s,target);persist();await i.update({content:`🚫 <@${target}>님을 대기열에서 제외했습니다.`,components:[],allowedMentions:{parse:[]}});
    await safeRefresh(s);return;
  }
  if(action==='countpick'){
    await i.update({content:`➕➖ <@${target}> · 현재 **${p.matchesPlayed}판**\n아래 버튼으로 조정해주세요.`,components:[adjustRow(s.id,target)],allowedMentions:{parse:[]}});return;
  }
}
client.once(Events.ClientReady,async ready=>{
  console.log(`🐦‍⬛ 까마귀봇 v3 로그인 완료: ${ready.user.tag}`);
  if(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_GUILD_ID){
    try{await import('./register.js');}
    catch(error){console.error('새 슬래시 명령어 자동 등록 실패:',error);}
  }else{
    console.warn('DISCORD_CLIENT_ID / DISCORD_GUILD_ID가 없어 새 슬래시 명령어 등록을 건너뜁니다.');
  }
});
client.on(Events.InteractionCreate,async(i)=>{
  const command=i.isChatInputCommand()&&['내전','내전등록','내전수정','내전정보'].includes(i.commandName);
  const button=i.isButton()&&i.customId.startsWith('crow:');
  const select=i.isStringSelectMenu()&&i.customId.startsWith('crow:');
  const registration=(i.isButton()||i.isModalSubmit())&&i.customId.startsWith('crowv3:');
  if(!command&&!button&&!select&&!registration)return;
  try{
    if(registration){
      const result=await handleRegistrationInteraction(i);
      if(result?.registered && result.sessionId){const s=getGuild(result.guildId).active;
        if(s?.id===result.sessionId)await safeRefresh(s);}
    }else if(command){if(i.commandName==='내전')await handleCommand(i);else await handleProfileCommand(i);}
    else if(button)await handleButton(i);
    else await handleSelect(i);
  }catch(error){
    console.error('상호작용 오류:',error);
    const message=error instanceof Error?error.message:'알 수 없는 오류입니다.';
    try{
      if(i.deferred)await i.editReply({content:`⚠️ ${message}`,components:[]});
      else if(i.replied)await i.followUp({content:`⚠️ ${message}`,flags:MessageFlags.Ephemeral});
      else await i.reply({content:`⚠️ ${message}`,flags:MessageFlags.Ephemeral});
    }catch(e){console.error('오류 응답 실패:',e);}
  }
});
await client.login(DISCORD_TOKEN);
