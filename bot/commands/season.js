import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention, bold, codeBlock } from 'discord.js';
import { confirmAction, sendFailure } from './util.js';
import { db, currentSeason, channels, mushiLeagueGuild } from '../globals.js';
import { commitLineup, getMatchupsMissingLineups } from './lineup.js';
import { getOpenPairings } from './match.js';

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
                .setName('calculate_standings')
                .setDescription('calculates the new team and player standings, handles making the next playoff round as well'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('next_week')
                .setDescription('starts the next week: make new match rooms, post predictions, make extension rooms')),

    async execute(interaction) {
        switch (interaction.options.getSubcommand()) {
            case 'new':
                await newSeason(interaction);
                break;
            case 'calculate_standings':
                await calculateStandings(interaction);
                break;
            case 'next_week':
                await nextWeek(interaction);
                break;
        }
    }
}

async function calculateStandings(interaction) {
    let prompts = [], failures = [];

    const standingsSoFar = await db.get('SELECT wins, losses, ties FROM standing WHERE season = ? LIMIT 1', currentSeason.number);
    let nextStandingsWeek = standingsSoFar.wins + standingsSoFar.losses + standingsSoFar.ties + 1;

    const pairingsNeedingExtension = await getOpenPairings(nextStandingsWeek);

    // because we stop updating standings for playoff, but you're never doing calculate_standings after next_week in playoff
    if (nextStandingsWeek >= currentSeason.regular_weeks) {
        nextStandingsWeek = currentSeason.current_week;
    }

    // known shortcoming: playoffs are held up until all matches finish, including ones with no effect on playoffs
    if (pairingsNeedingExtension.length > 0) {
        failures.push('There are unresolved games left in the week.');
    }
    if (nextStandingsWeek >= currentSeason.regular_weeks) {
        prompts.push('This will also ping captains to submit lineups for the next round of playoffs.');
    }

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm update standings';
    const confirmMessage = 'Standings updated.';
    const cancelMessage = 'Standings not updated.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        const pairings = await getPairingResults(nextStandingsWeek);
        let teamWins = {};

        for (const pairing of pairings) {
            if (!pairing.dead) {
                teamWins[pairing.winningTeam] = (teamWins[pairing.winningTeam] || 0) + 1;
            }

            //await updatePlayerStats(pairing);
        };
        
        if (nextStandingsWeek <= currentSeason.regular_weeks) {
            await updateStandings(teamWins, nextStandingsWeek);
            const standings = await getStandings();
            await postStandings(nextStandingsWeek, standings);

            if (nextStandingsWeek === currentSeason.regular_weeks) {
                await setUpPlayoff(standings);
            }
        }
        else {
            await advancePlayoffWinners(teamWins);
        }
    }
}

async function getPairingResults(nextStandingsWeek) {
    const pairingsQuery =
        'SELECT winningPlayer.id AS winningId, winningPlayer.stars AS winningStars, winningPlayer.team AS winningTeam, \
                losingPlayer.id AS losingId, losingPlayer.stars AS losingStars, losingPlayer.team AS losingTeam, pairing.game1, pairing.dead FROM pairing \
         INNER JOIN player AS winningPlayer ON winningPlayer.id = IIF(pairing.winner = pairing.left_player, pairing.left_player, pairing.right_player) \
         INNER JOIN player AS losingPlayer ON losingPlayer.id = IIF(pairing.winner = pairing.left_player, pairing.right_player, pairing.left_player) \
         INNER JOIN matchup ON matchup.id = pairing.matchup \
         INNER JOIN week ON week.id = matchup.week \
         WHERE week.number = ? AND week.season = ?';
    return await db.all(pairingsQuery, nextStandingsWeek, currentSeason.number);
}

function getSpread(winningStars, losingStars) {
    const x = winningStars - losingStars;

    if (x > 1) return 5;
    if (x < -1) return 15;
    return 10;
}

