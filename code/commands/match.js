import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention, spoiler } from 'discord.js';
import { confirmAction, sendFailure, addModOverrideableFailure } from './util.js';
import { db, currentSeason, channels, mushiLeagueGuild } from '../globals.js';

export const MATCH_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('updates the status of a pairing')
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
                        .setDescription('name of the other player in the bo3, can default in mushi league opps')))
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
                        .setDescription('whether to ping @spectator')))
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
                        .setDescription('Whether this is an extension from last week'))),

    async execute(interaction) {
        const userIsMod = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

        switch (interaction.options.getSubcommand()) {
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
        }
    }
}

async function startMatch(interaction) {
    let failures = [], prompts = [];

    const currentlyPlayingRole = process.env.currentlyPlayingRoleId;
    const player = interaction.options.getMember('player') || interaction.member;
    const opponent = interaction.options.getMember('opponent') || await getOpponent(player.user.id);

    if (!opponent) {
        failures.push("Opponent not found. This doesn't seem to be a mushi league match? use the opponent option to specify.");
    }

    if (sendFailure(failures)) return;

    const confirmLabel = 'Confirm Start Match';
    const confirmMessage = `${player.user} and ${userMention(opponent)} given the currently playing role.`;
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
    const opponent = getOpponent(player.user.id);

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

async function reportMatch(interaction, userIsMod) {
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

    const pairingQuery = 'SELECT pairing.id, pairing.slot, pairing.left_player, pairing.right_player, pairing.winner, pairing.dead FROM pairing \
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
        addModOverrideableFailure(userIsMod, failures, prompts, `${winner} vs ${userMention(loserData.discord_snowflake)} already has a result reported.`);
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

        const leftPlayerText = `(${roleMention(leftPlayer.teamSnowflake)}) ${userMention(leftPlayer.discord_snowflake)}`;
        const rightPlayerText = `${userMention(rightPlayer.discord_snowflake)} (${roleMention(rightPlayer.teamSnowflake)})`;
        const winnerText = leftPlayer === winnerData
            ? spoiler('>')
            : spoiler('<');
        const matchReportHeader = `${leftPlayerText} ${winnerText} ${rightPlayerText}`;
        const matchReportMessage = matchReportHeader.concat('\n', games.join('\n'));

        const matchReportChannel = await channels.fetch(process.env.matchReportChannelId);
        await matchReportChannel.send({
            content: matchReportMessage,
            allowedMentions: { parse: [] }
        });

        const currentlyPlayingRole = process.env.currentlyPlayingRoleId;

        const player1 = await mushiLeagueGuild.members.fetch(leftPlayer.discord_snowflake);
        const player2 = await mushiLeagueGuild.members.fetch(rightPlayer.discord_snowflake);

        await player1.roles.remove(currentlyPlayingRole);
        await player2.roles.remove(currentlyPlayingRole);

        await notifyOwnersIfAllMatchesDone();
    }
}

async function awardActWin(interaction, userIsMod) {
    if (!userIsMod) {
        sendFailure(interaction, "Only mods can use this command");
    }

    const winner = interaction.options.getUser('winner');
    const extension = interaction.options.getBoolean('extension');
    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;

    const pairingQuery = 'SELECT pairing.id, pairing.slot, pairing.left_player, pairing.right_player, pairing.winner, pairing.dead FROM pairing \
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
        addModOverrideableFailure(userIsMod, failures, prompts, `${winner} vs ${userMention(loserData.discord_snowflake)} already has a result reported.`);
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
        const matchReportMessage = `${leftPlayerText} ${winnerText} ${rightPlayerText} on activity`;

        const matchReportChannel = await channels.fetch(process.env.matchReportChannelId);
        await matchReportChannel.send({
            content: matchReportMessage,
            allowedMentions: { parse: [] }
        });

        await notifyOwnersIfAllMatchesDone();
    }
}

