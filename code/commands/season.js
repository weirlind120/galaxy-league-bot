import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention } from 'discord.js';
import { confirmAction, sendFailure } from './util.js';
import { db } from '../globals.js';

export const SEASON_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('season')
        .setDescription('commands for managing the season')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('new')
                .setDescription('starts a new season')
                .addNumberOption(option =>
                    option
                        .setName('length')
                        .setDescription('number of weeks of reg season')
                        .setRequired(true))
                .addNumberOption(option =>
                    option
                        .setName('playoff_size')
                        .setDescription('number of teams in playoff')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('next_week')
                .setDescription('starts the next week: make new match rooms, post predictions, make extension rooms, update standings'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup_playoff')
                .setDescription('calculates the next playoff round based off of standings, and pings the captains for lineups')),

    async execute(interaction) {
        switch (interaction.options.getSubcommand()) {
            case 'next_week':
                await nextWeek(interaction);
                break;
            case 'setup_playoff':
                await setupPlayoff(interaction);
                break;
        }
    }
}

async function nextWeek(interaction) {
    let prompts = [], failures = [];

    const pairingsNeedingExtension = await getPairingsNeedingExtension(prompts);
    const teamsWithoutSubmittedLineups = await getTeamsWithoutSubmittedLineups(prompts);

    if (sendFailure(failures)) return;

    const confirmLabel = 'Confirm advance week';
    const confirmMessage = 'New week begun.'
    const cancelMessage = 'New week not begun.'

    await createExtensionRooms(interaction);
    //await updateStandings();
    //await updateStarRanks();
    //await updateMatchRooms();
    //await postPredictions();
}

async function setupPlayoff(interaction) {

}

async function getPairingsNeedingExtension(prompts) {
    const pairingsNeedingExtensionQuery =
        'SELECT leftPlayer.discord_snowflake AS leftPlayerSnowflake, leftTeam.discord_snowflake AS leftTeamSnowflake, rightPlayer.discord_snowflake AS rightPlayerSnowflake, rightTeam.discord_snowflake AS rightTeamSnowflake FROM pairing \
         INNER JOIN player AS leftPlayer ON leftPlayer.id = pairing.left_player \
         INNER JOIN player AS rightPlayer ON rightPlayer.id = pairing.right_player \
         INNER JOIN team AS leftTeam ON leftTeam.id = leftPlayer.team \
         INNER JOIN team AS rightTeam ON rightTeam.id = rightPlayer.team \
         INNER JOIN matchup ON matchup.id = pairing.matchup \
         INNER JOIN week ON week.id = matchup.week \
         WHERE week.number = 6 AND week.season = 13 AND winner IS NULL AND dead IS NULL';

    const pairingsNeedingExtension = await db.all(pairingsNeedingExtensionQuery);

    pairingsNeedingExtension.forEach(pairing => {
        prompts.push(`(${roleMention(pairing.leftTeamSnowflake)}) ${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(pairing.rightPlayerSnowflake)} (${roleMention(pairing.rightTeamSnowflake)}) will be granted an extension`);
    });

    return pairingsNeedingExtension;
}

async function getTeamsWithoutSubmittedLineups(prompts) {
    const teamsWithoutSubmittedLineupsQuery =
        'SELECT team.discord_snowflake FROM matchup \
         LEFT JOIN pairing ON pairing.matchup = matchup.id \
         INNER JOIN team ON team.id = matchup.left_team \
         WHERE pairing.left_player IS NULL \
         UNION \
         SELECT team.discord_snowflake FROM matchup \
         LEFT JOIN pairing ON pairing.matchup = matchup.id \
         INNER JOIN team ON team.id = matchup.right_team \
         WHERE pairing.right_player IS NULL'
    const teamsWithoutSubmittedLineups = await db.all(teamsWithoutSubmittedLineupsQuery).map(team => team.discord_snowflake);

    teamsWithoutSubmittedLineups.forEach(team => {
        prompts.push(`${roleMention(team)} hasn't submitted their lineup yet`);
    });

    return teamsWithoutSubmittedLineups;
}