async function updatePlayerStats(pairing) {
    if (pairing.dead) {
        await db.run('UPDATE pstat SET ties = ties + 1 WHERE season = ? AND (player = ? OR player = ?)', currentSeason.number, pairing.winningId, pairing.losingId);
    }
    else if (!pairing.game1) {
        await db.run('UPDATE pstat SET act_wins = act_wins + 1 WHERE season = ? AND player = ?', currentSeason.number, pairing.winningId);
        await db.run('UPDATE pstat SET act_losses = act_losses + 1 WHERE season = ? AND player = ?', currentSeason.number, pairing.losingId);
    }
    else {
        const spread = getSpread(pairing.winningStars, pairing.losingStars);
        await db.run('UPDATE pstat SET wins = wins + 1, star_points = star_points + ? WHERE season = ? AND player = ?', spread, currentSeason.number, pairing.winningId);
        await db.run('UPDATE pstat SET losses = losses + 1, star_points = star_points - ? WHERE season = ? AND player = ?', spread, currentSeason.number, pairing.losingId);
    }
}

async function getMatchups(nextStandingsWeek) {
    const matchupsQuery =
        'SELECT leftTeam.id AS leftId, leftTeam.discord_snowflake AS leftSnowflake, rightTeam.id AS rightId, rightTeam.discord_snowflake AS rightSnowflake FROM matchup \
         INNER JOIN team AS leftTeam ON leftTeam.id = matchup.left_team \
         INNER JOIN team AS rightTeam ON rightTeam.id = matchup.right_team \
         INNER JOIN week ON matchup.week = week.id \
         WHERE week.number = ? AND week.season = ? \
         ORDER BY matchup.room';
    return await db.all(matchupsQuery, nextStandingsWeek, currentSeason.number);
}

async function updateStandings(teamWins, nextStandingsWeek) {
    const matchups = await getMatchups(nextStandingsWeek);

    for (const matchup of matchups) {
        const differential = teamWins[matchup.leftId] - teamWins[matchup.rightId];
        if (differential > 0) {
            await db.run('UPDATE standing SET wins = wins + 1, points = points + 3, battle_differential = battle_differential + ? WHERE season = ? AND team = ?', differential, currentSeason.number, matchup.leftId);
            await db.run('UPDATE standing SET losses = losses + 1, battle_differential = battle_differential - ? WHERE season = ? AND team = ?', differential, currentSeason.number, matchup.rightId);
        }
        else if (differential < 0) {
            await db.run('UPDATE standing SET wins = wins + 1, points = points + 3, battle_differential = battle_differential + ? WHERE season = ? AND team = ?', differential, currentSeason.number, matchup.rightId);
            await db.run('UPDATE standing SET losses = losses + 1, battle_differential = battle_differential - ? WHERE season = ? AND team = ?', differential, currentSeason.number, matchup.leftId);
        }
        else {
            await db.run('UPDATE standing SET ties = ties + 1, points = points + 1 WHERE season = ? AND (team = ? OR team = ?)', currentSeason.number, matchup.leftId, matchup.rightId);
        }
    };
}

async function getStandings() {
    const standingsQuery = 'SELECT team.id AS teamId, team.discord_snowflake AS teamSnowflake, team.name AS teamName, standing.wins, standing.losses, standing.ties, standing.battle_differential, standing.points FROM standing \
                            INNER JOIN team ON team.id = standing.team \
                            WHERE season = ? \
                            ORDER BY standing.points DESC, standing.battle_differential DESC';

    return await db.all(standingsQuery, currentSeason.number);
}

async function postStandings(nextStandingsWeek, standings) {
    const mainRoom = await channels.fetch(process.env.mainRoomId);

    const standingsText = bold(`Standings at the end of week ${nextStandingsWeek}:\n\n`)
        .concat(
            codeBlock(''.concat(
                ' Rank | Points |  BD  | W | L | T | Team \n',
                '------|--------|------|---|---|---|------\n',
                standings.map((standing, index) => prettyTextStanding(index + 1, standing)).join('\n')
            )
        )
    );

    await mainRoom.send(standingsText);
}

function prettyTextStanding(rank, standing) {
    return `${rightAlign(6, rank)}|${rightAlign(8, standing.points)}|${rightAlign(6, standing.battle_differential)}|${rightAlign(3, standing.wins)}|${rightAlign(3, standing.losses)}|${rightAlign(3, standing.ties)}| ${standing.teamName}`;
}

function rightAlign(space, value) {
    return `${value} `.padStart(space, ' ');
}

