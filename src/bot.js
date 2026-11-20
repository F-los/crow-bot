import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Events, GatewayIntentBits,
  MessageFlags, PermissionFlagsBits, StringSelectMenuBuilder,
} from 'discord.js';
import {
  activePlayers, adjustMatchesPlayed, closeSession, finishRound, isGameRunning,
  joinSession, kickPlayer, leaveSession, makeSession, myStatus, nextRound,
  priorityPlayers,
} from './rotation.js';
import { getGuild, persist } from './store.js';
import { renderBoard } from './render.js';

const { DISCORD_TOKEN } = process.env;
if (!DISCORD_TOKEN) throw new Error('.env에 DISCORD_TOKEN을 설정하세요.');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 모집판 수정은 디스코드 서버별로 직렬화한다.
const panelJobs = new Map();
function refreshPanel(session) {
  if (!session.messageId) return Promise.resolve();
  const guildId = session.guildId;
  const previous = panelJobs.get(guildId) ?? Promise.resolve();
  const job = previous.catch(() => {}).then(async () => {
    const channel = await client.channels.fetch(session.channelId);
    if (!channel?.isTextBased() || !('messages' in channel)) return;
    const message = await channel.messages.fetch(session.messageId);
    await message.edit(renderBoard(session));
  });
  panelJobs.set(guildId, job);
  return job;
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    || interaction.guild?.ownerId === interaction.user.id;
}

function requireAdmin(interaction) {
  if (!isAdmin(interaction)) throw new Error('이 기능은 서버 관리자(서버 관리 또는 메시지 관리 권한)만 사용할 수 있습니다.');
}

function activeSession(interaction) {
  if (!interaction.guildId) throw new Error('디스코드 서버에서만 사용할 수 있습니다.');
  const session = getGuild(interaction.guildId).active;
  if (!session || session.status !== 'open') {
    throw new Error('진행 중인 내전 모집이 없습니다. `/내전 모집`으로 시작해주세요.');
  }
  return session;
}

function requireSessionId(session, sessionId) {
  if (session.id !== sessionId) throw new Error('이미 만료된 모집의 메뉴입니다. 현재 모집판에서 다시 선택해주세요.');
}

async function safeRefresh(session) {
  try {
    await refreshPanel(session);
    return '';
  } catch (error) {
    console.error('모집 게시판 업데이트 실패:', error);
    return '\n⚠️ 저장은 되었지만 모집판 메시지를 갱신하지 못했습니다. 봇 권한과 게시판 존재 여부를 확인해주세요.';
  }
}

function selectionRow(session, kind) {
  const list = priorityPlayers(session);
  if (!list.length) throw new Error('현재 대기열에 참가자가 없습니다.');
  const options = list.slice(0, 25).map((player, idx) => ({
    label: (player.displayName || player.id).slice(0, 100),
    description: `${idx + 1}위 · 참여 ${player.matchesPlayed}판`,
    value: player.id,
  }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`crow:${kind}pick:${session.id}`)
    .setPlaceholder(kind === 'remove' ? '대기열에서 제외할 참가자 선택' : '판수를 수정할 참가자 선택')
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function adjustRow(sessionId, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`crow:adjust:${sessionId}:${userId}:+1`).setLabel('+1판').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`crow:adjust:${sessionId}:${userId}:-1`).setLabel('-1판').setStyle(ButtonStyle.Danger),
  );
}

