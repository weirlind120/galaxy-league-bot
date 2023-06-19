import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { channels } from '../globals.js'
import { getNextPairings, groupPairingsByRoom, postPredictions } from './season.js';

export const TEST_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('secret command for jumpy to test arbitrary code DO NOT USE')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const fuckedMsgSnowflake = '1120387395813122150';
        const predictionsChannel = await channels.fetch(process.env.predictionsChannelId);
        const message = await predictionsChannel.messages.fetch(fuckedMsgSnowflake);
        const newContent = message.content.substring(0, message.content.length - 4).concat('0-0');
        await message.edit(newContent);

        await interaction.reply({ content: 'done', ephemeral: true });
    }
}