async function setUpPlayoff(standings) {
    // I'm sure there's an algorithm but I do not feel like figuring it out right now
    if (currentSeason.playoff_size === 4) {
        const playoffQuery = 'INSERT INTO matchup (room, week, left_team, right_team) \
                              VALUES (?, (SELECT id FROM week WHERE number = ? AND season = ?), ?, ?)';
        await db.run(playoffQuery, 'sf1', currentSeason.current_week + 1, currentSeason.number, standings[0].teamId, standings[3].teamId);
        await db.run(playoffQuery, 'sf2', currentSeason.current_week + 1, currentSeason.number, standings[1].teamId, standings[2].teamId);
    }

    await hideAllRegularRooms();
    await announceNextPlayoffRound();
}

async function hideAllRegularRooms() {
    const allTeamSnowflakes = (await db.all('SELECT discord_snowflake FROM team')).map(team => team.discord_snowflake);

    for (let i = 1; i < 6; i++) {
        const matchRoom = await channels.fetch(eval(`process.env.matchChannel${pairingSet[0].room}Id`));

        const permissionOverwrites = matchRoom.permissionOverwrites.cache
            .filter(overwrite => !allTeamSnowflakes.includes(overwrite.id))

        matchRoom.permissionOverwrites.set(permissionOverwrites);
    }
}

async function advancePlayoffWinners(teamWins) {
    const matchups = await getMatchups(currentSeason.current_week);
    const winners = [];

    matchups.forEach(matchup => {
        const differential = teamWins[matchup.leftId] - teamWins[matchup.rightId];

        if (differential > 0) {
            winners.push(matchup.leftId);
        }
        else {
            winners.push(matchup.rightId);
        }
    });

    if (winners.length === 1) {
        await declareWinner(winners[0]);
    }
    // again, i'm sure there's an algorithm, but I don't feel like figuring it out right now.
    else if (winners.length === 2) {
        const playoffQuery = 'INSERT INTO matchup (room, week, left_team, right_team) \
                              VALUES(?, (SELECT id FROM week WHERE number = ? AND season = ?), ?, ?)';
        await db.run(playoffQuery, 'finals', currentSeason.current_week + 1, currentSeason.number, winners[0], winners[1]);
        announceNextPlayoffRound();
    }
}

async function announceNextPlayoffRound() {
    const mainRoom = await channels.fetch(process.env.mainRoomId);

    const nextRoundMatchups = await getMatchups(currentSeason.current_week + 1);
    const playoffAnnouncement = 'Next playoff round will be:\n\n'.concat(
        ...nextRoundMatchups.map(matchup => `${roleMention(matchup.leftSnowflake)} vs ${roleMention(matchup.rightSnowflake)}\n`),
        '\nWork out your slot counts with the opposing captain, and submit lineups with /lineup submit.'
    );

    await mainRoom.send({
        content: playoffAnnouncement,
        allowedMentions: { parse: ['roles'] }
    });
}

async function declareWinner(winner) {
    const winnerRole = (await db.get('SELECT discord_snowflake FROM team WHERE id = ?', winner)).discord_snowflake;

    await announceWinner(winnerRole);
    await makeWinnerRole(winnerRole);
}

async function announceWinner(winner) {
    const mainRoom = await channels.fetch(process.env.mainRoomId);
    const winnerAnnouncement = bold(`@everyone Congratulations to the ${roleMention(winner)} for winning Mushi League ${currentSeason.number}!`);
    mainRoom.send({
        content: winnerAnnouncement,
        allowedMentions: { parse: ['everyone', 'roles'] }
    });
}

async function makeWinnerRole(winner) {
    const color = (await mushiLeagueGuild.roles.fetch(winner)).hexColor;
    const lastWinnerPosition = (await mushiLeagueGuild.roles.cache.find(r => r.name === `Season ${currentSeason.number - 1} Winner`)).position;

    const winnerRole = await mushiLeagueGuild.roles.create({
        name: `Season ${currentSeason.number} winner`,
        color: color,
        position: lastWinnerPosition + 1,
    });

    const playersQuery = 'SELECT discord_snowflake FROM player \
                          WHERE player.team = (SELECT id FROM team WHERE discord_snowflake = ?)';
    const players = (await db.all(playersQuery, winner)).map(player => player.discord_snowflake);
    const members = await mushiLeagueGuild.members.fetch({ user: players });

    members.forEach(member => member.roles.add(winnerRole));
}

