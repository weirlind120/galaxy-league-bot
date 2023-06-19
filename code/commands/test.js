import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getNextPairings, groupPairingsByRoom, postPredictions } from './season.js';

export const TEST_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('secret command for jumpy to test arbitrary code DO NOT USE')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const groupedPairings = groupPairingsByRoom(await getNextPairings());
        await postPredictions(groupedPairings);

        await interaction.reply({ content: 'done', ephemeral: true });
    }
}