async function handleCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (!interaction.guildId) throw new Error('디스코드 서버에서만 사용할 수 있습니다.');
  if (sub !== '현황') requireAdmin(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = getGuild(interaction.guildId);

  if (sub === '모집') {
    if (guild.active?.status === 'open') {
      await interaction.editReply(`이미 모집 중입니다. <https://discord.com/channels/${interaction.guildId}/${guild.active.channelId}/${guild.active.messageId}>`);
      return;
    }
    const channel = interaction.channel;
    if (!channel?.isTextBased() || !('send' in channel)) throw new Error('텍스트 채널에서 실행해주세요.');
    const session = makeSession(interaction.guildId, channel.id, randomUUID().slice(0, 12));
    const message = await channel.send(renderBoard(session));
    session.messageId = message.id;
    guild.active = session;
    persist();
    await interaction.editReply(`✅ 까마귀봇 모집판을 만들었습니다! ${message.url}`);
    return;
  }

  const session = activeSession(interaction);
  if (sub === '테스트모드') {
  const enabled = interaction.options.getBoolean('활성화', true);

  session.testMode = enabled;
  persist();

  const note = await safeRefresh(session);

  await interaction.editReply(
    enabled
      ? `🧪 테스트 모드가 활성화되었습니다!\n이제 1~8명이어도 게임 시작이 가능합니다.${note}`
      : `✅ 테스트 모드가 비활성화되었습니다.\n다시 최소 9명이 있어야 게임을 시작할 수 있습니다.${note}`
  );
  return;
}
  if (sub === '현황') {
    const queue = priorityPlayers(session).length;
    const game = isGameRunning(session) ? session.currentIds.length : 0;
    await interaction.editReply(`🐦‍⬛ **까마귀봇**\n${session.round}판 · 게임 중 ${game}명 · 대기 ${queue}명\n<https://discord.com/channels/${session.guildId}/${session.channelId}/${session.messageId}>`);
    return;
  }
  if (sub === '시작' || sub === '다음판') {
    if (sub === '시작' && session.round !== 0) throw new Error('첫 판은 이미 시작했습니다. `/내전 다음판`을 사용해주세요.');
    if (sub === '다음판' && session.round === 0) throw new Error('먼저 `/내전 시작`을 사용해주세요.');
    const selected = nextRound(session);
    persist();
    const note = await safeRefresh(session);
    await interaction.editReply(`🎮 **${session.round}판 시작!** 시청자 ${selected.length}명 게임 중으로 이동했습니다.\n${selected.map((p) => `<@${p.id}>`).join(' · ')}\n게임이 끝나면 「게임 종료」를 눌러주세요.${note}`);
    return;
  }
  if (sub === '게임종료') {
    const finished = finishRound(session);
    persist();
    const note = await safeRefresh(session);
    await interaction.editReply(`🏁 **${session.round}판 종료!** 게임 중이던 ${finished.length}명은 대기열에서 자동 해제되었습니다.\n다시 참가하려면 모집판의 「참가 신청」을 눌러야 합니다. 기존 대기자는 그대로 유지됩니다.${note}`);
    return;
  }
  if (sub === '제외') {
    const user = interaction.options.getUser('유저', true);
    kickPlayer(session, user.id);
    persist();
    const note = await safeRefresh(session);
    await interaction.editReply(`🚫 <@${user.id}>님을 대기열에서 제외했습니다. 기존 판수 기록은 유지됩니다.${note}`);
    return;
  }
  if (sub === '판수변경') {
    const user = interaction.options.getUser('유저', true);
    const amount = interaction.options.getInteger('증감', true);
    const player = adjustMatchesPlayed(session, user.id, amount);
    persist();
    const note = await safeRefresh(session);
    const sign = amount > 0 ? `+${amount}` : `${amount}`;
    await interaction.editReply(`✅ <@${user.id}>님의 참여 판수를 **${sign}판** 조정했습니다. 현재 **${player.matchesPlayed}판**입니다. 대기열 우선순위가 다시 계산되었습니다.${note}`);
    return;
  }
  if (sub === '종료') {
    closeSession(session);
    guild.history ??= [];
    guild.history.push(session);
    guild.history = guild.history.slice(-30);
    guild.active = null;
    persist();
    const note = await safeRefresh(session);
    await interaction.editReply(`✅ 내전 모집 종료! 총 ${session.round}판의 기록을 저장했습니다.${note}`);
  }
}

