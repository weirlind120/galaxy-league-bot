import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention, bold, codeBlock } from 'discord.js';
import shuffle from 'lodash/shuffle.js';

import { rightAlign, weekName, baseHandler, wait } from './util.js';
import { commitLineup } from './lineup.js';

import { currentSeason, channels, mushiLeagueGuild, setCurrentSeason } from '../globals.js';

import { postPredictions, postPredictionStandings } from '../features/predictions.js';
import { postScheduling } from '../features/schedule.js';

import { saveNewSeason, saveAdvanceWeek } from '../../database/season.js';
import { saveNewWeeks } from '../../database/week.js';
import { saveMatchRoomMessageId, saveOneNewMatchup, loadAllMatchups, loadMatchupsMissingLineups, loadOldPairingMessage } from '../../database/matchup.js';
import { saveInitialStandings, loadStandingWeeksSoFar, loadStandings, saveStandingsUpdate, loadTopTeams } from '../../database/standing.js';
import { loadTeams, loadActiveTeams, loadTeam } from '../../database/team.js';
import { saveDropAllPlayers, saveStarPointsToRatings, loadAllPlayersOnTeam, loadPlayerFromSnowflake, loadPlayersOnTeamInStarOrder, loadAllActivePlayers } from '../../database/player.js';
import { loadAllPairings, loadAllPairingResults, loadOpenPairings } from '../../database/pairing.js';
import { savePlayerStatUpdate } from '../../database/pstat.js';

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

