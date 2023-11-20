import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention, bold, codeBlock } from 'discord.js';
import { channels, currentSeason, mushiLeagueGuild } from '../globals.js';
import { loadTeam } from '../../database/team.js';
import { loadAllPlayersOnTeam } from '../../database/player.js';
import { rightAlign } from './util.js';
import { postPredictionStandings, updatePrediction, changePredictionsPlayer, postPredictions } from '../features/predictions.js';
import { loadStandings } from '../../database/standing.js';
import { setScheduledTime, changeScheduledPlayer, postScheduling } from '../features/schedule.js';
import { saveDraftSetup } from '../../database/draft.js';

export const TEST_COMMAND = {
	data: new SlashCommandBuilder()
		.setName('test')
		.setDescription('secret command for jumpy to test arbitrary code DO NOT USE')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

	async execute(interaction) {
		const standings = await loadStandings(currentSeason.number);
		await postStandings(1, standings);
		await postPredictionStandings(currentSeason.number, 1);

		await interaction.reply({ content: 'done!', ephemeral: true });
	}
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