import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention, spoiler, italic, time, hyperlink, EmbedBuilder } from 'discord.js';
import { confirmAction, sendFailure } from './util.js';
import { db, currentSeason, channels, mushiLeagueGuild } from '../globals.js';
import { set, parse, isValid, sub } from 'date-fns';
import { savePredictions, updatePrediction, resetPredictionWinner } from '../features/predictions.js';
import { setScheduledTime } from '../features/schedule.js';

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
    const pairing = await getPairingData(player.id, week, currentSeason.number);

    if (!pairing) {
        await sendFailure(interaction, `Could not find a match for ${userMention(player.id)} on the specified week`);
        return;
    }

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm Schedule';
    const confirmMessage = `${userMention(pairing.leftPlayerSnowflake)} and ${userMention(pairing.rightPlayerSnowflake)}'s game scheduled for ${date}`;
    const cancelMessage = 'Game schedule not changed.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await setScheduledTime(player.id, currentSeason.number, week, date);
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

async function startMatch(interaction) {
    const deferred = !!(await interaction.deferReply());

    let failures = [], prompts = [];

    const player = interaction.options.getMember('player') || interaction.member;
    const extension = interaction.options.getBoolean('extension');
    let opponent = interaction.options.getMember('opponent');

    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;
    const pairing = await getPairingData(player.user.id, week, currentSeason.number);
    if (!opponent && pairing) {
        const opponentSnowflake = pairing.leftPlayerSnowflake === player.user.id
            ? pairing.rightPlayerSnowflake
            : pairing.leftPlayerSnowflake;

        opponent = await mushiLeagueGuild.members.fetch(opponentSnowflake);
    }
    const eitherPlayerIsOwner = player.roles.cache.has(process.env.ownerRoleId) || opponent?.roles.cache.has(process.env.ownerRoleId);

    if (!opponent) {
        failures.push("Opponent not found. This doesn't seem to be a mushi league match? use the opponent option to specify.");
    }
    if (player.roles.cache.has(process.env.currentlyPlayingRoleId)) {
        failures.push(`/match start has already been used on ${player.user}!`);
    }
    if (!pairing) {
        prompts.push("This doesn't appear to be a mushi league match, so I didn't save off predictions.");
    }
    if (eitherPlayerIsOwner) {
        prompts.push('One of the players in this match is a server admin, so neither player can be blocked from #live-matches');
    }

    if (sendFailure(interaction, failures, deferred)) return;

    const confirmLabel = 'Confirm Start Match';
    const confirmMessage = `Match begun between ${player.user} and ${opponent.user}.`.concat(
        eitherPlayerIsOwner ? '\nOne of the players in this match is a server admin, so neither player can be blocked from #live-matches.' : ''
    );
    const cancelMessage = 'No match begun.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage, false, deferred)) {
        if (!eitherPlayerIsOwner) {
            await player.roles.add(process.env.currentlyPlayingRoleId);
            await opponent.roles.add(process.env.currentlyPlayingRoleId);
        }

        if (pairing) {
            await savePredictions(pairing.id, pairing.leftPlayerId, pairing.leftEmoji, pairing.rightPlayerId, pairing.rightEmoji, pairing.predictions_message);
        }
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
    const pairing = await getPairingData(player.id, week, currentSeason.number);

    if (!player.roles.cache.has(process.env.currentlyPlayingRoleId)) {
        failures.push("You're not barred from #live-matches! Link it yourself, you bum.");
    }

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm Link Game';
    const confirmMessage = 'Game linked in #live-matches';
    const cancelMessage = 'Game not linked';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        const linkMessage = gameLink.concat(
            ` ${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(pairing.rightPlayerSnowflake)}`,
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
        await updatePrediction(pairing.predictions_message, pairing.matchupPrediction, false, false, leftPlayer === winnerData);
        await setScheduledTime(winner.id, currentSeason.number, week, 'DONE');
        await notifyOwnersIfAllMatchesDone(week);
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

        await notifyOwnersIfAllMatchesDone(week);
        await updatePrediction(pairing.predictions_message, pairing.matchupPrediction, true, false, leftPlayer === winnerData);
        await setScheduledTime(winner.id, currentSeason.number, week, 'DONE');
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

        await notifyOwnersIfAllMatchesDone(week);
        await updatePrediction(pairing.predictions_message, pairing.matchupPrediction, false, true);
        await setScheduledTime(player.id, currentSeason.number, week, 'DONE');
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
        await db.run('UPDATE pairing SET game1 = NULL, game2 = NULL, game3 = NULL, game4 = NULL, game5 = NULL, winner = NULL, dead = NULL WHERE id = ?', pairing.id);

        await resetPredictionWinner(pairing.predictions_message, pairing.matchupPrediction, pairing.winner === pairing.left_player,
            pairing.dead, leftPlayer.discord_snowflake, rightPlayer.discord_snowflake);
        await setScheduledTime(player.id, currentSeason.number, week, '');
    }
}

async function getPairingData(playerSnowflake, week, season) {
    const pairingQuery = 'SELECT pairing.id, pairing.predictions_message, leftPlayer.id AS leftPlayerId, leftPlayer.discord_snowflake AS leftPlayerSnowflake, leftTeam.emoji AS leftEmoji, \
                          rightPlayer.id AS rightPlayerId, rightPlayer.discord_snowflake AS rightPlayerSnowflake, rightTeam.emoji AS rightEmoji FROM pairing \
                          INNER JOIN player AS leftPlayer ON leftPlayer.id = pairing.left_player \
                          INNER JOIN team AS leftTeam ON leftTeam.id = leftPlayer.team \
                          INNER JOIN player AS rightPlayer ON rightPlayer.id = pairing.right_player \
                          INNER JOIN team AS rightTeam ON rightTeam.id = rightPlayer.team \
                          INNER JOIN matchup ON matchup.id = pairing.matchup \
                          INNER JOIN week ON week.id = matchup.week \
                          WHERE (rightPlayer.discord_snowflake = ? OR leftPlayer.discord_snowflake = ?) \
                              AND week.number = ? AND week.season = ?';

    return await db.get(pairingQuery, playerSnowflake, playerSnowflake, week, season);
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

async function notifyOwnersIfAllMatchesDone(week) {
    if ((await getOpenPairings(currentSeason.number, week)).length === 0) {
        const captainChannel = await channels.fetch(process.env.captainChannelId);
        await captainChannel.send({
            content: `${roleMention(process.env.ownerRoleId)} all matches are in -- run /season calculate_standings when you've confirmed.`,
            allowedMentions: { parse: ['roles'] }
        })
    }
}