async function newSeason(interaction) {
    async function dataCollector(interaction) {
        const length = interaction.options.getNumber('length');
        const playoffSize = interaction.options.getNumber('playoff_size');

        return { length, playoffSize };
    }

    function verifier(data) {
        let prompts = [], failures = [];

        prompts.push('This will create a new season. ARE YOU SURE?');

        const confirmLabel = 'Confirm new season';
        const confirmMessage = 'New season begun.';
        const cancelMessage = 'No new season begun.';

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { length, playoffSize } = data;
        await dropAllPlayers();
        await saveStarPointsToRatings(currentSeason.number);
        await makeSeasonAndWeeks(currentSeason.number + 1, length, playoffSize);
        await makeRegSeasonPairings(currentSeason.number + 1, length);
        await saveInitialStandings(currentSeason.number + 1);

        setCurrentSeason();
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}

async function dropAllPlayers() {
    const allRemovableRoles = new Set([
        ...(await loadActiveTeams()).map(x => x.discord_snowflake),
        process.env.captainRoleId,
        process.env.coachRoleId,
        process.env.playerRoleId
    ]);
    const allActivePlayers = await loadAllActivePlayers();
    for (const player of allActivePlayers) {
        try {
            const discordPlayer = await mushiLeagueGuild.members.fetch(player.discord_snowflake);
            const rolesToRemove = [...discordPlayer.roles.cache.keys()].filter(snowflake => allRemovableRoles.has(snowflake));
            discordPlayer.roles.remove(rolesToRemove);
        }
        catch (e) {
            // pass
		}
	}
    await saveDropAllPlayers();
}

async function makeSeasonAndWeeks(season, length, playoffSize) {
    await saveNewSeason(season, length, playoffSize);

    const totalLength = length + Math.ceil(Math.log2(playoffSize));
    await saveNewWeeks(totalLength, season);
}

async function makeRegSeasonPairings(season, length) {
    let teams = shuffle(await loadActiveTeams());

    for (let i = 0; i < length; i++) {
        await makeOneWeekOfPairings(season, teams, i + 1);
        cycleTeams(teams);
    }
}

async function makeOneWeekOfPairings(season, teams, week) {
    for (let i = 0; i < teams.length / 2; i++) {
        const leftTeam = teams[i];
        const rightTeam = teams[teams.length - 1 - i];

        await saveOneNewMatchup(i + 1, leftTeam.id, rightTeam.id, season, week);
    }
}

function cycleTeams(teams) {
    const secondTeam = teams[1];

    for (let i = 2; i < teams.length; i++) {
        teams[i - 1] = teams[i];
    }

    teams[teams.length - 1] = secondTeam;
}

async function calculateStandings(interaction) {
    async function dataCollector(interaction) {
        const standingsSoFar = await loadStandingWeeksSoFar(currentSeason.number);

        // because we stop updating standings for playoff, but you're never doing calculate_standings after next_week in playoff
        const nextStandingsWeek =
            standingsSoFar.standingsWeeks >= currentSeason.regular_weeks
                ? currentSeason.current_week
                : standingsSoFar.standingsWeeks + 1;

        const openPairings = await loadOpenPairings(currentSeason.number, nextStandingsWeek);

        return { nextStandingsWeek, openPairings };
    }

    function verifier(data) {
        const { nextStandingsWeek, openPairings } = data;
        let prompts = [], failures = [];

        // known shortcoming: playoffs are held up until all matches finish, including ones with no effect on playoffs
        if (openPairings.length > 0) {
            failures.push('There are unresolved games left in the week.');
        }

        if (nextStandingsWeek >= currentSeason.regular_weeks) {
            prompts.push('This will also ping captains to submit lineups for the next round of playoffs.');
        }

        const confirmLabel = 'Confirm update standings';
        const confirmMessage = 'Standings updated.';
        const cancelMessage = 'Standings not updated.';

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { nextStandingsWeek } = data;

        const pairings = await loadAllPairingResults(currentSeason.number, nextStandingsWeek);
        let teamWins = {};
        for (const team of await loadActiveTeams()) {
            teamWins[team.id] = 0;
		}

        for (const pairing of pairings) {
            if (!pairing.dead) {
                teamWins[pairing.winningTeam] = teamWins[pairing.winningTeam] + 1;
            }

            await savePlayerStatUpdate(currentSeason.number, pairing);
        };

        if (nextStandingsWeek <= currentSeason.regular_weeks) {
            await updateStandings(teamWins, nextStandingsWeek);
            const standings = await loadStandings(currentSeason.number);
            await postStandings(nextStandingsWeek, standings);

            if (nextStandingsWeek === currentSeason.regular_weeks) {
                await setUpPlayoff(standings, teamWins.size);
            }
        }
        else {
            await advancePlayoffWinners(teamWins);
        }

        await postPredictionStandings(currentSeason.number, nextStandingsWeek);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}

async function updateStandings(teamWins, nextStandingsWeek) {
    const matchups = await loadAllMatchups(currentSeason.number, nextStandingsWeek);

    for (const matchup of matchups) {
        const differential = teamWins[matchup.leftId] - teamWins[matchup.rightId];
        await saveStandingsUpdate(currentSeason.number, differential, matchup.leftId, matchup.rightId);
    };
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

async function setUpPlayoff(standings, numberOfTeams) {
    // I'm sure there's an algorithm but I do not feel like figuring it out right now
    if (currentSeason.playoff_size === 4) {
        await saveOneNewMatchup('sf1', standings[0].teamId, standings[3].teamId, currentSeason.number, currentSeason.current_week + 1);
        await saveOneNewMatchup('sf2', standings[1].teamId, standings[2].teamId, currentSeason.number, currentSeason.current_week + 1);
    }

    if (currentSeason.playoff_size === 6) {
        await saveOneNewMatchup('sf1', standings[2].teamId, standings[5].teamId, currentSeason.number, currentSeason.current_week + 1);
        await saveOneNewMatchup('sf2', standings[3].teamId, standings[4].teamId, currentSeason.number, currentSeason.current_week + 1);
	}

    await hideAllRegularRooms(numberOfTeams);
    await announceNextPlayoffRound();
}

async function hideAllRegularRooms(numberOfTeams) {
    const allTeamSnowflakes = (await loadTeams()).map(team => team.discord_snowflake);

    for (let i = 1; i <= numberOfTeams / 2; i++) {
        const matchRoom = await channels.fetch(eval(`process.env.matchChannel${i}Id`));

        const permissionOverwrites = matchRoom.permissionOverwrites.cache
            .filter(overwrite => !allTeamSnowflakes.includes(overwrite.id))

        matchRoom.permissionOverwrites.set(permissionOverwrites);
    }
}

async function advancePlayoffWinners(teamWins) {
    const matchups = await loadAllMatchups(currentSeason.number, currentSeason.current_week);
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

    if (weekName(currentSeason.current_week) === 'Finals') {
        await declareWinner(winners[0]);
	}
    if (weekName(currentSeason.current_week) === 'Semifinals') {
        if (currentSeason.playoff_size === 4 || currentSeason.playoff_size === 6) {
            await saveOneNewMatchup('finals', winners[0], winners[1], currentSeason.number, currentSeason.current_week + 1);
            await announceNextPlayoffRound();
		}
    }
    if (weekName(currentSeason.current_week) === 'Quarterfinals') {
        if (currentSeason.playoff_size === 6) {
            const byeTeams = await loadTopTeams(currentSeason.number, 2);
            await saveOneNewMatchup('sf1', byeTeams[0].teamId, winners[1], currentSeason.number, currentSeason.current_week + 1);
            await saveOneNewMatchup('sf2', byeTeams[1].teamId, winners[0], currentSeason.number, currentSeason.current_week + 1);
            await announceNextPlayoffRound();
		}
	}
}

async function announceNextPlayoffRound() {
    const mainRoom = await channels.fetch(process.env.mainRoomId);

    const nextRoundMatchups = await loadAllMatchups(currentSeason.number, currentSeason.current_week + 1);
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
    const winningTeamSnowflake = (await loadTeam(winner)).discord_snowflake;

    await announceWinner(winningTeamSnowflake);
    await makeWinnerRole(winner, winningTeamSnowflake);
}

async function announceWinner(winner) {
    const mainRoom = await channels.fetch(process.env.mainRoomId);
    const winnerAnnouncement = bold(`@everyone Congratulations to the ${roleMention(winner)} for winning Mushi League ${currentSeason.number}!`);
    mainRoom.send({
        content: winnerAnnouncement,
        allowedMentions: { parse: ['everyone', 'roles'] }
    });
}

async function makeWinnerRole(winningTeamId, winningTeamSnowflake) {
    const color = (await mushiLeagueGuild.roles.fetch(winningTeamSnowflake)).hexColor;
    const lastWinnerPosition = (await mushiLeagueGuild.roles.cache.find(r => r.name === `Season ${currentSeason.number - 1} Winner`))?.position;

    const winnerRole = await mushiLeagueGuild.roles.create({
        name: `Season ${currentSeason.number} Winner`,
        color: color,
        position: lastWinnerPosition ?? 0 + 1,
    });

    const players = (await loadAllPlayersOnTeam(winningTeamId)).map(player => player.discord_snowflake);
    const members = await mushiLeagueGuild.members.fetch({ user: players });

    members.forEach(member => member.roles.add(winnerRole));
}

async function nextWeek(interaction) {
    async function dataCollector(interaction) {
        const pairingsNeedingExtension = await loadOpenPairings(currentSeason.number, currentSeason.current_week);
        const matchupsMissingLineups = await loadMatchupsMissingLineups(currentSeason.number, currentSeason.current_week + 1);
        const userForAutoLineups = await loadPlayerFromSnowflake(interaction.user.id);

        return { pairingsNeedingExtension, matchupsMissingLineups, userForAutoLineups };
    }

    function verifier(data) {
        const { pairingsNeedingExtension, matchupsMissingLineups } = data;
        let prompts = [], failures = [];

        pairingsNeedingExtension.forEach(pairing => {
            prompts.push(`(${roleMention(pairing.leftTeamSnowflake)}) ${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(pairing.rightPlayerSnowflake)} (${roleMention(pairing.rightTeamSnowflake)}) will be granted an extension`);
        });

        matchupsMissingLineups.forEach(matchup => {
            prompts.push(`${roleMention(matchup.delinquentTeamSnowflake)} hasn't submitted their lineup yet`.concat(
                matchup.rigged_count > 0 ? ' and their opponent said they were rigging pairings.' : ''
            ));
        });

        const confirmLabel = 'Confirm advance week';
        const confirmMessage = 'New week begun.';
        const cancelMessage = 'New week not begun.';

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { pairingsNeedingExtension, matchupsMissingLineups, userForAutoLineups } = data;
        await advanceCurrentWeek();
        await updateMatchReportsHeader();
        await createExtensionRooms(pairingsNeedingExtension);
        for (const matchup of matchupsMissingLineups) {
            await autoGenerateLineup(matchup, userForAutoLineups);
        }
        const groupedPairings = groupPairingsByRoom(await loadAllPairings(currentSeason.number, currentSeason.current_week));
        await updateMatchRooms(groupedPairings);
        await postPredictions(groupedPairings);
        await postScheduling(groupedPairings);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}

async function advanceCurrentWeek() {
    await saveAdvanceWeek(currentSeason.number, currentSeason.current_week + 1);
    await setCurrentSeason();
}

async function updateMatchReportsHeader() {
    const matchReportChannel = await channels.fetch(process.env.matchReportChannelId);

    const oldHeader = (await matchReportChannel.messages.fetchPinned()).values().next().value;
    if (oldHeader) {
        await matchReportChannel.messages.unpin(oldHeader.id);
	}

    const weekHeader = await matchReportChannel.send(bold(`----- ${weekName(currentSeason.current_week)} games -----`));
    await matchReportChannel.messages.pin(weekHeader.id);
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
    const matchRoomName = getMatchRoomName(pairings[0]);
    const matchRoom = await channels.cache.find(channel => channel.name === matchRoomName);

    return await matchRoom.clone({
        name: `extension-${matchRoomName}`
    });
}

function getMatchRoomName(pairing) {
    return `${pairing.room}-${initials(pairing.leftTeamName)}-vs-${initials(pairing.rightTeamName)}`;
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

async function autoGenerateLineup(matchup, userForAutoLineups) {
    const slots = matchup.slots || currentSeason.min_lineup;
    const lineup = (await loadPlayersOnTeamInStarOrder(matchup.submittingTeamId)).slice(0, slots);
    await commitLineup(matchup, matchup.rigged_count, lineup, userForAutoLineups);
}

async function updateMatchRooms(groupedPairings) {
    for (const pairingSet of groupedPairings.values()) {
        wait(1000);
        const matchRoomName = getMatchRoomName(pairingSet[0]);
        const matchRoom = await channels.fetch(eval(`process.env.matchChannel${pairingSet[0].room}Id`));

        await setUpRoom(pairingSet, matchRoomName, matchRoom);
        await unpinOldPairingMessage(pairingSet[0].room, matchRoom);
        await postPairingMessage(pairingSet, matchRoom);
    }
}

async function setUpRoom(pairingSet, matchRoomName, matchRoom) {
    await matchRoom.setName(matchRoomName);
    const allTeamSnowflakes = (await loadTeams()).map(team => team.discord_snowflake);

    if (pairingSet[0].room == parseInt(pairingSet[0].room)) {
        await setUpRegularRoom(pairingSet, matchRoom, allTeamSnowflakes);
    }
    else {
        await setUpPlayoffRoom(pairingSet, matchRoom, allTeamSnowflakes);
    }
}

async function setUpRegularRoom(pairingSet, matchRoom, allTeamSnowflakes) {
    const permissionOverwrites = matchRoom.permissionOverwrites.cache
        .map(overwrite => ({ id: overwrite.id, deny: overwrite.deny, allow: overwrite.allow, type: overwrite.type }))
        .filter(overwrite => !allTeamSnowflakes.includes(overwrite.id))
        .concat([
            {
                id: pairingSet[0].leftTeamSnowflake,
                allow: PermissionFlagsBits.ViewChannel,
                type: 'role'
            },
            {
                id: pairingSet[0].rightTeamSnowflake,
                allow: PermissionFlagsBits.ViewChannel,
                type: 'role'
            },
        ]);

    await matchRoom.permissionOverwrites.set(permissionOverwrites);
}

async function setUpPlayoffRoom(pairingSet, matchRoom, allTeamSnowflakes) {
    const permissionOverwrites = matchRoom.permissionOverwrites.cache
        .map(overwrite => ({ id: overwrite.id, deny: overwrite.deny, allow: overwrite.allow, type: overwrite.type }))
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

async function unpinOldPairingMessage(room, matchRoom) {
    const oldPairingMessageId = (await loadOldPairingMessage(room)).channel_message;
    await matchRoom.messages.unpin(oldPairingMessageId);
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
    await saveMatchRoomMessageId(pairingPost.id, pairingSet[0].matchup);
}

const rules = 'A few rules to remember:\n' +
              '\n' +
              'Deadline is 11:59 PM Sunday GMT -7\n' +
              'Schedule in this room only for maximum transparency.\n' +
              'You must attempt scheduling before the weekend to be eligible for an activity win\n' +
              'All replays MUST be posted in this channel\n' +
              'We expect you to be helpful when scheduling with your opponent\n' +
              'Accuracy lowering moves (Sand Attack, Flash, Smokescreen, Mud-Slap, Kinesis, Muddy Water) are banned. Clicking one = immediate game loss.\n' +
              'Swagger is banned too. Clicking it = immediate game loss.\n' +
              '\n' + 
              'GL HF!';