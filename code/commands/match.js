import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention, spoiler } from 'discord.js';
import { confirmAction, sendFailure, addModOverrideableFailure } from './util.js';
import { db, currentSeason, matchReportChannel } from '../globals.js';

export const MATCH_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('updates the status of a pairing')
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

        await matchReportChannel.send({
            content: matchReportMessage,
            allowedMentions: { parse: [] }
        });
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

        await matchReportChannel.send({
            content: matchReportMessage,
            allowedMentions: { parse: [] }
        });
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

        await matchReportChannel.send({
            content: matchReportMessage,
            allowedMentions: { parse: [] }
        });
    }
}