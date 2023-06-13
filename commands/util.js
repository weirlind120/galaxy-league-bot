import { ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';

export async function confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage) {
    if (!prompts || prompts.length === 0) {
        await interaction.reply(confirmMessage);
        return true;
    }

    const prompt = prompts.join('\n');
    const cancelButton = new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
    const confirmButton = new ButtonBuilder().setCustomId('confirm').setLabel(confirmLabel).setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(cancelButton).addComponents(confirmButton);
    const response = await interaction.reply({ content: prompt, components: [row], ephemeral: true });

    const collectorFilter = i => i.user.id === interaction.user.id;

    try {
        const confirmation = await response.awaitMessageComponent({ filter: collectorFilter, time: 60000 });

        if (confirmation.customId === 'confirm') {
            await confirmation.update({ components: [] });
            await interaction.followUp(`${prompt}\nAction confirmed: ${confirmMessage}`);
            return true;
        }
        else {
            await confirmation.update({ content: `Action canceled: ${cancelMessage}`, components: [] });
        }
    } catch (e) {
        await interaction.editReply({ content: 'Confirmation not received within 1 minute, cancelling', components: [] });
    }

    return false;
}

export async function sendFailure(interaction, failures) {
    await interaction.reply({ content: `Action FAILED:\n${failures.join('\n')}`, ephemeral: true });
}