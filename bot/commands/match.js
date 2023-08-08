import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention, spoiler, italic, time, hyperlink, EmbedBuilder } from 'discord.js';
import { confirmAction, sendFailure } from './util.js';
import { db, currentSeason, channels, mushiLeagueGuild } from '../globals.js';
import { set, parse, isValid, sub } from 'date-fns';

export const MATCH_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('updates the status of a pairing')
        .addSubcommand(subcommand =>
            subcommand
                .setName('schedule')
                .setDescription('Set the scheduled time for a match')
                .addStringOption(option =>
                    option
                        .setName('time')
                        .setDescription('the scheduled time. Accepted formats: [Tuesday 11:00 PM], [Sunday 1 PM], [Wednesday 21:30]')
                        .setRequired(true))
                .addNumberOption(option =>
                    option
                        .setName('timezone')
                        .setDescription('the timezone as a pure GMT number (e.g. +5.5, -4)')
                        .setMinValue(-12)
                        .setMaxValue(13))
                .addBooleanOption(option =>
                    option
                        .setName('inexact')
                        .setDescription('whether the time is inexact'))
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('name of either player in the bo3, defaults to yourself'))
                .addBooleanOption(option =>
                    option
                        .setName('extension')
                        .setDescription('whether this is an extension match')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('when players have begun their bo3 (locks them out of live-matches until /match report)')
                .addUserOption(option => 
                    option
                        .setName('player')
                        .setDescription('name of either player in the bo3, defaults to yourself'))
                .addUserOption(option =>
                    option
                        .setName('opponent')
                        .setDescription('name of the other player in the bo3, can default in mushi league opps'))
                .addBooleanOption(option =>
                    option
                        .setName('extension')
                        .setDescription('whether this is an extension match')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('link')
                .setDescription('links a game in live-matches')
                .addStringOption(option =>
                    option
                        .setName('game_link')
                        .setDescription('url of game to link')
                        .setRequired(true))
                .addNumberOption(option =>
                    option
                        .setName('number')
                        .setDescription('which game in the set this is'))
                .addBooleanOption(option =>
                    option
                        .setName('ping')
                        .setDescription('whether to ping @spectator'))
                .addBooleanOption(option =>
                    option
                        .setName('extension')
                        .setDescription('whether this is an extension match')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('report')
                .setDescription('Reports the completion of a series')
                .addUserOption(option =>
                    option
                        .setName('winner')
                        .setDescription('Player who won the match')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('game1')
                        .setDescription('replay link for g1')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('game2')
                        .setDescription('replay link for g2')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('game3')
                        .setDescription('replay link for g3'))
                .addStringOption(option =>
                    option
                        .setName('game4')
                        .setDescription('replay link for the rare g4'))
                .addStringOption(option =>
                    option
                        .setName('game5')
                        .setDescription('replay link for g5, which has never happened to my knowledge'))
                .addBooleanOption(option => 
                    option
                        .setName('extension')
                        .setDescription('Whether this is an extension from last week')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('act')
                .setDescription('Awards an activity win')
                .addUserOption(option =>
                    option
                        .setName('winner')
                        .setDescription('Player to give act win')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option
                        .setName('extension')
                        .setDescription('Whether this is an extension from last week')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('dead')
                .setDescription('Marks a game dead')
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('One of the players in the dead pairing')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option
                        .setName('extension')
                        .setDescription('Whether this is an extension from last week')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('undo')
                .setDescription('undoes a match decision')
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('one of the players in the pairing to undo')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option
                        .setName('extension')
                        .setDescription('whether this is an extension from last week'))),

    async execute(interaction) {
        const userIsMod = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

        switch (interaction.options.getSubcommand()) {
            case 'schedule':
                await scheduleMatch(interaction);
                break;
            case 'start':
                await startMatch(interaction);
                break;
            case 'link':
                await linkMatch(interaction);
                break;
            case 'report':
                await reportMatch(interaction, userIsMod);
                break;
            case 'act':
                await awardActWin(interaction, userIsMod);
                break;
            case 'dead':
                await markDeadGame(interaction, userIsMod);
                break;
            case 'undo':
                await undoReport(interaction, userIsMod);
                break;
        }
    }
}

async function scheduleMatch(interaction) {
    let failures = [], prompts = [];

    const dateString = interaction.options.getString('time');
    const inexact = interaction.options.getBoolean('inexact');
    const timezone = interaction.options.getNumber('timezone');
    let date = dateString;

    if (!inexact && timezone == null) {
        await sendFailure(interaction, 'You either need to specify that the time is inexact, or give a timezone');
        return;
    }

    if (!inexact) {
        const localDate = parseDateInput(dateString);

        if (!localDate) {
            await sendFailure(interaction, "Couldn't parse the date string. Please either specify that it's inexact, or pass it in formatted like [Sunday 4:00 PM], [Sunday 4 PM], or [Sunday 16:00]");
            return;
        }

        const botTimezone = localDate.getTimezoneOffset() / -60;
        date = time(sub(localDate, { hours: timezone - botTimezone }));
    }

    const player = interaction.options.getUser('player') || interaction.user;
    const extension = interaction.options.getBoolean('extension');
    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;
    const opponent = await mushiLeagueGuild.members.fetch(await getOpponent(player.id, week));

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm Schedule';
    const confirmMessage = `${player} and ${opponent.user}'s game scheduled for ${date}`;
    const cancelMessage = 'Game schedule not changed.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await setScheduledTime(player, week, date);
    }
}

function parseDateInput(dateString) {
    const allowedInputs = [
        'iiii hh:mm a',
        'iiii hh a',
        'iiii HH:mm',
    ];

    const referenceDate = set(new Date(), { minutes: 0 });

    for (const format of allowedInputs) {
        const attempt = parse(dateString, format, referenceDate);
        if (isValid(attempt)) {
            return attempt;
        }
    }

    return false;
}

async function setScheduledTime(player, week, newValue) {
    const mainRoom = await channels.fetch(process.env.mainRoomId);
    const scheduleMessageId = await getScheduleMessage(currentSeason.number, week, player.id);
    const scheduleMessage = await mainRoom.messages.fetch({ message: scheduleMessageId, force: true });
    const newScheduleMessage = scheduleMessage.content.replace(RegExp(`^(.*${player.id}.*>:).*$`, 'm'), `$1 ${newValue}`);
    await scheduleMessage.edit(newScheduleMessage);
}

async function getScheduleMessage(season, week, playerId) {
    const scheduleMessageQuery =
        'SELECT schedule_message FROM matchup \
         INNER JOIN week ON matchup.week = week.id \
         WHERE week.season = ? AND week.number = ? AND matchup.left_team = (SELECT team FROM player WHERE player.discord_snowflake = ?) \
         UNION \
         SELECT schedule_message FROM matchup \
         INNER JOIN week ON matchup.week = week.id \
         WHERE week.season = ? AND week.number = ? AND matchup.right_team = (SELECT team FROM player WHERE player.discord_snowflake = ?)';

    return (await db.get(scheduleMessageQuery, season, week, playerId, season, week, playerId)).schedule_message;
}

async function startMatch(interaction) {
    let failures = [], prompts = [];

    const currentlyPlayingRole = process.env.currentlyPlayingRoleId;
    const player = interaction.options.getMember('player') || interaction.member;
    const extension = interaction.options.getBoolean('extension');
    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;
    const opponent = interaction.options.getMember('opponent') || await mushiLeagueGuild.members.fetch(await getOpponent(player.user.id, week));

    if (!opponent) {
        failures.push("Opponent not found. This doesn't seem to be a mushi league match? use the opponent option to specify.");
    }

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm Start Match';
    const confirmMessage = `${player.user} and ${opponent.user} given the currently playing role.`;
    const cancelMessage = 'Nobody given the currently playing role.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await player.roles.add(currentlyPlayingRole);
        await opponent.roles.add(currentlyPlayingRole);
    }
}

