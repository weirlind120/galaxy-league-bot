import { SlashCommandBuilder, roleMention, codeBlock } from 'discord.js';
import { confirmAction, sendFailure, rightAlign, fixFloat, userIsCaptain, userIsCoach, userIsMod } from './util.js'
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
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('finalize')
                .setDescription('saves rosters, initializes pstats')),

    async execute(interaction) {
        switch (interaction.options.getSubcommand()) {
            case 'list':
                await listPlayers(interaction);
                break;
            case 'pick':
                await pickPlayer(interaction);
                break;
            case 'finalize':
                await finalizeDraft(interaction);
                break;
        }
    }
}

async function listPlayers(interaction) {
    if (!userIsCaptain(interaction.member) && !userIsCoach(interaction.member)) {
        await sendFailure(interaction, 'You must be a captain or coach to use this command.');
        return;
    }

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
    if (!userIsCaptain(interaction.member) && !userIsCoach(interaction.member)) {
        await sendFailure(interaction, 'You must be a captain or coach to use this command.');
        return;
    }

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

        await notifyOwnerIfAllPlayersDrafted();
    }
}

async function notifyOwnerIfAllPlayersDrafted() {
    const availablePlayers = await db.all('SELECT name FROM player WHERE team IS NULL AND active = 1');

    if (availablePlayers.length === 0) {
        const draftChannel = await channels.fetch(process.env.draftChannelId);
        await draftChannel.send({
            content: `${roleMention(process.env.ownerRoleId)} all players have been drafted. After confirming the #registration channel has nobody left, run /draft finalize.`,
            allowedMentions: { parse: ['roles'] }
        });
    }
}

async function finalizeDraft(interaction) {
    if (!userIsMod(interaction.member)) {
        await sendFailure(interaction, 'You must be a mod to use this command.');
        return;
    }

    let prompts = [], failures = [];

    const availablePlayers = (await db.all('SELECT name FROM player WHERE team IS NULL AND active = 1')).map(player => player.name).join(', ')

    if (availablePlayers) {
        prompts.push(`The following players are still undrafted: ${availablePlayers}`);
    }

    const confirmLabel = 'Confirm Draft Ending';
    const confirmMessage = 'Draft concluded';
    const cancelMessage = 'Draft not concluded';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await saveRosters(currentSeason.number);
        await initPstats(currentSeason.number);
    }
}

async function saveRosters(season) {
    const rosterQuery = 'INSERT INTO roster (season, team, player, role) SELECT ?, team, id, role FROM player WHERE team IS NOT NULL';
    await db.run(rosterQuery, season);
}

async function initPstats(season) {
    const pstatQuery = 'INSERT INTO pstat (player, season, stars) SELECT id, ?, stars FROM player WHERE team IS NOT NULL AND role != 3';
    await db.run(pstatQuery, season);
}