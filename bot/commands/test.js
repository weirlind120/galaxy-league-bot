import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention } from 'discord.js';
import { db, channels, currentSeason } from '../globals.js'
import { } from './season.js';

export const TEST_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('secret command for jumpy to test arbitrary code DO NOT USE')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {

        const groupedPairings = groupPairingsByRoom(await getNextPairings());

        await postScheduling(groupedPairings);

        await interaction.reply({ content: 'done', ephemeral: true });
    }
}