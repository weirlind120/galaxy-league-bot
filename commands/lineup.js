import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention } from 'discord.js';
import { confirmAction, sendFailure } from './util.js';
import { db, currentSeason } from '../app.js';

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
                        .setDescription('Player in slot 6'))
                .addUserOption(option =>
                    option
                        .setName('slot7')
                        .setDescription('Player in slot 7'))
                .addUserOption(option =>
                    option
                        .setName('slot8')
                        .setDescription('Player in slot 8'))
                .addUserOption(option =>
                    option
                        .setName('slot9')
                        .setDescription('Player in slot 9'))
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
                .addNumberOption(option =>
                    option
                        .setName('slot_number')
                        .setDescription('number of slot to change')
                        .setRequired(true))
                .addUserOption(option =>
                    option
                        .setName('new_player')
                        .setDescription('Player to sub in')
                        .setRequired(true))),

    async execute(interaction) {
        const userIsMod = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!interaction.member.roles.cache.has('Captain') && !interaction.member.roles.cache.has('Coach') && !userIsMod) {
            sendFailure(interaction, 'You must be a captain, coach, or mod to use this command.');
        }

        switch (interaction.options.getSubcommand()) {
            case 'submit':
                await submitLineup(interaction, userIsMod);
                break;
            case 'substitution':
                await substitutePlayer(interaction, userIsMod);
                break;
        }
    }
}

async function submitLineup(interaction, userIsMod) {
    const submitterQuery = 'SELECT player.id, role.discord_snowflake AS roleSnowflake, role.name AS roleName, team.discord_snowflake AS teamSnowflake FROM players \
                            LEFT JOIN team ON team.id = player.team \
                            LEFT JOIN role ON role.id = player.role \
                            WHERE player.discord_snowflake = ?'
    const submitter = await db.get(submitterQuery, interaction.user.id);

    let lineup = [
        interaction.getMember('slot1'),
        interaction.getMember('slot2'),
        interaction.getMember('slot3'),
        interaction.getMember('slot4'),
        interaction.getMember('slot5'),
        interaction.getMember('slot6'),
        interaction.getMember('slot7'),
        interaction.getMember('slot8'),
        interaction.getMember('slot9')
    ].filter(member => !!member);
    const riggedCount = interaction.getNumber('number_rigged') || 0;
    const teamOption = interaction.getRole('team').id;
    const team = teamOption || submitter.teamSnowflake;
    const clear = interaction.getBoolean('clear');

    if (!teamOption) {
        sendFailure(interaction, "You aren't a captain or coach, so you must specify the team you are submitting for.");
        return;
    }

    const matchupQuery = 'SELECT matchup.id, matchup.rigged_count, matchup.slots, matchup.left_team, matchup.right_team FROM matchup \
         INNER JOIN week on matchup.week = week.id \
         INNER JOIN team on matchup.left_team = team.id \
         WHERE week.season = ? AND week.number = ? AND team.discord_snowflake = ? \
         UNION \
         SELECT matchup.rigged_count, matchup.slots, matchup.left_team, matchup.right_team FROM matchup \
         INNER JOIN week on matchup.week = week.id \
         INNER JOIN team on matchup.right_team = team.id \
         WHERE week.season = ? AND week.number = ? AND team.discord_snowflake = ?';
    const matchup = await db.get(matchupQuery, currentSeason.number, currentSeason.current_week + 1, team);

    if (!matchup) {
        sendFailure(interaction, `There are no weeks awaiting a lineup submission for ${roleMention(team)}.`);
        return;
    }

    const rosterQuery = 'SELECT player.id, player.discord_snowflake, player.stars, team.discord_snowflake AS teamSnowflake, role.name AS roleName FROM player \
                         INNER JOIN team ON player.team = team.id \
                         INNER JOIN role ON player.role = role.id \
                         WHERE team.discord_snowflake = ? \
                         ORDER BY stars DESC';
    const roster = await db.all(rosterQuery, team);

    lineup = lineup.map(player => roster.find(p => p.discord_snowflake = player.id));

    let failures = [];
    let prompts = [];

    if (matchup.rigged_count && matchup.rigged_count !== riggedCount && !clear) {
        failures.push(`You said that you rigged ${riggedCount} pairings, but someone previously submitted ${matchup.rigged_count}. Add the clear option to start from scratch.`);
    }
    if (matchup.slots && matchup.slots !== lineup.length && !clear) {
        failures.push(`You submitted ${lineup.length} players, but someone previously submitted ${matchup.slots}. Add the clear option to start from scratch.`);
    }
    if (!interaction.member.roles.cache.has(team)) {
        addModOverrideableFailure(userIsMod, failures, prompts, `You submitted for ${roleMention(team)}, but you're not on that team.`);
    }
    for (let i = 0; i < lineup.length; i++) {
        const player = lineup[i];

        if (player.teamSnowflake !== team) {
            addModOverrideableFailure(userIsMod, failures, prompts, `You submitted ${player.user} in your lineup, but they're not on ${roleMention(team)}`);
        }

        if (player.roleName === 'Coach') {
            addModOverrideableFailure(userIsMod, failures, prompts, `You submitted ${player.user} in your lineup, but they're a coach and can't play.`);
        }

        if (i >= riggedCount) {
            for (let j = i + 1; j < lineup.length; j++) {
                const lowerPlayer = lineup[j];

                if ((lowerPlayer.stars - player.stars) > 0.7) {
                    const playerIndex = roster.findIndex(p => p.id === player.id);
                    let nextStrongestPlayerIndex = playerIndex - 1;

                    while (roster[nextStrongestPlayerIndex].stars === player.stars) {
                        nextStrongestPlayerIndex -= 1;
                    }

                    if (roster[nextStrongestPlayerIndex].id !== lowerPlayer.id) {
                        addModOverrideableFailure(userIsMod, failures, prompts, `You submitted ${userMention(lowerPlayer.discord_snowflake)} below ${userMention(player.discord_snowflake)}, but the star rules don't permit that.`);
                    }
                }
            }
        }
    }
    if (clear) {
        prompts.push('You will clear the lineup submissions of both teams in the matchup');
    }

    if (failures.length) {
        sendFailure(interaction, failures);
        return;
    }

    const confirmLabel = 'Confirm lineup submission';
    let confirmMessage = `Lineup submitted for ${roleMention(team)}.\
                          \n${riggedCount} rigged pairings.`
    for (const player of lineup) {
        confirmLabel = confirmLabel.concat('\n', roleMention(player.discord_snowflake));
    }
    const cancelMessage = 'No lineup submitted';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {

    }
}

async function substitutePlayer(interaction, userIsMod) {

}

function addModOverrideableFailure(userIsMod, failures, prompts, message) {
    if (userIsMod) {
        prompts.push(message);
    }
    else {
        failures.push(message);
    }
}