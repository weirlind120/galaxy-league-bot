import { SlashCommandBuilder, PermissionFlagsBits, bold } from 'discord.js';
import { channels, currentSeason } from '../globals.js'
import { getNextPairings, groupPairingsByRoom, postPredictions } from './season.js';

export const TEST_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('secret command for jumpy to test arbitrary code DO NOT USE')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const matchReportChannel = await channels.fetch(process.env.matchReportChannelId);
        await matchReportChannel.send(bold(`----- ${weekName()} games -----`));

        await interaction.reply({ content: 'done', ephemeral: true });
    }
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