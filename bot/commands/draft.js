import { SlashCommandBuilder, roleMention, codeBlock, userMention } from 'discord.js';
import { rightAlign, fixFloat, userIsCaptain, userIsCoach, userIsOwner, baseFunctionlessHandler, baseHandler } from './util.js'
import { currentSeason } from '../globals.js';
import { loadPlayerFromSnowflake, loadRosterSize, savePlayerChange, loadUndraftedPlayers } from '../../database/player.js';
import { saveInitialPstats } from '../../database/pstat.js';
import { savePostDraftRosters } from '../../database/roster.js';

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
        const submitter = await loadPlayerFromSnowflake(interaction.user.id);

        if (!submitter.teamId) {
            return { failure: 'You must be on a team to use this command.' };
        }

        const maxStars = fixFloat(await maxStarsNext(submitter.teamId));

        const availablePlayers = await loadUndraftedPlayers(maxStars);

        return { teamSnowflake: submitter.teamSnowflake, maxStars, availablePlayers };
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

async function maxStarsNext(teamId) {
    if (process.env.isR1) { // gross as fuck, i don't wanna add real infrastructure for tracking draft rounds rn, i'll do that next season
        const captainStars = await loadRosterSize(teamId, true);

        return currentSeason.r1_stars - captainStars.stars;
    }
    else {
        const roster = await loadRosterSize(teamId, false);

        return currentSeason.max_stars - roster.stars - ((currentSeason.max_roster - 1 - roster.size) * 1.5);
    }
}

async function pickPlayer(interaction) {
    async function dataCollector(interaction) {
        if (!userIsCaptain(interaction.member) && !userIsCoach(interaction.member)) {
            return { failure: 'You must be a captain or coach to use this command.' };
        }

        const player = interaction.options.getMember('player');

        const submitter = await loadPlayerFromSnowflake(interaction.user.id);

        if (!submitter.teamId) {
            return { failure: 'You must be on a team to use this command.' };
        }

        const maxStars = fixFloat(await maxStarsNext(team.id));
        let playerData = await loadPlayerFromSnowflake(player.id);
        playerData.stars = fixFloat(playerData.stars);

        return { submitter, maxStars, pick: playerData };
    }

    function verifier(data) {
        const { submitter, maxStars, pick } = data;
        let failures = [], prompts = [];

        if (pick.teamId !== null) {
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
        const confirmMessage = `${userMention(pick.discord_snowflake)} drafted to ${roleMention(submitter.teamSnowflake)} for ${pick.stars} stars.`;
        const cancelMessage = `${userMention(pick.discord_snowflake)} not drafted.`;

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { submitter, pick } = data;

        await savePlayerChange(pick.discord_snowflake, pick.name, pick.stars, submitter.teamId, 1, pick.active);

        await pick.roles.add([process.env.playerRoleId, team.discord_snowflake]);
        await notifyOwnerIfAllPlayersDrafted();
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}

async function notifyOwnerIfAllPlayersDrafted() {
    const availablePlayers = await loadUndraftedPlayers(10);

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

        const availablePlayers = await loadUndraftedPlayers(10);

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
        await savePostDraftRosters(currentSeason.number);
        await saveInitialPstats(currentSeason.number);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, true, false);
}