async function linkMatch(interaction) {
    let failures = [], prompts = [];

    const gameLink = interaction.options.getString('game_link');
    const ping = interaction.options.getBoolean('ping');
    const number = interaction.options.getNumber('number');
    const player = interaction.member;
    const extension = interaction.options.getBoolean('extension');
    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;
    const opponent = await getOpponent(player.user.id, week);

    if (!player.roles.cache.has(process.env.currentlyPlayingRoleId)) {
        failures.push("You're not barred from #live-matches! Link it yourself, you bum.");
    }

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm Link Game';
    const confirmMessage = 'Game linked in #live-matches';
    const cancelMessage = 'Game not linked';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        const linkMessage = gameLink.concat(
            ` ${player.user} vs ${userMention(opponent)}`,
            number ? ` game ${number}` : '',
            ping ? ` ${roleMention(process.env.spectatorRoleId)}` : ''
        );

        const liveMatchesChannel = await channels.fetch(process.env.liveMatchesChannelId);
        await liveMatchesChannel.send({
            content: linkMessage,
            allowedMentions: { parse: ['roles'] }
        });
    }
}

async function reportMatch(interaction) {
    const winner = interaction.options.getUser('winner');
    const games = [
        interaction.options.getString('game1'),
        interaction.options.getString('game2'),
        interaction.options.getString('game3'),
        interaction.options.getString('game4'),
        interaction.options.getString('game5')
    ].filter(game => !!game);
    const extension = interaction.options.getBoolean('extension');
    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;

    const pairingQuery = 'SELECT pairing.id, pairing.slot, pairing.left_player, pairing.right_player, pairing.winner, pairing.dead, pairing.predictions_message, matchup.predictions_message AS matchupPrediction FROM pairing \
                          INNER JOIN matchup ON pairing.matchup = matchup.id \
                          INNER JOIN week ON matchup.week = week.id \
                          WHERE week.season = ? AND week.number = ? AND \
                            (pairing.left_player = (SELECT id FROM player WHERE discord_snowflake = ?) OR \
                             pairing.right_player = (SELECT id FROM player WHERE discord_snowflake = ?))'
    const pairing = await db.get(pairingQuery, currentSeason.number, week, winner.id, winner.id);

    const playersQuery = 'SELECT player.id, player.discord_snowflake, team.discord_snowflake AS teamSnowflake FROM player \
                          INNER JOIN team ON player.team = team.id \
                          WHERE (player.id = ? OR player.id = ?)';
    const players = await db.all(playersQuery, pairing.left_player, pairing.right_player);

    const winnerData = players.find(p => p.discord_snowflake === winner.id);
    const loserData = players.find(p => p.discord_snowflake !== winner.id);
    const leftPlayer = (winnerData.id === pairing.left_player) ? winnerData : loserData;
    const rightPlayer = (winnerData.id === pairing.left_player) ? loserData : winnerData;

    let failures = [];
    let prompts = [];

    if (pairing.winner || pairing.dead) {
        failures.push(`${winner} vs ${userMention(loserData.discord_snowflake)} already has a result reported. Use /match undo first.`);
    }
    if (games.length === 2) {
        prompts.push("Only 2 games reported. If this series wasn't a 2-0, make sure to use the optional parameters for the other games.");
    }

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm match report';
    const confirmMessage = `${winner} defeated ${userMention(loserData.discord_snowflake)} in slot ${pairing.slot}.`;
    const cancelMessage = 'No match reported.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run(`UPDATE pairing SET winner = ?, game1 = ?, game2 = ?, game3 = ?, game4 = ?, game5 = ?, dead = NULL WHERE id = ?`, winnerData.id, games[0], games[1], games.at(2), games.at(3), games.at(4), pairing.id);

        await postReplays(leftPlayer, rightPlayer, winnerData, extension, games);
        await removePlayingRole(leftPlayer, rightPlayer);
        await updatePredictions(pairing, false, leftPlayer === winnerData);
        await setScheduledTime(player1.user, week, 'DONE');
        await notifyOwnersIfAllMatchesDone();
    }
}

