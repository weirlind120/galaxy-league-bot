import { SlashCommandBuilder, roleMention, userMention } from 'discord.js';
import { addModOverrideableFailure, fixFloat, userIsCaptain, userIsCoach, userIsMod, weekName, baseFunctionlessHandler, baseHandler } from './util.js';
import { currentSeason, channels } from '../globals.js';
import { changePredictionsPlayer } from '../features/predictions.js';
import { changeScheduledPlayer } from '../features/schedule.js';
import { loadPlayerFromSnowflake, loadTeamInStarOrder, loadPlayersForSubstitution } from '../../database/player.js';
import { loadOneLineup, saveSubstitution, saveDeletePairingsForMatchup, saveLineupSubmission } from '../../database/pairing.js';
import { loadMatchupsMissingLineups, loadMatchupForTeam, saveMatchupSubmission } from '../../database/matchup.js';
import { loadTeam } from '../../database/team.js';

export const LINEUP_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('lineup')
        .setDescription("Submits / edits a lineup")
        .addSubcommand(subcommand =>
            subcommand
                .setName('submit')
                .setDescription('Submits a complete lineup before the week has been posted')
                .addUserOption(option =>
                    option
                        .setName('slot1')
                        .setDescription('Player in slot 1')
                        .setRequired(true))
                .addUserOption(option =>
                    option
                        .setName('slot2')
                        .setDescription('Player in slot 2')
                        .setRequired(true))
                .addUserOption(option =>
                    option
                        .setName('slot3')
                        .setDescription('Player in slot 3')
                        .setRequired(true))
                .addUserOption(option =>
                    option
                        .setName('slot4')
                        .setDescription('Player in slot 4')
                        .setRequired(true))
                .addUserOption(option =>
                    option
                        .setName('slot5')
                        .setDescription('Player in slot 5')
                        .setRequired(true))
                .addUserOption(option =>
                    option
                        .setName('slot6')
                        .setDescription('Player in slot 6')
                        .setRequired(true))
                .addUserOption(option =>
                    option
                        .setName('slot7')
                        .setDescription('Player in slot 7')
                        .setRequired(true))
                .addUserOption(option =>
                    option
                        .setName('slot8')
                        .setDescription('Player in slot 8'))
                .addUserOption(option =>
                    option
                        .setName('slot9')
                        .setDescription('Player in slot 9'))
                .addUserOption(option =>
                    option
                        .setName('slot10')
                        .setDescription('Player in slot 10'))
                .addUserOption(option =>
                    option
                        .setName('slot11')
                        .setDescription('Player in slot 11'))
                .addUserOption(option =>
                    option
                        .setName('slot12')
                        .setDescription('Player in slot 12'))
                .addUserOption(option =>
                    option
                        .setName('slot13')
                        .setDescription('Player in slot 13'))
                .addUserOption(option =>
                    option
                        .setName('slot14')
                        .setDescription('Player in slot 14'))
                .addUserOption(option =>
                    option
                        .setName('slot15')
                        .setDescription('Player in slot 15'))
                .addRoleOption(option =>
                    option
                        .setName('team')
                        .setDescription('team whose lineup is being submitted (defaults to the team you are captain of)'))
                .addNumberOption(option =>
                    option
                        .setName('number_rigged')
                        .setDescription('Number of rigged matchups (matchups where captains decided in advance to make two players fight)'))
                .addBooleanOption(option =>
                    option
                        .setName('clear')
                        .setDescription("Clears out both captain's submissions, in case you changed the number of slots or rigged matchups."))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('substitution')
                .setDescription('Swaps out a player after the week has been posted')
                .addUserOption(option =>
                    option
                        .setName('replaced_player')
                        .setDescription('Player to sub out')
                        .setRequired(true))
                .addUserOption(option =>
                    option
                        .setName('new_player')
                        .setDescription('Player to sub in')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option
                        .setName('extension')
                        .setDescription('Whether this was an extension from last week')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('hound')
                .setDescription('Bothers captains for lineups'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remind')
                .setDescription('Remind the user what lineup was submitted')),

    async execute(interaction) {
        switch (interaction.options.getSubcommand()) {
            case 'submit':
                await submitLineup(interaction);
                break;
            case 'substitution':
                await substitutePlayer(interaction);
                break;
            case 'hound':
                await houndCaptains(interaction);
                break;
            case 'remind':
                await remindLineup(interaction);
                break;
        }
    }
}

async function submitLineup(interaction) {
    async function dataCollector(interaction) {
        if (!userIsCaptain(interaction.member) && !userIsCoach(interaction.member) && !userIsMod(interaction.member)) {
            return { failure: 'You must be a captain, coach, or mod to use this command.' };
        }

        const riggedCount = interaction.options.getNumber('number_rigged') || 0;
        const teamOption = interaction.options.getRole('team')?.id;
        const clear = interaction.options.getBoolean('clear');
        const lineupOption = [
            interaction.options.getMember('slot1'),
            interaction.options.getMember('slot2'),
            interaction.options.getMember('slot3'),
            interaction.options.getMember('slot4'),
            interaction.options.getMember('slot5'),
            interaction.options.getMember('slot6'),
            interaction.options.getMember('slot7'),
            interaction.options.getMember('slot8'),
            interaction.options.getMember('slot9'),
            interaction.options.getMember('slot10'),
            interaction.options.getMember('slot11'),
            interaction.options.getMember('slot12'),
            interaction.options.getMember('slot13'),
            interaction.options.getMember('slot14'),
            interaction.options.getMember('slot15')
        ].filter(member => !!member);

        if (!userIsCaptain(interaction.member) && !userIsCoach(interaction.member) && !teamOption) {
            return { failure: "You aren't a captain or coach, so you must specify the team you are submitting for." };
        }

        const submitter = await loadPlayerFromSnowflake(interaction.user.id);

        const teamSnowflake = teamOption || submitter.teamSnowflake;

        const matchup = await loadMatchupForTeam(currentSeason.number, currentSeason.current_week + 1, teamSnowflake);

        if (!matchup) {
            return { failure: `There are no weeks awaiting a lineup submission for ${roleMention(teamSnowflake)}.` };
        }

        const roster = await loadTeamInStarOrder(teamSnowflake);

        const lineup = lineupOption.map(player => roster.find(p => p.discord_snowflake === player.id) ?? { discord_snowflake: player.user.id });

        return { isMod: userIsMod(interaction.member), submitter, teamSnowflake, matchup, riggedCount, clear, lineup, roster };
    }

    function verifier(data) {
        const { isMod, teamSnowflake, matchup, riggedCount, clear, lineup, roster } = data;
        let failures = [], prompts = [];

        if (matchup.rigged_count !== null && matchup.rigged_count !== riggedCount && !clear) {
            failures.push(`You said that you rigged ${riggedCount} pairings, but someone previously submitted ${matchup.rigged_count}. Add the clear option to start from scratch.`);
        }

        if (matchup.slots && matchup.slots !== lineup.length && !clear) {
            failures.push(`You submitted ${lineup.length} players, but someone previously submitted ${matchup.slots}. Add the clear option to start from scratch.`);
        }

        if (!interaction.member.roles.cache.has(teamSnowflake)) {
            addModOverrideableFailure(isMod, failures, prompts, `You submitted for ${roleMention(teamSnowflake)}, but you're not on that team.`);
        }

        for (let i = 0; i < lineup.length; i++) {
            const player = lineup[i];

            if (player.teamSnowflake !== teamSnowflake) {
                failures.push(`You submitted ${userMention(player.discord_snowflake)} in your lineup, but they're not on ${roleMention(teamSnowflake)}`);
                continue;
            }
            if (player.roleName === 'Coach') {
                failures.push(`You submitted ${userMention(player.discord_snowflake)} in your lineup, but they're a coach and can't play.`);
            }
            if (lineup.findLastIndex(p => p.id === player.id) !== i) {
                failures.push(userIsMod, failures, prompts, `You submitted ${userMention(player.discord_snowflake)} multiple times in your lineup.`);
            }

            if (i >= riggedCount) {
                for (let j = i + 1; j < lineup.length; j++) {
                    const lowerPlayer = lineup[j];

                    if (fixFloat(lowerPlayer.stars - player.stars) > 0.7) {
                        const playerIndex = roster.findIndex(p => p.id === player.id);
                        let nextStrongestPlayerIndex = playerIndex - 1;

                        while (roster[nextStrongestPlayerIndex].stars === player.stars || roster[nextStrongestPlayerIndex].roleName === 'Coach') {
                            nextStrongestPlayerIndex -= 1;
                        }

                        if (roster[nextStrongestPlayerIndex].id !== lowerPlayer.id) {
                            addModOverrideableFailure(isMod, failures, prompts, `You submitted ${userMention(lowerPlayer.discord_snowflake)} below ${userMention(player.discord_snowflake)}, but the star rules don't permit that.`);
                        }
                    }
                }
            }
        }

        if (clear) {
            prompts.push('You will clear the lineup submissions of both teams in the matchup.');
        }

        const confirmLabel = 'Confirm lineup submission';
        const confirmMessage = `Lineup submitted for ${roleMention(teamSnowflake)}.\n${riggedCount} rigged pairings.\n`.concat(
            lineup.map(player => userMention(player.discord_snowflake)).join('\n')
        );
        const cancelMessage = 'No lineup submitted.';

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { submitter, matchup, riggedCount, clear, lineup } = data;

        if (clear) {
            await clearMatchup(matchup, submitter);
        }

        await commitLineup(matchup, riggedCount, lineup, submitter);
        await notifyOwnersIfAllLineupsIn();
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, true, true);
}

async function clearMatchup(matchup, submitter) {
    await saveDeletePairingsForMatchup(matchup.id);

    const otherTeam = (matchup.left_team === matchup.submittingTeamId) ? matchup.right_team : matchup.left_team;
    const otherTeamRole = (await loadTeam(otherTeam)).discord_snowflake;

    const captainChannel = await channels.fetch(process.env.captainChannelId);
    await captainChannel.send({
        content: `${roleMention(otherTeamRole)}, ${userMention(submitter.discord_snowflake)} just wiped your lineup submission so you'll have to resubmit.`,
        allowedMentions: { roles: [otherTeamRole] }
    });
}

export async function commitLineup(matchup, riggedCount, lineup, submitter) {
    const side = (matchup.left_team === matchup.submittingTeamId) ? 'left' : 'right';
    await saveMatchupSubmission(matchup.id, riggedCount, lineup.length, side, submitter.id);
    await saveLineupSubmission(matchup.id, side, lineup);
}

async function notifyOwnersIfAllLineupsIn() {
    if ((await loadMatchupsMissingLineups(currentSeason.number, currentSeason.current_week + 1)).length === 0) {
        const captainChannel = await channels.fetch(process.env.captainChannelId);
        await captainChannel.send({
            content: `${roleMention(process.env.ownerRoleId)} all lineups are in -- run /season next_week when you've confirmed.`,
            allowedMentions: { parse: ['roles'] }
        });
    }
}

async function substitutePlayer(interaction) {
    async function dataCollector(interaction) {
        if (!userIsCaptain(interaction.member) && !userIsCoach(interaction.member) && !userIsMod(interaction.member)) {
            return { failure: 'You must be a captain, coach, or mod to use this command.' };
        }

        const replacedPlayer = interaction.options.getUser('replaced_player');
        const newPlayer = interaction.options.getUser('new_player');
        const extension = interaction.options.getBoolean('extension');

        const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;

        const players = await loadPlayersForSubstitution(currentSeason.number, week, replacedPlayer.id, newPlayer.id);

        if (players.length !== 2) {
            return { failure: `Could not find both ${replacedPlayer} and ${newPlayer} in the player pool.` };
        }

        const newPlayerData = players.find(p => p.discord_snowflake === newPlayer.id);
        const replacedPlayerData = players.find(p => p.discord_snowflake === replacedPlayer.id);

        const matchup = await loadMatchupForTeam(currentSeason.number, week, replacedPlayerData.teamSnowflake);

        if (!matchup) {
            return { failure: 'No games found for your team this week.' };
        }

        return { isMod: userIsMod(interaction.member), newPlayer: newPlayerData, replacedPlayer: replacedPlayerData, side: replacedPlayerData.side, matchup };
    }

    function verifier(data) {
        const { isMod, newPlayer, replacedPlayer } = data;
        let failures = [], prompts = [];

        if (!replacedPlayer.slot) {
            failures.push(`You're subbing out ${userMention(replacedPlayer.discord_snowflake)} but they don't seem to be playing this week.`);
        }

        if (replacedPlayer.winner || replacedPlayer.dead) {
            failures.push(`You're subbing out ${userMention(replacedPlayer.discord_snowflake)} but their match has already been decided. Get a mod to use /match undo if this sub is legit.`);
        }

        if (newPlayer.slot) {
            failures.push(`You're subbing in ${userMention(newPlayer.discord_snowflake)}, but they're already playing in slot ${newPlayer.slot}.`);
        }

        if (newPlayer.teamSnowflake !== replacedPlayer.teamSnowflake) {
            failures.push(`You're subbing in ${userMention(newPlayer.discord_snowflake)} over ${userMention(replacedPlayer.discord_snowflake)}, but they're on different teams.\n` +
                          `${userMention(replacedPlayer.discord_snowflake)} is on the ${roleMention(replacedPlayer.teamSnowflake)}\n` +
                          `${userMention(newPlayer.discord_snowflake)} is on the ${roleMention(newPlayer.teamSnowflake)}`);
        }

        if (newPlayer.roleName === 'Coach') {
            failures.push(`You're subbing in ${userMention(newPlayer.discord_snowflake)}, but they're a coach and can't play.`);
        }

        if ((fixFloat(newPlayer.stars) - fixFloat(replacedPlayer.stars)) > 0.7) {
            addModOverrideableFailure(isMod, failures, prompts, `You're subbing in ${userMention(newPlayer.discord_snowflake)} over ${userMention(replacedPlayer.discord_snowflake)}, but the star rules don't permit that.`);
        }

        if (!interaction.member.roles.cache.has(replacedPlayer.teamSnowflake)) {
            addModOverrideableFailure(isMod, failures, prompts, `You're subbing out ${userMention(replacedPlayer.discord_snowflake)}, who is on the ${roleMention(replacedPlayer.teamSnowflake)}, but you aren't on that team.`);
        }

        const confirmLabel = 'Confirm substitution';
        const confirmMessage = `${userMention(newPlayer.discord_snowflake)} subbed in over ${userMention(replacedPlayer.discord_snowflake)}`;
        const cancelMessage = 'No substitution performed.';

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { replacedPlayer, newPlayer, matchup, side } = data;
        await saveSubstitution(matchup.id, replacedPlayer.slot, side, newPlayer.id);

        const matchRoom = await channels.fetch(eval(`process.env.matchChannel${matchup.room}Id`));
        const channelMessage = await matchRoom.messages.fetch({ message: matchup.channel_message, force: true });
        const newChannelContent = channelMessage.content.replace(replacedPlayer.discord_snowflake, newPlayer.discord_snowflake);
        await channelMessage.edit(newChannelContent);

        await changeScheduledPlayer(matchup.schedule_message, replacedPlayer.discord_snowflake, newPlayer.discord_snowflake);
        await changePredictionsPlayer(replacedPlayer.predictions_message, replacedPlayer.name, newPlayer.name);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}

async function houndCaptains(interaction) {
    async function dataCollector(interaction) {
        if (!userIsMod(interaction.member)) {
            return { failure: 'You must be a mod to use this command!' };
        }

        const missingLineups = await loadMatchupsMissingLineups(currentSeason.number, currentSeason.current_week + 1);

        return { missingLineups };
    }

    function verifier(data) {
        const { missingLineups } = data;
        let failures = [], prompts = [];

        if (missingLineups.length === 0) {
            failures.push('All lineups are in!')
        }

        const confirmLabel = 'Hound Captains';
        const confirmMessage = 'Captains pinged for lineups!';
        const cancelMessage = 'Captains not pinged.';

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { missingLineups } = data;
        const pings = missingLineups.map(lineup => roleMention(lineup.delinquentTeamSnowflake)).join(', ')
        const message = `${pings}: We're waiting on your lineups. Use /lineup submit to submit.`;

        const captainRoom = await channels.fetch(process.env.captainChannelId);
        await captainRoom.send({ content: message, allowedMentions: { parse: ['roles'] } });
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, true, false);
}

async function remindLineup(interaction) {
    async function dataCollector(interaction) {
        if (!userIsCaptain(interaction.member) && !userIsCoach(interaction.member)) {
            return { failure: 'You must be a captain or coach to use this command!' };
        }

        const week = currentSeason.current_week + 1;

        const lineup = await loadOneLineup(currentSeason.number, week, interaction.user.id);

        if (lineup.length === 0) {
            return { failure: `No lineup found for ${weekName(week)} for ${interaction.member}.` };
        }

        return { week, teamSnowflake: lineup[0].teamSnowflake, lineup };
    }

    function verifier(data) {
        let failures = [];

        return failures;
    }

    function responseWriter(data) {
        const { week, teamSnowflake, lineup } = data;
        return `This is ${roleMention(teamSnowflake)}'s lineup for ${weekName(week)}:\n`.concat(
            `${lineup[0].rigged_count} rigged pairings.\n`,
            lineup.map(player => userMention(player.playerSnowflake)).join('\n')
        );
    }

    await baseFunctionlessHandler(interaction, dataCollector, verifier, responseWriter, true, false);
}