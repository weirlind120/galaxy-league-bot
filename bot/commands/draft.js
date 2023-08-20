import { SlashCommandBuilder, roleMention, codeBlock, userMention } from 'discord.js';
import { confirmAction, sendFailure, rightAlign, fixFloat, userIsCaptain, userIsCoach, userIsOwner, baseFunctionlessHandler, baseHandler } from './util.js'
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
    const ephemeral = !interaction.options.getBoolean('public');

    async function dataCollector(interaction) {
        const teamQuery = 
            'SELECT team.id, team.discord_snowflake FROM player \
             INNER JOIN team ON team.id = player.team \
             WHERE player.discord_snowflake = ?'
        const team = await db.get(teamQuery, interaction.user.id);

        if (!team) {
            return { failure: 'You must be on a team to use this command.' };
        }

        const maxStars = fixFloat(await maxStarsNext(team.id));

        const availablePlayers = await db.all('SELECT name, stars FROM player WHERE team IS NULL AND active = 1 AND stars <= ? ORDER BY stars DESC', maxStars);

        return { teamSnowflake: team.discord_snowflake, maxStars, availablePlayers };
    }

    function verifier(data) { }

    function responseWriter(data) {
        const { teamSnowflake, maxStars, availablePlayers } = data;
        return `Players available to ${roleMention(teamSnowflake)} (max stars for next pick: ${maxStars}):\n`.concat(prettyDraftList(availablePlayers));
    }

    await baseFunctionlessHandler(interaction, dataCollector, verifier, responseWriter, ephemeral, false);
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
    async function dataCollector(interaction) {
        if (!userIsCaptain(interaction.member) && !userIsCoach(interaction.member)) {
            return { failure: 'You must be a captain or coach to use this command.' };
        }

        const player = interaction.options.getMember('player');

        const teamQuery = 
            'SELECT team.id, discord_snowflake FROM player \
             INNER JOIN team ON team.id = player.team \
             WHERE player.discord_snowflake = ?'
        const team = await db.get(teamQuery, interaction.user.id);

        if (!team) {
            return { failure: 'You must be on a team to use this command.' };
        }

        const maxStars = fixFloat(await maxStarsNext(team.id));
        let playerData = await db.get('SELECT discord_snowflake, stars, team, active FROM player WHERE discord_snowflake = ?', player.id);
        playerData.stars = fixFloat(playerData.stars);

        return { team, maxStars, pick: playerData };
    }

    function verifier(data) {
        const { team, maxStars, pick } = data;
        let failures = [], prompts = [];

        if (pick.team !== null) {
            failures.push(`${userMention(pick.discord_snowflake)} is already on a team!`);
        }

        if (!pick.active) {
            failures.push(`${userMention(pick.discord_snowflake)} is not playing this season!`);
        }

        if (pick.stars > maxStars) {
            failures.push(`${userMention(pick.discord_snowflake)} is too expensive! Your budget: ${maxStars} stars.`);
        }

        prompts.push(`Confirm that you want to draft ${userMention(pick.discord_snowflake)} for ${pick.stars} stars.`);

        const confirmLabel = 'Confirm Draft';
        const confirmMessage = `${userMention(pick.discord_snowflake)} drafted to ${roleMention(team.discord_snowflake)} for ${pick.stars} stars.`;
        const cancelMessage = `${userMention(pick.discord_snowflake)} not drafted.`;

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { team, pick } = data;

        await db.run('UPDATE player SET team = ?, role = 1 WHERE role.discord_snowflake = ? AND player.discord_snowflake = ?', team.id, pick.discord_snowflake);

        await pick.roles.add([process.env.playerRoleId, team.discord_snowflake]);
        await notifyOwnerIfAllPlayersDrafted();
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
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
    async function dataCollector(interaction) {
        if (!userIsOwner(interaction.member)) {
            return { failure: 'You must be an owner to use this command.' };
        }

        const availablePlayers = await db.all('SELECT discord_snowflake FROM player WHERE team IS NULL AND active = 1');

        return { availablePlayers };
    }

    function verifier(data) {
        const { availablePlayers } = data;
        let prompts = [], failures = [];

        if (availablePlayers.length) {
            prompts.push(`The following players are still undrafted:\n${availablePlayers.map(player => userMention(player.discord_snowflake)).join('\n')}`);
        }

        const confirmLabel = 'Confirm Draft Ending';
        const confirmMessage = 'Draft concluded';
        const cancelMessage = 'Draft not concluded';

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        await saveRosters(currentSeason.number);
        await initPstats(currentSeason.number);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, true, false);
}

async function saveRosters(season) {
    const rosterQuery = 'INSERT INTO roster (season, team, player, role) SELECT ?, team, id, role FROM player WHERE team IS NOT NULL';
    await db.run(rosterQuery, season);
}

async function initPstats(season) {
    const pstatQuery = 'INSERT INTO pstat (player, season, stars) SELECT id, ?, stars FROM player WHERE team IS NOT NULL AND role != 3';
    await db.run(pstatQuery, season);
}