async function nextWeek(interaction) {
    let prompts = [], failures = [];

    const pairingsNeedingExtension = await getOpenPairings(currentSeason.current_week);
    const matchupsMissingLineups = await getMatchupsMissingLineups();

    pairingsNeedingExtension.forEach(pairing => {
        prompts.push(`(${roleMention(pairing.leftTeamSnowflake)}) ${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(pairing.rightPlayerSnowflake)} (${roleMention(pairing.rightTeamSnowflake)}) will be granted an extension`);
    });

    matchupsMissingLineups.forEach(matchup => {
        prompts.push(`${roleMention(matchup.delinquentTeamSnowflake)} hasn't submitted their lineup yet`.concat(
            matchup.rigged_count > 0 ? ' and their opponent said they were rigging pairings.' : ''
        ));
    });

    if (sendFailure(interaction, failures)) return;

    const confirmLabel = 'Confirm advance week';
    const confirmMessage = 'New week begun.';
    const cancelMessage = 'New week not begun.';

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await advanceCurrentWeek();
        await updateMatchReportsHeader();
        await createExtensionRooms(pairingsNeedingExtension);
        for (const matchup of matchupsMissingLineups) {
            await autoGenerateLineup(matchup);
        }
        const groupedPairings = groupPairingsByRoom(await getNextPairings());
        await updateMatchRooms(groupedPairings);
        await postPredictions(groupedPairings);
        await postScheduling(groupedPairings);
    }
}

async function advanceCurrentWeek() {
    currentSeason.current_week += 1;
    await db.run('UPDATE season SET current_week = ? WHERE number = ?', currentSeason.current_week, currentSeason.number);
}

async function updateMatchReportsHeader() {
    const matchReportChannel = await channels.fetch(process.env.matchReportChannelId);

    const oldHeader = (await matchReportChannel.messages.fetchPinned()).values().next().value;
    await matchReportChannel.messages.unpin(oldHeader.id);

    const weekHeader = await matchReportChannel.send(bold(`----- ${weekName()} games -----`));
    await matchReportChannel.messages.pin(weekHeader.id);
}

function weekName() {
    if (currentSeason.current_week <= currentSeason.regular_weeks) {
        return `Week ${currentSeason.current_week}`;
    }

    const totalWeeks = currentSeason.regular_weeks + Math.ceil(Math.log2(currentSeason.playoff_size));
    switch (currentSeason.current_week) {
        case totalWeeks: return 'Finals';
        case totalWeeks - 1: return 'Semifinals';
        case totalWeeks - 2: return 'Quarterfinals';
        default: return 'go yell at jumpy to fix this';
    }
}

async function createExtensionRooms(pairingsNeedingExtension) {
    for (const pairingSet of groupPairingsByRoom(pairingsNeedingExtension).values()) {
        const extensionRoom = await createExtensionRoom(pairingSet);
        await notifyPairings(pairingSet, extensionRoom);
    };
}

function groupPairingsByRoom(pairings) {
    let pairingsByRoom = new Map();

    pairings.forEach(pairing => {
        pairingsByRoom.set(pairing.matchup, (pairingsByRoom.get(pairing.matchup) || []).concat([pairing]));
    });

    return pairingsByRoom;
}

async function createExtensionRoom(pairings) {
    const matchRoomName = await getMatchRoomName(pairings[0].matchup);
    const matchRoom = await channels.cache.find(channel => channel.name === matchRoomName);

    return await matchRoom.clone({
        name: `extension-${matchRoomName}`
    });
}

async function getMatchRoomName(matchupId) {
    const matchRoomQuery = 'SELECT leftTeam.name AS leftTeamName, rightTeam.name AS rightTeamName, room FROM matchup \
                            INNER JOIN team AS leftTeam ON leftTeam.id = matchup.left_team \
                            INNER JOIN team AS rightTeam ON rightTeam.id = matchup.right_team \
                            WHERE matchup.id = ?';
    const matchup = await db.get(matchRoomQuery, matchupId);

    return `${matchup.room}-${initials(matchup.leftTeamName)}-vs-${initials(matchup.rightTeamName)}`;
}

