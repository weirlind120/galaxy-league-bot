import { ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';

export async function confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage, ephemeral, deferred) {
    if (!prompts || prompts.length === 0) {
        if (deferred) {
            await interaction.editReply(confirmMessage);
        }
        else {
            await interaction.reply(confirmMessage);
        }
        return true;
    }

    const prompt = prompts.join('\n');
    const cancelButton = new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
    const confirmButton = new ButtonBuilder().setCustomId('confirm').setLabel(confirmLabel).setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(cancelButton).addComponents(confirmButton);

    const response = deferred
        ? await interaction.editReply({ content: prompt, components: [row] })
        : await interaction.reply({ content: prompt, components: [row], ephemeral: ephemeral });

    const collectorFilter = i => i.user.id === interaction.user.id;

    try {
        const confirmation = await response.awaitMessageComponent({ filter: collectorFilter, time: 60000 });

        if (confirmation.customId === 'confirm') {
            await confirmation.update({ content: confirmMessage, components: [] });
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

export function sendFailure(interaction, failures, deferred) {
    if (failures.constructor === Array) {
        failures = failures.join('\n');
    }

    if (failures) {
        if (deferred) {
            interaction.editReply({ content: `Action FAILED:\n${failures}`, ephemeral: true });
        }
        else {
            interaction.reply({ content: `Action FAILED:\n${failures}`, ephemeral: true });
        }
        return true;
    }

    return false;
}

export function addModOverrideableFailure(userIsMod, failures, prompts, message) {
    if (userIsMod) {
        prompts.push(message);
    }
    else {
        failures.push(message);
    }
}

export function rightAlign(space, value) {
    return `${value} `.padStart(space, ' ');
}

export function fixFloat(float) {
    return +float.toFixed(2);
}