async function postReplays(leftPlayer, rightPlayer, winnerData, extension, games) {
    const matchReportChannel = await channels.fetch(process.env.matchReportChannelId);
    await matchReportChannel.send({
        embeds: [makeReplayEmbed(leftPlayer, rightPlayer, winnerData, extension, games)],
        allowedMentions: { parse: [] }
    });
}

function makeReplayPlaintext(leftPlayer, rightPlayer, winnerData, extension, games) {
    const leftPlayerText = `(${roleMention(leftPlayer.teamSnowflake)}) ${userMention(leftPlayer.discord_snowflake)}`;
    const rightPlayerText = `${userMention(rightPlayer.discord_snowflake)} (${roleMention(rightPlayer.teamSnowflake)})`;
    const winnerText = leftPlayer === winnerData
        ? spoiler('>')
        : spoiler('<');
    const matchReportHeader = `${leftPlayerText} ${winnerText} ${rightPlayerText}\n`;
    const extensionMessage = extension ? italic('\n(Extension from last week)') : '';

    let links = [];

    for (let i = 0; i < Math.max(games.length, 3); i++) {
        links.push(hyperlink(`game ${i + 1}`, games.at(i) || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    }

    return matchReportHeader.concat(links.join('\n'), extensionMessage);
}

function makeReplayEmbed(leftPlayer, rightPlayer, winnerData, extension, games) {
    let gameFields = [];

    for (let i = 0; i < Math.max(games.length, 3); i++) {
        gameFields.push({ name: `game ${i + 1}`, value: hyperlink('link', games.at(i) || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'), inline: true });
    }

    const leftPlayerText = `(${roleMention(leftPlayer.teamSnowflake)}) ${userMention(leftPlayer.discord_snowflake)}`;
    const rightPlayerText = `${userMention(rightPlayer.discord_snowflake)} (${roleMention(rightPlayer.teamSnowflake)})`;
    const winnerText = (leftPlayer === winnerData)
        ? spoiler('>')
        : spoiler('<');
    const extensionMessage = extension ? italic('\n(Extension from last week)') : '';

    return new EmbedBuilder()
        .setDescription(`${leftPlayerText} ${winnerText} ${rightPlayerText}${extensionMessage}`)
        .addFields(...gameFields);
}

async function removePlayingRole(leftPlayer, rightPlayer) {
    const currentlyPlayingRole = process.env.currentlyPlayingRoleId;

    const player1 = await mushiLeagueGuild.members.fetch(leftPlayer.discord_snowflake);
    const player2 = await mushiLeagueGuild.members.fetch(rightPlayer.discord_snowflake);

    await player1.roles.remove(currentlyPlayingRole);
    await player2.roles.remove(currentlyPlayingRole);
}

async function awardActWin(interaction, userIsMod) {
    if (!userIsMod) {
        sendFailure(interaction, "Only mods can use this command");
    }

    const winner = interaction.options.getUser('winner');
    const extension = interaction.options.getBoolean('extension');
    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;

    const pairingQuery = 'SELECT pairing.id, pairing.slot, pairing.left_player, pairing.right_player, pairing.winner, pairing.dead, pairing.predictions_message, matchup.predictions_message AS matchupPrediction FROM pairing \
                          INNER JOIN matchup ON pairing.matchup = matchup.id \
                          INNER JOIN week ON matchup.week = week.id \
                          WHERE week.season = ? AND week.number = ? AND \
                            (pairing.left_player = (SELECT id FROM player WHERE discord_snowflake = ?) OR \
                             pairing.right_player = (SELECT id FROM player WHERE discord_snowflake = ?))'
    const pairing = await db.get(pairingQuery, currentSeason.number, week, winner.id, winner.id);

    const playersQuery = 'SELECT player.id, player.discord_snowflake, team.discord_snowflake AS teamSnowflake FROM player \
                          INNER JOIN team ON player.team = team.id \
                          WHERE (player.id = ? OR player.id = ?)';
    const players = await db.all(playersQuery, pairing.left_player, pairing.right_player);

    const winnerData = players.find(p => p.discord_snowflake === winner.id);
    const loserData = players.find(p => p.discord_snowflake !== winner.id);
    const leftPlayer = (winnerData.id === pairing.left_player) ? winnerData : loserData;
    const rightPlayer = (winnerData.id === pairing.left_player) ? loserData : winnerData;

    let failures = [];
    let prompts = [];

    if (pairing.winner || pairing.dead) {
        failures.push(`${winner} vs ${userMention(loserData.discord_snowflake)} already has a result reported. Use /match undo first.`);
    }

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm activity win';
    const confirmMessage = `${winner} granted win over ${userMention(loserData.discord_snowflake)} in slot ${pairing.slot}.`;
    const cancelMessage = 'No activity win granted.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run(`UPDATE pairing SET winner = ?, game1 = NULL, game2 = NULL, game3 = NULL, game4 = NULL, game5 = NULL, dead = NULL WHERE id = ?`, winnerData.id, pairing.id);

        const leftPlayerText = `(${roleMention(leftPlayer.teamSnowflake)}) ${userMention(leftPlayer.discord_snowflake)}`;
        const rightPlayerText = `${userMention(rightPlayer.discord_snowflake)} (${roleMention(rightPlayer.teamSnowflake)})`;
        const winnerText = leftPlayer === winnerData ? '>' : '<';
        const extensionMessage = extension ? italic('\n(Extension from last week)') : '';
        const matchReportMessage = `${leftPlayerText} ${winnerText} ${rightPlayerText} on activity${extensionMessage}`;

        const matchReportChannel = await channels.fetch(process.env.matchReportChannelId);
        await matchReportChannel.send({
            content: matchReportMessage,
            allowedMentions: { parse: [] }
        });

        await notifyOwnersIfAllMatchesDone();
        await updatePredictions(pairing, false, leftPlayer === winnerData);
    }
}

async function markDeadGame(interaction, userIsMod) {
    if (!userIsMod) {
        sendFailure(interaction, "Only mods can use this command");
    }

    const player = interaction.options.getUser('player');
    const extension = interaction.options.getBoolean('extension');
    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;

    const pairingQuery = 'SELECT pairing.id, pairing.slot, pairing.left_player, pairing.right_player, pairing.winner, pairing.dead, pairing.predictions_message, matchup.predictions_message AS matchupPrediction FROM pairing \
                          INNER JOIN matchup ON pairing.matchup = matchup.id \
                          INNER JOIN week ON matchup.week = week.id \
                          WHERE week.season = ? AND week.number = ? AND \
                            (pairing.left_player = (SELECT id FROM player WHERE discord_snowflake = ?) OR \
                             pairing.right_player = (SELECT id FROM player WHERE discord_snowflake = ?))'
    const pairing = await db.get(pairingQuery, currentSeason.number, week, player.id, player.id);

    const playersQuery = 'SELECT player.id, player.discord_snowflake, team.discord_snowflake AS teamSnowflake FROM player \
                          INNER JOIN team ON player.team = team.id \
                          WHERE (player.id = ? OR player.id = ?)';
    const players = await db.all(playersQuery, pairing.left_player, pairing.right_player);

    const leftPlayer = players.find(p => p.id === pairing.left_player);
    const rightPlayer = players.find(p => p.id === pairing.right_player);

    let failures = [];
    let prompts = [];

    if (pairing.winner || pairing.dead) {
        failures.push(`${userMention(leftPlayer.discord_snowflake)} vs ${userMention(rightPlayer.discord_snowflake)} already has a result reported. Use /match undo first.`);
    }

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm dead game';
    const confirmMessage = `${userMention(leftPlayer.discord_snowflake)} vs ${userMention(rightPlayer.discord_snowflake)} declared dead in slot ${pairing.slot}.`;
    const cancelMessage = 'Game not marked dead.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run(`UPDATE pairing SET winner = NULL, game1 = NULL, game2 = NULL, game3 = NULL, game4 = NULL, game5 = NULL, dead = 1 WHERE id = ?`, pairing.id);

        const leftPlayerText = `(${roleMention(leftPlayer.teamSnowflake)}) ${userMention(leftPlayer.discord_snowflake)}`;
        const rightPlayerText = `${userMention(rightPlayer.discord_snowflake)} (${roleMention(rightPlayer.teamSnowflake)})`;
        const extensionMessage = extension ? italic('\n(Extension from last week)') : '';
        const matchReportMessage = `${leftPlayerText} vs ${rightPlayerText} marked dead${extensionMessage}`;

        const matchReportChannel = await channels.fetch(process.env.matchReportChannelId);
        await matchReportChannel.send({
            content: matchReportMessage,
            allowedMentions: { parse: [] }
        });

        await notifyOwnersIfAllMatchesDone();
        await updatePredictions(pairing, true);
    }
}

async function undoReport(interaction, userIsMod) {
    if (!userIsMod) {
        sendFailure(interaction, "Only mods can use this command");
    }

    const player = interaction.options.getUser('player');
    const extension = interaction.options.getBoolean('extension');
    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;

    const pairingQuery = 'SELECT pairing.id, pairing.slot, pairing.left_player, pairing.right_player, pairing.winner, pairing.dead, pairing.predictions_message, matchup.predictions_message AS matchupPrediction FROM pairing \
                          INNER JOIN matchup ON pairing.matchup = matchup.id \
                          INNER JOIN week ON matchup.week = week.id \
                          WHERE week.season = ? AND week.number = ? AND \
                            (pairing.left_player = (SELECT id FROM player WHERE discord_snowflake = ?) OR \
                             pairing.right_player = (SELECT id FROM player WHERE discord_snowflake = ?))'
    const pairing = await db.get(pairingQuery, currentSeason.number, week, player.id, player.id);

    const playersQuery = 'SELECT player.id, player.discord_snowflake, team.discord_snowflake AS teamSnowflake FROM player \
                          INNER JOIN team ON player.team = team.id \
                          WHERE (player.id = ? OR player.id = ?)';
    const players = await db.all(playersQuery, pairing.left_player, pairing.right_player);

    const leftPlayer = players.find(p => p.id === pairing.left_player);
    const rightPlayer = players.find(p => p.id === pairing.right_player);

    let failures = [];
    let prompts = [];

    if (!pairing.winner && !pairing.dead) {
        failures.push('Nothing to undo');
    }

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm undo report';
    const confirmMessage = `${userMention(leftPlayer.discord_snowflake)} vs ${userMention(rightPlayer.discord_snowflake)} result undone.`;
    const cancelMessage = 'Result not undone.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run('UPDATE pairing SET winner = NULL, dead = NULL WHERE id = ?', pairing.id);

        await resetPredictions(pairing, leftPlayer.discord_snowflake, rightPlayer.discord_snowflake);
        await setScheduledTime(player, week, '');
    }
}

async function getOpponent(playerSnowflake, week) {
    const opponentQuery = 'SELECT pairing.id, player.discord_snowflake FROM pairing \
                               INNER JOIN player ON player.id = pairing.left_player \
                               INNER JOIN matchup ON matchup.id = pairing.matchup \
                               INNER JOIN week ON week.id = matchup.week \
                               WHERE pairing.right_player = (SELECT id FROM player WHERE discord_snowflake = ?) \
                                    AND week.number = ? AND week.season = ? \
                               UNION \
                               SELECT pairing.id, player.discord_snowflake FROM pairing \
                               INNER JOIN player ON player.id = pairing.right_player \
                               INNER JOIN matchup ON matchup.id = pairing.matchup \
                               INNER JOIN week ON week.id = matchup.week \
                               WHERE pairing.left_player = (SELECT id FROM player WHERE discord_snowflake = ?) \
                                    AND week.number = ? AND week.season = ?';

    return (await db.get(opponentQuery, playerSnowflake, week, currentSeason.number, playerSnowflake, week, currentSeason.number))?.discord_snowflake;
}

export async function getOpenPairings(season, week) {
    const openPairingsQuery =
        'SELECT leftPlayer.discord_snowflake AS leftPlayerSnowflake, leftTeam.discord_snowflake AS leftTeamSnowflake, \
                rightPlayer.discord_snowflake AS rightPlayerSnowflake, rightTeam.discord_snowflake AS rightTeamSnowflake, pairing.matchup FROM pairing \
         INNER JOIN player AS leftPlayer ON leftPlayer.id = pairing.left_player \
         INNER JOIN player AS rightPlayer ON rightPlayer.id = pairing.right_player \
         INNER JOIN team AS leftTeam ON leftTeam.id = leftPlayer.team \
         INNER JOIN team AS rightTeam ON rightTeam.id = rightPlayer.team \
         INNER JOIN matchup ON matchup.id = pairing.matchup \
         INNER JOIN week ON week.id = matchup.week \
         WHERE pairing.winner IS NULL AND pairing.dead IS NULL AND week.season = ? AND week.number = ?';
    return await db.all(openPairingsQuery, season, week);
}

async function notifyOwnersIfAllMatchesDone() {
    if ((await getOpenPairings(currentSeason.number, currentSeason.current_week)).length === 0) {
        const captainChannel = await channels.fetch(process.env.captainChannelId);
        await captainChannel.send({
            content: `${roleMention(process.env.ownerRoleId)} all matches are in -- run /season calculate_standings when you've confirmed.`,
            allowedMentions: { parse: ['roles'] }
        })
    }
}

async function updatePredictions(pairing, dead, winnerOnLeft) {
    const predictionsRoom = await channels.fetch(process.env.predictionsChannelId);
    const predictionsMessage = await predictionsRoom.messages.fetch({ message: pairing.predictions_message, force: true });

    if (dead) {
        const newPredictionContent = predictionsMessage.content.replace('vs', '\u{1f480}');
        await predictionsMessage.edit(newPredictionContent);
    }
    else {
        const newPredictionContent = winnerOnLeft
            ? `\u{1F1FC} ${predictionsMessage.content} \u{1F1F1}`
            : `\u{1F1F1} ${predictionsMessage.content} \u{1F1FC}`;
        await predictionsMessage.edit(newPredictionContent);

        const matchupPredictionsMessage = await predictionsRoom.messages.fetch({ message: pairing.matchupPrediction, force: true });
        const score = matchupPredictionsMessage.content.substring(matchupPredictionsMessage.content.length - 3, matchupPredictionsMessage.content.length);
        const newScore = winnerOnLeft
            ? ''.concat(parseInt(score.charAt(0)) + 1, score.substring(1))
            : score.substring(0, 2).concat(parseInt(score.charAt(2)) + 1);
        const newMatchupPredictionsContent = matchupPredictionsMessage.content.substring(0, matchupPredictionsMessage.content.length - 3).concat(newScore);
        await matchupPredictionsMessage.edit(newMatchupPredictionsContent);
    }
}

async function resetPredictions(pairing, leftPlayerSnowflake, rightPlayerSnowflake) {
    const predictionsRoom = await channels.fetch(process.env.predictionsChannelId);
    const predictionsMessage = await predictionsRoom.messages.fetch({ message: pairing.predictions_message, force: true });
    const newPredictionsContent = `${userMention(leftPlayerSnowflake)} vs ${userMention(rightPlayerSnowflake)}`;
    await predictionsMessage.edit(newPredictionsContent);

    if (!pairing.dead) {
        const matchupPredictionsMessage = await predictionsRoom.messages.fetch({ message: pairing.matchupPrediction, force: true });
        const score = matchupPredictionsMessage.content.substring(matchupPredictionsMessage.content.length - 3, matchupPredictionsMessage.content.length);
        const newScore = (pairing.winner === pairing.left_player)
            ? ''.concat(parseInt(score.charAt(0)) - 1, score.substring(1))
            : score.substring(0, 2).concat(parseInt(score.charAt(2)) - 1);
        const newMatchupPredictionsContent = matchupPredictionsMessage.content.substring(0, matchupPredictionsMessage.content.length - 3).concat(newScore);
        await matchupPredictionsMessage.edit(newMatchupPredictionsContent);
    }
}