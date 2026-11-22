import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, LabelBuilder, MessageFlags,
  ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getGuild, persist } from './store.js';
import {enrollAfterRegistration} from './registration-target.js';
import { getProfile, saveProfile } from './profiles.js';
import { TIERS, TIER_LABELS, LANES, LANE_LABELS, isHighTier, hasDivision,
  rankLabel, preferredLanes, validateProfile, validateRiotId, safeDiscordText } from './profile-utils.js';

const TIMEOUT=3*60*1000;
const pending=new Map();
function findPending(interaction,token) {
  const p=pending.get(token);
  if (!p || p.userId!==interaction.user.id || p.guildId!==interaction.guildId || Date.now()-p.createdAt>TIMEOUT) {
    pending.delete(token);throw new Error('등록 시간이 만료됐습니다. 다시 참가 버튼을 눌러주세요.');
  }
  return p;
}
function selectLabel(label,id,items,min=1,max=1) {
  return new LabelBuilder().setLabel(label).setStringSelectMenuComponent(
    new StringSelectMenuBuilder().setCustomId(id).setMinValues(min).setMaxValues(max)
      .addOptions(items.map(x=>({label:x.label,value:x.value,default:Boolean(x.default)})))
  );
}
function textLabel(label,id,placeholder,value,maxLength=64) {
  const txt=new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(maxLength).setPlaceholder(placeholder);
  if(value!==undefined && value!==null) txt.setValue(String(value));
  return new LabelBuilder().setLabel(label).setTextInputComponent(txt);
}
function modal1(token,profile) {
  const ranks=(selected)=>TIERS.map(t=>({label:TIER_LABELS[t],value:t,default:t===selected}));
  return new ModalBuilder().setCustomId(`crowv3:profile:${token}`).setTitle('까마귀봇 · 공통 롤 프로필 등록')
    .addLabelComponents(
      textLabel('롤 계정 (닉네임#태그)','v3_riot','까마귀#KR1',profile?.riotId,32),
      selectLabel('현재 티어','v3_current',ranks(profile?.currentTier)),
      selectLabel('최고 티어','v3_peak',ranks(profile?.peakTier)),
      selectLabel('선호 라인 (중복 가능)','v3_lanes',LANES.map(l=>({label:LANE_LABELS[l],value:l,default:profile?.lanes?.includes(l)})),1,5),
    );
}
function modal2(token,p) {
  const modal=new ModalBuilder().setCustomId(`crowv3:details:${token}`).setTitle('까마귀봇 · 롤 티어 세부 정보');
  for(const [which,tier,division,lp] of [
    ['현재',p.currentTier,p.currentDivision,p.currentLp], ['최고',p.peakTier,p.peakDivision,p.peakLp]
  ]) {
    const key=which==='현재'?'current':'peak';
    if(hasDivision(tier)) {
      modal.addLabelComponents(selectLabel(`${which} 티어 · ${TIER_LABELS[tier]} 세부 단계`, `v3_${key}_division`,
        ['4','3','2','1'].map(d=>({label:`${d}단계`,value:d,default:d===String(division)}))));
    }else if(isHighTier(tier)) {
      modal.addLabelComponents(textLabel(`${which} 티어 · ${TIER_LABELS[tier]} LP`, `v3_${key}_lp`, '예: 150',lp,6));
    }
  }
  return modal;
}
function actionRow(token,steps) {
  return new ActionRowBuilder().addComponents(steps.map(x=>new ButtonBuilder().setCustomId(`crowv3:${x.id}:${token}`).setLabel(x.label).setStyle(x.style??ButtonStyle.Primary)));
}
function preview(p) {
  return `📝 **최종 등록 정보 확인**\n`+
    `롤 닉네임: ${safeDiscordText(p.riotId)}\n`+
    `현재 티어: ${rankLabel(p.currentTier,p.currentDivision,p.currentLp)}\n`+
    `최고 티어: ${rankLabel(p.peakTier,p.peakDivision,p.peakLp)}\n`+
    `선호 라인: ${preferredLanes(p.lanes)}\n\n`+
    '저장하면 이후 내전·솔랭 듀오·자랭에서 다시 입력할 필요가 없습니다.';
}
export async function beginRegistration(interaction, sessionId=null, edit=false, queueContext=null) {
  if(!interaction.guildId) throw new Error('디스코드 서버에서만 사용할 수 있습니다.');
  const old=getProfile(interaction.guildId,interaction.user.id);
  if(edit&&!old) throw new Error('저장된 프로필이 없습니다. /내전등록 또는 참가 신청부터 진행해주세요.');
  if(!edit&&old) throw new Error('이미 등록된 프로필이 있습니다. 수정은 /내전수정 명령어를 사용해주세요.');
  for(const [key,session] of pending) {
    if(Date.now()-session.createdAt>TIMEOUT || (session.userId===interaction.user.id && session.guildId===interaction.guildId))pending.delete(key);
  }
  const token=randomUUID().slice(0,12);
  pending.set(token,{token,userId:interaction.user.id,guildId:interaction.guildId,sessionId,
    queueMode:queueContext?.mode??null,queueSource:queueContext?.source??null,
    startedAt:Date.now(),createdAt:Date.now(),form:old?{...old}:null,edit});
  await interaction.showModal(modal1(token,old));
}
export async function handleRegistrationInteraction(interaction) {
  if(!interaction.customId?.startsWith('crowv3:')) return false;
  const [,action,token]=interaction.customId.split(':');
  const p=findPending(interaction,token);
  if(action==='profile' && interaction.isModalSubmit()) {
    const fields=interaction.fields;
    const riotId=validateRiotId(fields.getTextInputValue('v3_riot'));
    p.form={riotId,currentTier:fields.getStringSelectValues('v3_current')[0],
      peakTier:fields.getStringSelectValues('v3_peak')[0],lanes:fields.getStringSelectValues('v3_lanes'),
      currentDivision:p.form?.currentDivision??null,currentLp:p.form?.currentLp??null,
      peakDivision:p.form?.peakDivision??null,peakLp:p.form?.peakLp??null};
    if(p.form.currentTier==='UNRANKED'&&p.form.peakTier==='UNRANKED') {
      p.form=validateProfile(p.form);
      await interaction.reply({content:preview(p.form),components:[actionRow(token,[{id:'save',label:'등록 완료'},{id:'cancel',label:'취소',style:ButtonStyle.Secondary}])],flags:MessageFlags.Ephemeral});
    }else{
      await interaction.reply({content:'✅ 기본 정보를 입력했습니다. **티어 세부 단계 / LP**를 선택해주세요.',
        components:[actionRow(token,[{id:'openDetails',label:'티어 세부 정보 선택'},{id:'cancel',label:'취소',style:ButtonStyle.Secondary}])],flags:MessageFlags.Ephemeral});
    }
    return true;
  }
  if(action==='openDetails' && interaction.isButton()) {
    await interaction.showModal(modal2(token,p.form));
    return true;
  }
  if(action==='details' && interaction.isModalSubmit()) {
    for(const [key,tier] of [['current',p.form.currentTier],['peak',p.form.peakTier]]){
      p.form[`${key}Division`]=hasDivision(tier)?interaction.fields.getStringSelectValues(`v3_${key}_division`)[0]:null;
      p.form[`${key}Lp`]=isHighTier(tier)?interaction.fields.getTextInputValue(`v3_${key}_lp`):null;
    }
    p.form=validateProfile(p.form);
    await interaction.reply({content:preview(p.form),components:[actionRow(token,[{id:'save',label:'등록 완료'},{id:'cancel',label:'취소',style:ButtonStyle.Secondary}])],flags:MessageFlags.Ephemeral});
    return true;
  }
  if(action==='cancel' && interaction.isButton()) {
    pending.delete(token);
    await interaction.update({content:'등록을 취소했습니다. 대기열에는 들어가지 않았습니다.',components:[]});
    return true;
  }
  if(action==='save' && interaction.isButton()) {
    if(!p.form) throw new Error('등록 정보가 없습니다. 처음부터 다시 진행해주세요.');
    const saved=saveProfile(p.guildId,p.userId,p.form);
    pending.delete(token);
    const result=enrollAfterRegistration(
      getGuild(p.guildId),
      {sessionId:p.sessionId,mode:p.queueMode,source:p.queueSource},
      p.userId,
      interaction.member?.nickname||interaction.user.globalName||interaction.user.username,
      p.startedAt,
    );
    if(result.joined)persist();
    await interaction.update({content:`✅ **등록 완료**\n${preview(saved)}${result.notice}`,components:[]});
    // 프로필 저장 및 큐 참가 후 기존 모집판을 갱신한다.
    return {registered:true,sessionId:p.sessionId,mode:p.queueMode,
      guildId:p.guildId,userId:p.userId};
  }
  return true;
}
export function formatOwnProfile(p) {
  if(!p) return '프로필이 없습니다. 참가 신청 또는 `/내전등록`을 이용해주세요.';
  return `${preview(p)}\n오늘내전 등록 이력: ${p.onnjRegistered?'✅ 기존':'🆕 아직 경기 시작 이력 없음'}`;
}