async function markDeadGame(interaction, userIsMod) {
    if (!userIsMod) {
        sendFailure(interaction, "Only mods can use this command");
    }

    const player = interaction.options.getUser('player');
    const extension = interaction.options.getBoolean('extension');
    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;

    const pairingQuery = 'SELECT pairing.id, pairing.slot, pairing.left_player, pairing.right_player, pairing.winner, pairing.dead FROM pairing \
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
        addModOverrideableFailure(userIsMod, failures, prompts, `${userMention(leftPlayer.discord_snowflake)} vs ${userMention(rightPlayer.discord_snowflake)} already has a result reported.`);
    }

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm dead game';
    const confirmMessage = `${userMention(leftPlayer.discord_snowflake)} vs ${userMention(rightPlayer.discord_snowflake)} declared dead in slot ${pairing.slot}.`;
    const cancelMessage = 'Game not marked dead.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run(`UPDATE pairing SET winner = NULL, game1 = NULL, game2 = NULL, game3 = NULL, game4 = NULL, game5 = NULL, dead = 1 WHERE id = ?`, pairing.id);

        const leftPlayerText = `(${roleMention(leftPlayer.teamSnowflake)}) ${userMention(leftPlayer.discord_snowflake)}`;
        const rightPlayerText = `${userMention(rightPlayer.discord_snowflake)} (${roleMention(rightPlayer.teamSnowflake)})`;
        const matchReportMessage = `${leftPlayerText} vs ${rightPlayerText} marked dead`;

        const matchReportChannel = await channels.fetch(process.env.matchReportChannelId);
        await matchReportChannel.send({
            content: matchReportMessage,
            allowedMentions: { parse: [] }
        });

        await notifyOwnersIfAllMatchesDone();
    }
}

async function getOpponent(playerSnowflake) {
    const opponentQuery = 'SELECT pairing.id, player.discord_snowflake FROM pairing \
                               INNER JOIN player ON player.id = pairing.left_player \
                               WHERE pairing.dead IS NULL AND pairing.winner IS NULL \
                                     AND pairing.right_player = (SELECT id FROM player WHERE discord_snowflake = ?) \
                               UNION \
                               SELECT pairing.id, player.discord_snowflake FROM pairing \
                               INNER JOIN player ON player.id = pairing.right_player \
                               WHERE pairing.dead IS NULL AND pairing.winner IS NULL \
                                    AND pairing.left_player = (SELECT id FROM player WHERE discord_snowflake = ?) \
                               ORDER BY pairing.id ASC LIMIT 1';

    return (await db.get(opponentQuery, playerSnowflake, playerSnowflake)).discord_snowflake;
}

export async function getOpenPairings(asOfWeek) {
    const openPairingsQuery =
        'SELECT leftPlayer.discord_snowflake AS leftPlayerSnowflake, leftTeam.discord_snowflake AS leftTeamSnowflake, \
                rightPlayer.discord_snowflake AS rightPlayerSnowflake, rightTeam.discord_snowflake AS rightTeamSnowflake, pairing.matchup FROM pairing \
         INNER JOIN player AS leftPlayer ON leftPlayer.id = pairing.left_player \
         INNER JOIN player AS rightPlayer ON rightPlayer.id = pairing.right_player \
         INNER JOIN team AS leftTeam ON leftTeam.id = leftPlayer.team \
         INNER JOIN team AS rightTeam ON rightTeam.id = rightPlayer.team \
         INNER JOIN matchup ON matchup.id = pairing.matchup \
         INNER JOIN week ON week.id = matchup.week \
         WHERE pairing.winner IS NULL AND pairing.dead IS NULL AND week.number = ? AND week.season = ?';
    return await db.all(openPairingsQuery, asOfWeek, currentSeason.number);
}

async function notifyOwnersIfAllMatchesDone() {
    if ((await getOpenPairings(currentSeason.current_week)).length === 0) {
        const captainChannel = await channels.fetch(process.env.captainChannelId);
        await captainChannel.send({
            content: `${roleMention(process.env.ownerRoleId)} all matches are in -- run /season calculate_standings when you've confirmed.`,
            allowedMentions: { parse: ['roles'] }
        })
    }
}