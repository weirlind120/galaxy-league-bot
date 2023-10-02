import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention, bold, codeBlock } from 'discord.js';
import { channels, currentSeason, mushiLeagueGuild } from '../globals.js';
import { loadTeam } from '../../database/team.js';
import { loadAllPlayersOnTeam } from '../../database/player.js';
import { rightAlign } from './util.js';
import { postPredictionStandings, updatePrediction, changePredictionsPlayer, postPredictions } from '../features/predictions.js';
import { setScheduledTime, changeScheduledPlayer, postScheduling } from '../features/schedule.js';

export const TEST_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('secret command for jumpy to test arbitrary code DO NOT USE')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await postPredictionStandings(14, 8);

        await interaction.reply('done!');
    }
}