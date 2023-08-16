import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention, bold, codeBlock } from 'discord.js';
import { db, channels, currentSeason } from '../globals.js';
import { rightAlign } from './util.js';
import { savePredictions, changePredictionsPlayer, postPredictions, postPredictionStandings } from '../features/predictions.js';
import { setScheduledTime, changeScheduledPlayer, postScheduling } from '../features/schedule.js';

export const TEST_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('secret command for jumpy to test arbitrary code DO NOT USE')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await interaction.reply({ content: 'done', ephemeral: true });

        await postPredictionStandings(14, 1, 6, 4);
    }
}