function initials(name) {
    return name.split(' ').map(word => word[0]).join('').toLowerCase();
}

async function notifyPairings(pairingSet, extensionRoom) {
    const extensionMessage = `${roleMention(pairingSet[0].leftTeamSnowflake)} vs ${roleMention(pairingSet[0].rightTeamSnowflake)}\n\n`.concat(
        ...pairingSet.map(pairing => `${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(pairing.rightPlayerSnowflake)}\n`),
        '\nGet your games done. You have 24 hours.'
    );

    const extensionPost = await extensionRoom.send({
        content: extensionMessage,
        allowedMentions: { parse: ['users'] }
    });

    await extensionPost.pin();
}

async function autoGenerateLineup(matchup, interaction) {
    const slots = matchup.slots || 5;
    const lineup = await db.all('SELECT id FROM player WHERE team = ? AND role != 3 ORDER BY stars DESC LIMIT ?', matchup.teamId, slots);
    const submitter = await db.get('SELECT id FROM player WHERE discord_snowflake = ?', interaction.user.id);
    await commitLineup(matchup, matchup.rigged_count, lineup, submitter);
}

async function getNextPairings() {
    const pairingQuery = 'SELECT pairing.id, pairing.matchup, pairing.slot, matchup.room, leftPlayer.discord_snowflake AS leftPlayerSnowflake, leftTeam.discord_snowflake AS leftTeamSnowflake, leftTeam.emoji AS leftEmoji, \
                          rightPlayer.discord_snowflake AS rightPlayerSnowflake, rightTeam.discord_snowflake AS rightTeamSnowflake, rightTeam.emoji AS rightEmoji FROM pairing \
                          INNER JOIN matchup ON pairing.matchup = matchup.id \
                          INNER JOIN week ON matchup.week = week.id \
                          INNER JOIN team AS leftTeam ON matchup.left_team = leftTeam.id \
                          INNER JOIN team AS rightTeam ON matchup.right_team = rightTeam.id \
                          INNER JOIN player AS leftPlayer ON pairing.left_player = leftPlayer.id \
                          INNER JOIN player AS rightPlayer ON pairing.right_player = rightPlayer.id \
                          WHERE week.number = ? AND week.season = ? \
                          ORDER BY room ASC, slot ASC';

    return await db.all(pairingQuery, currentSeason.current_week, currentSeason.number);
}

async function updateMatchRooms(groupedPairings) {
    for (const pairingSet of groupedPairings.values()) {
        const matchRoomName = await getMatchRoomName(pairingSet[0].matchup);
        const matchRoom = await channels.fetch(eval(`process.env.matchChannel${pairingSet[0].room}Id`));

        await setUpRoom(pairingSet, matchRoomName, matchRoom);
        await postPairingMessage(pairingSet, matchRoom);
    }
}

async function setUpRoom(pairingSet, matchRoomName, matchRoom) {
    await matchRoom.setName(matchRoomName);
    const allTeamSnowflakes = (await db.all('SELECT discord_snowflake FROM team')).map(team => team.discord_snowflake);

    if (pairingSet[0].room === parseInt(pairingSet[0].room)) {
        await setUpRegularRoom(pairingSet, matchRoom, allTeamSnowflakes);
    }
    else {
        await setUpPlayoffRoom(pairingSet, matchRoom, allTeamSnowflakes);
    }
}

async function setUpRegularRoom(pairingSet, matchRoom, allTeamSnowflakes) {
    const permissionOverwrites = matchRoom.permissionOverwrites.cache
        .map(overwrite => ({ id: overwrite.id, deny: overwrite.deny, allow: overwrite.allow }))
        .filter(overwrite => !allTeamSnowflakes.includes(overwrite.id))
        .concat([
            {
                id: pairingSet[0].leftTeamSnowflake,
                allow: PermissionFlagsBits.ViewChannel
            },
            {
                id: pairingSet[0].rightTeamSnowflake,
                allow: PermissionFlagsBits.ViewChannel
            },
        ]);

    await matchRoom.permissionOverwrites.set(permissionOverwrites);
}

