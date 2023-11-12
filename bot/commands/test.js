import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention, bold, codeBlock } from 'discord.js';
import { channels, currentSeason, mushiLeagueGuild } from '../globals.js';
import { loadTeam } from '../../database/team.js';
import { loadAllPlayersOnTeam } from '../../database/player.js';
import { rightAlign } from './util.js';
import { postPredictionStandings, updatePrediction, changePredictionsPlayer, postPredictions } from '../features/predictions.js';
import { setScheduledTime, changeScheduledPlayer, postScheduling } from '../features/schedule.js';
import { saveDraftSetup } from '../../database/draft.js';

export const TEST_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('secret command for jumpy to test arbitrary code DO NOT USE')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await saveDraftSetup(15, 15, [11, 15, 13, 9, 1, 3, 6, 8, 14, 12, 7, 4]);

        await interaction.reply({ content: 'done!', ephemeral: true });
    }
}