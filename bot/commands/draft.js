import { SlashCommandBuilder, roleMention, codeBlock } from 'discord.js';
import { confirmAction, sendFailure, rightAlign, fixFloat } from './util.js'
import { db, currentSeason } from '../globals.js';

export const DRAFT_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('draft')
        .setDescription('commands for drafting players')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('shows all players you can draft in descending star order')
                .addBooleanOption(option =>
                    option
                        .setName('public')
                        .setDescription('whether to show the list publicly')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pick')
                .setDescription('adds an available player to your team')
                .addUserOption(option => 
                    option
                        .setName('player')
                        .setDescription('player to draft')
                        .setRequired(true))),

    async execute(interaction) {
        if (!interaction.member.roles.cache.has(process.env.captainRoleId) && !interaction.member.roles.cache.has(process.env.coachRoleId)) {
            await sendFailure(interaction, 'You must be a captain or coach to use this command.');
            return;
        }

        switch (interaction.options.getSubcommand()) {
            case 'list':
                await listPlayers(interaction);
                break;
            case 'pick':
                await pickPlayer(interaction);
                break;
        }
    }
}

async function listPlayers(interaction) {
    const ephemeral = !interaction.options.getBoolean('public');

    const submitterQuery = 'SELECT player.id, team.id AS teamId, team.discord_snowflake AS teamSnowflake FROM player \
                            INNER JOIN team ON team.id = player.team \
                            WHERE player.discord_snowflake = ?'
    const submitter = await db.get(submitterQuery, interaction.user.id);

    const maxStars = fixFloat(await maxStarsNext(submitter.teamId));
    const availablePlayers = await db.all('SELECT name, stars FROM player WHERE team IS NULL AND active = 1 AND stars <= ? ORDER BY stars DESC', maxStars);
    const message = prettyDraftList(availablePlayers);

    await interaction.reply({ content: message, ephemeral: ephemeral });
}

function prettyDraftList(availablePlayers) {
    if (availablePlayers.length === 0) {
        return 'Nobody left!';
    }

    return codeBlock(''.concat(
        'Stars | Player \n',
        '------|--------\n',
        availablePlayers.map(player => prettyTextPlayer(player)).join('\n')
    ))
}

function prettyTextPlayer(player) {
    return `${rightAlign(6, fixFloat(player.stars))}| ${player.name}`
}

async function maxStarsNext(team) {
    if (process.env.isR1) { // gross as fuck, i don't wanna add real infrastructure for tracking draft rounds rn, i'll do that next season
        const captainStars = await db.get('SELECT stars FROM player WHERE team = ? AND role = 2', team);

        return currentSeason.r1_stars - captainStars.stars;
    }
    else {
        const roster = await db.get('SELECT COUNT(stars) AS size, SUM(stars) AS stars FROM player WHERE team = ? AND role != 3', team);

        return currentSeason.max_stars - roster.stars - ((currentSeason.max_roster - 1 - roster.size) * 1.5);
    }
}

async function pickPlayer(interaction) {
    let prompts = [], failures = [];

    const player = interaction.options.getMember('player');

    const submitterQuery = 'SELECT player.id, team.id AS teamId, team.discord_snowflake AS teamSnowflake FROM player \
                            INNER JOIN team ON team.id = player.team \
                            WHERE player.discord_snowflake = ?'
    const submitter = await db.get(submitterQuery, interaction.user.id);

    const maxStars = fixFloat(await maxStarsNext(submitter.teamId));
    let playerData = await db.get('SELECT stars, team, active FROM player WHERE discord_snowflake = ?', player.user.id);
    playerData.stars = fixFloat(playerData.stars);

    if (playerData.team !== null) {
        failures.push(`${player} is already on a team!`);
    }
    if (!playerData.active) {
        failures.push(`${player} is not playing this season!`);
    }
    if (playerData.stars > maxStars) {
        failures.push(`${player} is too expensive! Your budget: ${maxStars} stars.`);
    }
    prompts.push(`Confirm that you want to draft ${player} for ${playerData.stars} stars.`);

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm Draft';
    const confirmMessage = `${player} drafted to ${roleMention(submitter.teamSnowflake)} for ${playerData.stars}.`;
    const cancelMessage = `${player} not drafted.`;

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        let roles = [...player.roles.cache.keys()];

        roles.push(process.env.playerRoleId);
        roles.push(submitter.teamSnowflake);

        player.roles.set(roles);

        await db.run('UPDATE player SET team = ?, role = role.id \
                      FROM role WHERE role.discord_snowflake = ? AND player.discord_snowflake = ?', submitter.teamId, process.env.playerRoleId, player.user.id);
    }
}