async function setUpPlayoffRoom(pairingSet, matchRoom, allTeamSnowflakes) {
    const permissionOverwrites = matchRoom.permissionOverwrites.cache
        .map(overwrite => ({ id: overwrite.id, deny: overwrite.deny, allow: overwrite.allow }))
        .filter(overwrite => !allTeamSnowflakes.includes(overwrite.id))
        .concat([
            {
                id: pairingSet[0].leftTeamSnowflake,
                allow: PermissionFlagsBits.SendMessages
            },
            {
                id: pairingSet[0].rightTeamSnowflake,
                allow: PermissionFlagsBits.SendMessages
            },
        ]);

    await matchRoom.permissionOverwrites.set(permissionOverwrites);

    // TO DO: move channels into active section. The code to finagle positions is stupid.
}

async function postPairingMessage(pairingSet, matchRoom) {
    const pairingMessage = `${roleMention(pairingSet[0].leftTeamSnowflake)} vs ${roleMention(pairingSet[0].rightTeamSnowflake)}\n\n`.concat(
        ...pairingSet.map(pairing => `${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(pairing.rightPlayerSnowflake)}\n`),
        '\n',
        rules
    );

    const pairingPost = await matchRoom.send({
        content: pairingMessage,
        allowedMentions: { parse: ['roles', 'users'] }
    });

    await pairingPost.pin();
    await db.run('UPDATE matchup SET channel_message = ? WHERE id = ?', pairingPost.id, pairingSet[0].matchup);
}

const rules = 'A few rules to remember:\n' +
              '\n' +
              'Deadline is 11:59 PM Sunday GMT - 7\n' +
              'Schedule in this room only for maximum transparency.\n' +
              'You must attempt scheduling before the weekend to be eligible for an activity win\n' +
              'All replays MUST be posted in this channel\n' +
              'We expect you to be helpful when scheduling with your opponent\n' +
              '\n' + 
              'GL HF!';

async function postPredictions(groupedPairings) {
    const predictionsChannel = await channels.fetch(process.env.predictionsChannelId);
    for (const pairingSet of groupedPairings.values()) {
        await postPredictionsForMatchup(predictionsChannel, pairingSet);
    }
}

async function postPredictionsForMatchup(predictionsChannel, pairingSet) {
    const headerMessage = `${pairingSet[0].leftEmoji} ${roleMention(pairingSet[0].leftTeamSnowflake)} vs ${roleMention(pairingSet[0].rightTeamSnowflake)} ${pairingSet[0].rightEmoji}\n \
                                           Current score: 0-0`;
    await sendPredictionMessage(predictionsChannel, headerMessage, pairingSet[0].leftEmoji, pairingSet[0].rightEmoji, pairingSet[0].matchup);

    for (const pairing of pairingSet) {
        const pairingMessage = `${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(pairing.rightPlayerSnowflake)}`;
        await sendPredictionMessage(predictionsChannel, pairingMessage, pairing.leftEmoji, pairing.rightEmoji, null, pairing.id);
    }
}

async function sendPredictionMessage(predictionsChannel, content, leftEmoji, rightEmoji, matchupId, pairingId) {
    const message = await predictionsChannel.send({
        content: content,
        allowedMentions: { parse: [] }
    });
    await message.react(leftEmoji);
    await message.react(rightEmoji);
    if (matchupId) {
        await db.run('UPDATE matchup SET predictions_message = ? WHERE id = ?', message.id, matchupId);
    }
    if (pairingId) {
        await db.run('UPDATE pairing SET predictions_message = ? WHERE id = ?', message.id, pairingId);
    }
}

export async function postScheduling(groupedPairings) {
    const content = writeAllPairings(groupedPairings);

    const mainRoom = await channels.fetch(process.env.mainRoomId);
    const message = await mainRoom.send({
        content: content,
        allowedMentions: { parse: [] }
    });
    await db.run('UPDATE week SET schedule_post = ? WHERE season = ? AND number = ?', message.id, currentSeason.number, currentSeason.current_week);
}

function writeAllPairings(groupedPairings) {
    let content = 'Scheduled times:';

    for (const pairingSet of groupedPairings.values()) {
        content = content.concat(
            `\n\n${roleMention(pairingSet[0].leftTeamSnowflake)} vs ${roleMention(pairingSet[0].rightTeamSnowflake)}\n`,
            ...pairingSet.map(pairing => `\n${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(pairing.rightPlayerSnowflake)}:`)
        );
    }

    return content;
}