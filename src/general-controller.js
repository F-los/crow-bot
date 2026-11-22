import {randomUUID} from 'node:crypto';
import {
  ActionRowBuilder, AttachmentBuilder, MessageFlags, ModalBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import {getGuild,persist} from './store.js';
import {
  createGeneralSession,orderedGeneralApplicants,generalGroups,generalPosition,
  joinGeneralSession,editGeneralApplicant,leaveGeneralSession,closeGeneralSession,
} from './general-queue.js';
import {renderGeneralBoard} from './general-render.js';

const editJobs=new Map();
function currentSession(interaction) {
  if (!interaction.guildId) throw new Error('디스코드 서버에서만 사용 가능합니다.');
  const session=getGuild(interaction.guildId).generalGame;
  if (!session || session.status!=='open') {
    throw new Error('현재 종합게임 모집이 없습니다. 관리자가 /종합게임 모집 명령어로 생성할 수 있습니다.');
  }
  return session;
}
function checkId(session,sid) {
  if (session.id!==sid) throw new Error('만료된 모집판입니다. 현재 모집판을 이용해주세요.');
}
function checkBoard(session,interaction,sid) {
  checkId(session,sid);
  if (session.messageId!==interaction.message.id) throw new Error('현재 공개 모집판에서 실행해주세요.');
}
function displayName(interaction) {
  return interaction.member?.nickname||interaction.user.globalName||interaction.user.username;
}
async function refresh(session,client) {
  if (!session.messageId) return;
  const previous=editJobs.get(session.guildId)??Promise.resolve();
  const job=previous.catch(()=>{}).then(async()=>{
    const channel=await client.channels.fetch(session.channelId);
    if (!channel?.isTextBased() || !('messages' in channel)) throw new Error('모집 채널에 접근할 수 없습니다.');
    const message=await channel.messages.fetch(session.messageId);
    await message.edit(renderGeneralBoard(session));
  });
  editJobs.set(session.guildId,job);
  return job;
}
async function safeRefresh(session,client) {
  try { await refresh(session,client); return ''; }
  catch(error) {
    console.error('종합게임 모집판 업데이트 실패:',error);
    return '\n⚠️ 신청 정보는 저장됐지만 모집판 갱신에 실패했습니다. 메시지 권한을 확인해주세요.';
  }
}
function userStatus(session,userId) {
  const position=generalPosition(session,userId);
  if (!position) return '현재 신청하지 않았습니다.';
  const p=session.applicants.find(p=>p.id===userId);
  return '🎮 **'+session.gameName+'** · 게임 닉네임: **'+p.gameNickname.replaceAll('*','＊')+'**\n'
    +'신청 순서 **'+position.position+'번째** · '+(position.confirmed?'✅ 확정 참가자':'⏳ 대기 '+(position.position-session.capacity)+'순위');
}
function modalFor(session,userId,edit) {
  const existing=session.applicants.find(p=>p.id===userId);
  if (edit && !existing) throw new Error('수정할 참가 신청 정보가 없습니다. 먼저 참가 신청해주세요.');
  if (!edit && existing) throw new Error('이미 신청했습니다. 내 정보 수정 버튼을 사용해주세요.');
  const nickname=new TextInputBuilder()
    .setCustomId('gameNickname').setLabel('게임 닉네임 (필수)')
    .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(60).setRequired(true)
    .setPlaceholder('게임 내에서 사용하는 닉네임');
  const extra=new TextInputBuilder()
    .setCustomId('extraInfo').setLabel('추가 정보 (선택)')
    .setStyle(TextInputStyle.Paragraph).setMaxLength(200).setRequired(false)
    .setPlaceholder('친구 코드, 서버, 플랫폼 등 필요한 정보');
  if (existing) {
    nickname.setValue(existing.gameNickname);
    if (existing.extraInfo) extra.setValue(existing.extraInfo);
  }
  return new ModalBuilder()
    .setCustomId('crowgen:'+(edit?'edit':'join')+':'+session.id)
    .setTitle((edit?'참가 정보 수정 · ':'참가 신청 · ')+session.gameName.slice(0,24))
    .addComponents(new ActionRowBuilder().addComponents(nickname),new ActionRowBuilder().addComponents(extra));
}
function detailsFile(session) {
  const list=orderedGeneralApplicants(session);
  const lines=[
    '까마귀봇 종합게임 참가 신청 정보',
    '게임: '+session.gameName,
    '정원: '+session.capacity+'명 (스트리머 제외)',
    '신청자: '+list.length+'명',
    '',
  ];
  for (let n=0;n<list.length;n++) {
    const p=list[n];
    lines.push((n+1)+' / '+(n<session.capacity?'확정':'대기')+
      ' / Discord ID: '+p.id+' / 표시 이름: '+p.displayName+
      ' / 게임 닉네임: '+p.gameNickname+
      ' / 추가 정보: '+(p.extraInfo||'(없음)'));
  }
  return new AttachmentBuilder(Buffer.from(lines.join('\n'),'utf8'),{name:'general-game-applicants.txt'});
}
async function endRecruitment(session,guild,client) {
  closeGeneralSession(session);
  guild.generalGameHistory??=[];
  guild.generalGameHistory.push(session);
  guild.generalGameHistory=guild.generalGameHistory.slice(-30);
  guild.generalGame=null;
  persist();
  return safeRefresh(session,client);
}
export async function handleGeneralCommand(interaction,client,requireAdmin) {
  if (!interaction.guildId) throw new Error('디스코드 서버에서만 사용 가능합니다.');
  const sub=interaction.options.getSubcommand();
  if (sub!=='현황') requireAdmin(interaction);
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const guild=getGuild(interaction.guildId);
  if (sub==='모집') {
    if (guild.generalGame?.status==='open') {
      const old=guild.generalGame;
      await interaction.editReply('이미 종합게임 모집이 진행 중입니다. <https://discord.com/channels/'+old.guildId+'/'+old.channelId+'/'+old.messageId+'>');
      return;
    }
    if (!interaction.channel?.isTextBased() || !('send' in interaction.channel)) throw new Error('텍스트 채널에서 사용해주세요.');
    const session=createGeneralSession(
      interaction.guildId,interaction.channel.id,randomUUID().slice(0,12),
      interaction.options.getString('게임',true),interaction.options.getInteger('인원',true),
    );
    const message=await interaction.channel.send(renderGeneralBoard(session));
    session.messageId=message.id;
    guild.generalGame=session;
    persist();
    await interaction.editReply('✅ **'+session.gameName+'** 종합게임 모집판을 생성했습니다. 정원 '+session.capacity+'명(시청자 신청자 기준), 선착순입니다.\n'+message.url);
    return;
  }
  const session=currentSession(interaction);
  if (sub==='현황') {
    const {confirmed,waiting}=generalGroups(session);
    await interaction.editReply('🎮 **'+session.gameName+'** · 정원 '+session.capacity+'명 · 확정 '+confirmed.length+'명 · 대기 '+waiting.length+'명\n<https://discord.com/channels/'+session.guildId+'/'+session.channelId+'/'+session.messageId+'>');
    return;
  }
  if (sub==='명단') {
    await interaction.editReply({content:'📋 신청 순서·게임 닉네임·추가 정보 (관리자 전용)',files:[detailsFile(session)]});
    return;
  }
  if (sub==='제외') {
    const user=interaction.options.getUser('유저',true);
    leaveGeneralSession(session,user.id);
    persist();
    const note=await safeRefresh(session,client);
    await interaction.editReply('🚫 <@'+user.id+'>님을 종합게임 명단에서 제외했습니다. 대기자 순서가 자동 갱신됩니다.'+note);
    return;
  }
  if (sub==='종료') {
    const note=await endRecruitment(session,guild,client);
    await interaction.editReply('✅ **'+session.gameName+'** 모집 종료. 마지막 명단은 기록으로 보관했습니다.'+note);
    return;
  }
  throw new Error('지원하지 않는 종합게임 명령어입니다.');
}
export async function handleGeneralButton(interaction,client,requireAdmin) {
  if (!interaction.guildId) throw new Error('디스코드 서버에서만 사용 가능합니다.');
  const [,action,sid]=interaction.customId.split(':');
  const session=currentSession(interaction);
  checkBoard(session,interaction,sid);
  if (['details','remove','close'].includes(action)) requireAdmin(interaction);
  if (action==='join' || action==='edit') {
    await interaction.showModal(modalFor(session,interaction.user.id,action==='edit'));
    return;
  }
  if (action==='remove') {
    const users=orderedGeneralApplicants(session);
    if (!users.length) throw new Error('현재 신청자가 없습니다.');
    const options=users.slice(0,25).map((p,n)=>({
      label:(p.displayName||p.id).slice(0,100),
      description:((n+1)+'번째 · '+p.gameNickname).slice(0,100),
      value:p.id,
    }));
    const menu=new StringSelectMenuBuilder().setCustomId('crowgen:removepick:'+session.id)
      .setPlaceholder('명단에서 제외할 사용자 선택').addOptions(options);
    await interaction.reply({
      content:'제외할 신청자를 선택하세요.'+(users.length>25?'\n※ 첫 25명만 표시됩니다. 나머지는 /종합게임 제외 명령어를 이용해주세요.':''),
      components:[new ActionRowBuilder().addComponents(menu)],flags:MessageFlags.Ephemeral,
      allowedMentions:{parse:[]},
    });
    return;
  }
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  if (action==='status') {
    await interaction.editReply(userStatus(session,interaction.user.id));
  } else if (action==='details') {
    await interaction.editReply({content:'📋 신청 순서·게임 닉네임·추가 정보 (관리자 전용)',files:[detailsFile(session)]});
  } else if (action==='leave') {
    leaveGeneralSession(session,interaction.user.id);
    persist();
    const note=await safeRefresh(session,client);
    await interaction.editReply('✅ 신청을 취소했습니다. 재신청하면 새 순서로 들어갑니다.'+note);
  } else if (action==='close') {
    const note=await endRecruitment(session,getGuild(interaction.guildId),client);
    await interaction.editReply('✅ 모집이 종료됐습니다.'+note);
  } else throw new Error('지원하지 않는 종합게임 버튼입니다.');
}
export async function handleGeneralModal(interaction,client) {
  if (!interaction.guildId) throw new Error('디스코드 서버에서만 사용 가능합니다.');
  const [,action,sid]=interaction.customId.split(':');
  if (action!=='join' && action!=='edit') throw new Error('유효하지 않은 종합게임 입력창입니다.');
  const session=currentSession(interaction);
  checkId(session,sid);
  const nickname=interaction.fields.getTextInputValue('gameNickname');
  const extra=interaction.fields.getTextInputValue('extraInfo');
  if (action==='join') {
    joinGeneralSession(session,interaction.user.id,displayName(interaction),nickname,extra);
  } else {
    editGeneralApplicant(session,interaction.user.id,displayName(interaction),nickname,extra);
  }
  persist();
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const note=await safeRefresh(session,client);
  await interaction.editReply((action==='join'?'✅ 참가 신청 완료!':'✅ 참가 정보 수정 완료!')+'\n'+userStatus(session,interaction.user.id)+note);
}
export async function handleGeneralSelect(interaction,client,requireAdmin) {
  if (!interaction.guildId) throw new Error('디스코드 서버에서만 사용 가능합니다.');
  requireAdmin(interaction);
  const [,action,sid]=interaction.customId.split(':');
  if (action!=='removepick') throw new Error('알 수 없는 종합게임 선택 메뉴입니다.');
  const session=currentSession(interaction);
  checkId(session,sid);
  const userId=interaction.values[0];
  leaveGeneralSession(session,userId);
  persist();
  await interaction.update({content:'🚫 <@'+userId+'>님을 제외했습니다. 대기자를 자동 승격했습니다.',components:[],allowedMentions:{parse:[]}});
  await safeRefresh(session,client);
}