async function handleButton(interaction) {
  if (!interaction.guildId) throw new Error('서버에서만 사용할 수 있습니다.');
  const [, action, sessionId, targetId, amountString] = interaction.customId.split(':');
  const session = activeSession(interaction);
  requireSessionId(session, sessionId);

  if (action === 'adjust') {
    requireAdmin(interaction);
    const player = adjustMatchesPlayed(session, targetId, Number(amountString));
    persist();
    await interaction.update({
      content: `✅ <@${targetId}> 현재 **${player.matchesPlayed}판**입니다. 아래 버튼으로 계속 조정할 수 있어요.`,
      components: [adjustRow(session.id, targetId)],
      allowedMentions: { parse: [] },
    });
    await safeRefresh(session);
    return;
  }

  // 공개 모집판에 있는 버튼인지 확인한다. 위 조정 버튼은 비공개 메뉴에 있다.
  if (session.messageId !== interaction.message.id) {
    throw new Error('이 모집 게시판은 만료되었습니다. 최신 모집판에서 신청해주세요.');
  }

  if (action === 'remove' || action === 'count') {
    requireAdmin(interaction);
    const queue = priorityPlayers(session);
    await interaction.reply({
      content: `${action === 'remove' ? '🚫 제외' : '➕➖ 판수 변경'}할 참가자를 선택하세요.${queue.length > 25 ? '\n※ 목록은 상위 25명만 표시됩니다. 그 외 유저는 /내전 명령어로 관리하세요.' : ''}`,
      components: [selectionRow(session, action)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (['next', 'finish'].includes(action)) requireAdmin(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (action === 'status') {
    await interaction.editReply(myStatus(session, interaction.user.id));
    return;
  }
  if (action === 'join') {
    const name = interaction.member?.nickname || interaction.user.globalName || interaction.user.username;
    joinSession(session, interaction.user.id, name);
    persist();
    const note = await safeRefresh(session);
    await interaction.editReply(`✅ 참가 신청 완료!\n${myStatus(session, interaction.user.id)}${note}`);
    return;
  }
  if (action === 'leave') {
    leaveSession(session, interaction.user.id);
    persist();
    const note = await safeRefresh(session);
    await interaction.editReply(`✅ 참가 신청을 취소했습니다. 참여 판수는 유지됩니다.${note}`);
    return;
  }
  if (action === 'next') {
    const selected = nextRound(session);
    persist();
    const note = await safeRefresh(session);
    await interaction.editReply(`🎮 **${session.round}판 게임 시작!** 시청자 ${selected.length}명이 게임 중으로 이동했습니다.${note}`);
    return;
  }
  if (action === 'finish') {
    const finished = finishRound(session);
    persist();
    const note = await safeRefresh(session);
    await interaction.editReply(`🏁 **${session.round}판 종료!** 게임 중이던 ${finished.length}명은 대기열에서 제외되었습니다. 다시 참가 신청을 해야 합니다.${note}`);
  }
}

async function handleSelect(interaction) {
  if (!interaction.guildId) throw new Error('서버에서만 사용할 수 있습니다.');
  requireAdmin(interaction);
  const [, action, sessionId] = interaction.customId.split(':');
  const session = activeSession(interaction);
  requireSessionId(session, sessionId);
  const targetId = interaction.values[0];
  const player = priorityPlayers(session).find((p) => p.id === targetId);
  if (!player) throw new Error('현재 대기열에서 선택한 유저를 찾을 수 없습니다.');

  if (action === 'removepick') {
    kickPlayer(session, targetId);
    persist();
    await interaction.update({ content: `🚫 <@${targetId}>님을 대기열에서 제외했습니다.`, components: [], allowedMentions: { parse: [] } });
    await safeRefresh(session);
    return;
  }
  if (action === 'countpick') {
    await interaction.update({
      content: `➕➖ <@${targetId}> · 현재 **${player.matchesPlayed}판**\n원하는 만큼 +1판 / -1판 버튼을 눌러주세요.`,
      components: [adjustRow(session.id, targetId)],
      allowedMentions: { parse: [] },
    });
  }
}

client.once(Events.ClientReady, (ready) => {
  console.log(`🐦‍⬛ 까마귀봇 v2 로그인 완료: ${ready.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  const isCommand = interaction.isChatInputCommand() && interaction.commandName === '내전';
  const isButton = interaction.isButton() && interaction.customId.startsWith('crow:');
  const isSelect = interaction.isStringSelectMenu() && interaction.customId.startsWith('crow:');
  if (!isCommand && !isButton && !isSelect) return;
  try {
    if (isCommand) await handleCommand(interaction);
    else if (isButton) await handleButton(interaction);
    else await handleSelect(interaction);
  } catch (error) {
    console.error('상호작용 오류:', error);
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: `⚠️ ${message}`, components: [] });
      } else if (interaction.replied) {
        await interaction.followUp({ content: `⚠️ ${message}`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `⚠️ ${message}`, flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error('오류 안내 실패:', replyError);
    }
  }
});

await client.login(DISCORD_TOKEN);
