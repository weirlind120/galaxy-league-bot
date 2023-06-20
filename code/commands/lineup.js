import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention } from 'discord.js';
import { confirmAction, sendFailure, addModOverrideableFailure } from './util.js';
import { db, currentSeason, channels } from '../globals.js';

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
                        .setDescription('Whether this was an extension from last week'))),

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
    const deferred = !!(await interaction.deferReply({ ephemeral: true }));

    const submitterQuery = 'SELECT player.id, role.discord_snowflake AS roleSnowflake, role.name AS roleName, team.discord_snowflake AS teamSnowflake FROM player \
                            INNER JOIN team ON team.id = player.team \
                            INNER JOIN role ON role.id = player.role \
                            WHERE player.discord_snowflake = ?'
    const submitter = await db.get(submitterQuery, interaction.user.id);

    let lineup = [
        interaction.options.getMember('slot1'),
        interaction.options.getMember('slot2'),
        interaction.options.getMember('slot3'),
        interaction.options.getMember('slot4'),
        interaction.options.getMember('slot5'),
        interaction.options.getMember('slot6'),
        interaction.options.getMember('slot7'),
        interaction.options.getMember('slot8'),
        interaction.options.getMember('slot9')
    ].filter(member => !!member);
    const riggedCount = interaction.options.getNumber('number_rigged') || 0;
    const teamOption = interaction.options.getRole('team')?.id;
    const team = teamOption || submitter.teamSnowflake;
    const clear = interaction.options.getBoolean('clear');

    if (!teamOption && submitter.roleName !== "Captain" && submitter.roleName !== "Coach") {
        sendFailure(interaction, "You aren't a captain or coach, so you must specify the team you are submitting for.", deferred);
        return;
    }

    const matchupQuery = 'SELECT matchup.id, matchup.rigged_count, matchup.slots, matchup.left_team, matchup.right_team, team.id AS teamId FROM matchup \
         INNER JOIN week on matchup.week = week.id \
         INNER JOIN team on matchup.left_team = team.id \
         WHERE week.season = ? AND week.number = ? AND team.discord_snowflake = ? \
         UNION \
         SELECT matchup.id, matchup.rigged_count, matchup.slots, matchup.left_team, matchup.right_team, team.id AS teamId FROM matchup \
         INNER JOIN week on matchup.week = week.id \
         INNER JOIN team on matchup.right_team = team.id \
         WHERE week.season = ? AND week.number = ? AND team.discord_snowflake = ?';
    const matchup = await db.get(matchupQuery, currentSeason.number, currentSeason.current_week + 1, team, currentSeason.number, currentSeason.current_week + 1, team);

    if (!matchup) {
        sendFailure(interaction, `There are no weeks awaiting a lineup submission for ${roleMention(team)}.`, deferred);
        return;
    }

    const rosterQuery = 'SELECT player.id, player.discord_snowflake, player.stars, team.discord_snowflake AS teamSnowflake, role.name AS roleName FROM player \
                         INNER JOIN team ON player.team = team.id \
                         INNER JOIN role ON player.role = role.id \
                         WHERE team.discord_snowflake = ? \
                         ORDER BY stars DESC';
    const roster = await db.all(rosterQuery, team);

    lineup = lineup.map(player => roster.find(p => p.discord_snowflake === player.id) ?? { discord_snowflake: player.user.id });

    let failures = [];
    let prompts = [];

    if (matchup.rigged_count !== null && matchup.rigged_count !== riggedCount && !clear) {
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
            addModOverrideableFailure(userIsMod, failures, prompts, `You submitted ${userMention(player.discord_snowflake)} in your lineup, but they're not on ${roleMention(team)}`);
        }
        if (player.roleName === 'Coach') {
            addModOverrideableFailure(userIsMod, failures, prompts, `You submitted ${userMention(player.discord_snowflake)} in your lineup, but they're a coach and can't play.`);
        }
        if (lineup.findLastIndex(p => p.id === player.id) !== i) {
            addModOverrideableFailure(userIsMod, failures, prompts, `You submitted ${userMention(player.discord_snowflake)} multiple times in your lineup.`);
        }

        if (i >= riggedCount) {
            for (let j = i + 1; j < lineup.length; j++) {
                const lowerPlayer = lineup[j];

                if ((lowerPlayer.stars - player.stars) > 0.7) {
                    const playerIndex = roster.findIndex(p => p.id === player.id);
                    let nextStrongestPlayerIndex = playerIndex - 1;

                    while (roster[nextStrongestPlayerIndex].stars === player.stars || roster[nextStrongestPlayerIndex].roleName === "Coach") {
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
        prompts.push('You will clear the lineup submissions of both teams in the matchup.');
    }

    if (sendFailure(interaction, failures, deferred)) {
        return;
    }

    const confirmLabel = 'Confirm lineup submission';
    const confirmMessage = `Lineup submitted for ${roleMention(team)}.\n${riggedCount} rigged pairings.\n`.concat(lineup.map(player => userMention(player.discord_snowflake)).join('\n'));
    const cancelMessage = 'No lineup submitted.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage, true, true)) {
        if (clear) {
            await clearMatchup(matchup, interaction);
        }

        await commitLineup(matchup, riggedCount, lineup, submitter);
        await notifyOwnersIfAllLineupsIn();
    }
}

async function clearMatchup(matchup, interaction) {
    await db.run('DELETE FROM pairing WHERE matchup = ?', matchup.id);

    const otherTeam = matchup.left_team === matchup.teamId ? matchup.right_team : matchup.left_team;
    const otherTeamRole = (await db.all('SELECT discord_snowflake FROM team WHERE team = ?', otherTeam));

    const captainChannel = await channels.fetch(process.env.captainChannelId);
    await captainChannel.send({
        content: `${roleMention(otherTeamRole)}, ${interaction.user} just wiped your lineup submission so you'll have to resubmit.`,
        allowedMentions: { roles: [otherTeamRole] }
    });
}

export async function commitLineup(matchup, riggedCount, lineup, submitter) {
    const side = (matchup.left_team === matchup.teamId) ? 'left' : 'right';
    await db.run(`UPDATE matchup SET rigged_count = ?, slots = ?, ${side}_submitter = ? WHERE id = ?`, riggedCount, lineup.length, submitter.id, matchup.id);

    const pairings = await db.all('SELECT id FROM pairing WHERE matchup = ? ORDER BY slot ASC', matchup.id);

    if (pairings.length > 0) {
        for (const index in pairings) {
            await db.run(`UPDATE pairing SET ${side}_player = ${lineup[index].id} WHERE id = ${pairings[index].id}`)
        }
    }
    else {
        await db.run(`INSERT INTO pairing (matchup, slot, ${side}_player) VALUES `.concat(lineup.map((player, index) => `(${matchup.id}, ${index + 1}, ${player.id})`).join(', ')));
    }
}

async function notifyOwnersIfAllLineupsIn() {
    if ((await getMatchupsMissingLineups(currentSeason.current_week)).length === 0) {
        const captainChannel = await channels.fetch(process.env.captainChannelId);
        await captainChannel.send({
            content: `${roleMention(process.env.ownerRoleId)} all lineups are in -- run /season next_week when you've confirmed.`,
            allowedMentions: { parse: ['roles'] }
        });
    }
}

export async function getMatchupsMissingLineups() {
    const matchupsMissingLineupsQuery =
        'SELECT team.id AS teamId, team.discord_snowflake AS delinquentTeamSnowflake, matchup.left_team, matchup.right_team, matchup.slots, matchup.rigged_count FROM matchup \
         LEFT JOIN pairing ON pairing.matchup = matchup.id \
         INNER JOIN team ON team.id = matchup.left_team \
         WHERE pairing.left_player IS NULL \
         UNION ALL \
         SELECT team.id, team.discord_snowflake, matchup.left_team, matchup.right_team, matchup.slots AS matchupSlots, matchup.rigged_count FROM matchup \
         LEFT JOIN pairing ON pairing.matchup = matchup.id \
         INNER JOIN team ON team.id = matchup.right_team \
         WHERE pairing.right_player IS NULL';
    return await db.all(matchupsMissingLineupsQuery);
}

async function substitutePlayer(interaction, userIsMod) {
    const replacedPlayer = interaction.options.getMember('replaced_player');
    const newPlayer = interaction.options.getMember('new_player');
    const extension = interaction.options.getBoolean('extension');
    const week = extension ? currentSeason.current_week - 1 : currentSeason.current_week;

    const matchupQuery = 'SELECT matchup.id, matchup.slots, matchup.left_team, matchup.right_team, matchup.room, matchup.channel_message, team.id AS teamId, team.discord_snowflake AS teamSnowflake FROM matchup \
         INNER JOIN week on matchup.week = week.id \
         INNER JOIN team on matchup.left_team = team.id \
         WHERE week.season = ? AND week.number = ? AND team.id = (SELECT team FROM player WHERE player.discord_snowflake = ?) \
         UNION \
         SELECT matchup.id, matchup.slots, matchup.left_team, matchup.right_team, matchup.room, matchup.channel_message, team.id AS teamId, team.discord_snowflake AS teamSnowflake FROM matchup \
         INNER JOIN week on matchup.week = week.id \
         INNER JOIN team on matchup.right_team = team.id \
         WHERE week.season = ? AND week.number = ? AND team.id = (SELECT team FROM player WHERE player.discord_snowflake = ?)';
    const matchup = await db.get(matchupQuery, currentSeason.number, week, replacedPlayer.user.id, currentSeason.number, week, replacedPlayer.user.id);

    const side = (matchup.left_team === matchup.teamId) ? 'left' : 'right';

    const playersQuery = `SELECT player.id, player.stars, player.discord_snowflake, pairing.slot, pairing.predictions_message, team.discord_snowflake AS teamSnowflake, role.name AS roleName FROM player \
                          LEFT JOIN pairing on pairing.${side}_player = player.id AND pairing.matchup = ? \
                          INNER JOIN team ON team.id = player.team \
                          INNER JOIN role ON role.id = player.role \
                          WHERE (player.discord_snowflake = ? OR player.discord_snowflake = ?)`;
    const players = await db.all(playersQuery, matchup.id, replacedPlayer.user.id, newPlayer.user.id);

    const newPlayerData = players.find(p => p.discord_snowflake === newPlayer.user.id);
    const replacedPlayerData = players.find(p => p.discord_snowflake === replacedPlayer.user.id);

    let failures = [];
    let prompts = [];

    // TODO: known bug where we won't find the player if they've been put on the wrong team's lineup by a mod on purpose
    if (!replacedPlayerData.slot) {
        failures.push(`You're subbing out ${replacedPlayer.user} but they don't seem to be playing this week.`);
    }
    if (!interaction.member.roles.cache.has(replacedPlayerData.teamSnowflake)) {
        addModOverrideableFailure(userIsMod, failures, prompts, `You're subbing out ${replacedPlayer.user}, who is on the ${roleMention(replacedPlayerData.teamSnowflake)}, but you aren't on that team.`);
    }
    if (newPlayerData.slot) {
        addModOverrideableFailure(userIsMod, failures, prompts, `You're subbing in ${newPlayer.user}, but they're already playing in slot ${newPlayerData.slot}.`);
    }
    if (newPlayerData.teamSnowflake !== replacedPlayerData.teamSnowflake) {
        addModOverrideableFailure(userIsMod, failures, prompts, `You're subbing in ${newPlayer.user} over ${replacedPlayer.user}, but they're not on ${replacedPlayer.user}'s ${roleMention(replacedPlayerData.teamSnowflake)}`);
    }
    if (newPlayerData.roleName === 'Coach') {
        addModOverrideableFailure(userIsMod, failures, prompts, `You're subbing in ${newPlayer.user}, but they're a coach and can't play.`);
    }
    if ((newPlayerData.stars - replacedPlayerData.stars) > 0.7) {
        addModOverrideableFailure(userIsMod, failures, prompts, `You're subbing in ${newPlayer.user} over ${replacedPlayer.user}, but the star rules don't permit that.`);
    }

    if (sendFailure(interaction, failures)) {
        return;
    }

    const confirmLabel = 'Confirm substitution';
    const confirmMessage = `${newPlayer.user} subbed in over ${replacedPlayer.user}`;
    const cancelMessage = 'No substitution performed.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run(`UPDATE pairing SET ${side}_player = ? WHERE matchup = ? AND slot = ?`, newPlayerData.id, matchup.id, replacedPlayerData.slot);

        const matchRoom = await channels.fetch(eval(`process.env.matchChannel${matchup.room}Id`));
        const channelMessage = await matchRoom.messages.fetch({ message: matchup.channel_message, force: true });
        const newChannelContent = channelMessage.content.replace(replacedPlayerData.discord_snowflake, newPlayerData.discord_snowflake);
        await channelMessage.edit(newChannelContent);

        const predictionsRoom = await channels.fetch(process.env.predictionsChannelId);
        const predictionsMessage = await predictionsRoom.messages.fetch({ message: replacedPlayerData.predictions_message, force: true });
        const newPredictionContent = predictionsMessage.content.replace(replacedPlayerData.discord_snowflake, newPlayerData.discord_snowflake);
        await predictionsMessage.edit(newPredictionContent);
    }
}