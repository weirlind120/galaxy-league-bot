import { SlashCommandBuilder, bold, italic, PermissionFlagsBits } from 'discord.js';

export const HELP_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('get a list of commands'),

    async execute(interaction) {
        let helpText = 
            '\u200b' +
            `\n${bold('Commands')}:` +
            '\n' +
            `\n${italic('public')}` +
            `\n    ${bold('/match')}   commands to set the outcome of a match` +
            `\n        ${bold('report')}   report the result of a played set` +
            `\n    ${bold('/help')}   ...this`;

        if (interaction.member.roles.cache.some(role => role.name === 'Coach') ||
            interaction.member.roles.cache.some(role => role.name === 'Captain') ||
            interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            helpText +=
                '\n' +
                `\n${italic('mod, coach, or captain only')}` +
                `\n    ${bold('/lineup')}   commands to manage lineups` +
                `\n        ${bold('submit')}   submit a lineup for next week` +
                `\n        ${bold('substitution')}   perform a substitution in the current week (or past week, for an extension)`;
        }

        if (interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            helpText +=
                '\n' +
                `\n${italic('mod only')}` +
                `\n    ${bold('/match')}   commands to set the outcome of a match` +
                `\n        ${bold('act')}   award an activity win` +
                `\n        ${bold('dead')}   mark a match dead` +
                `\n    ${bold('/player')}   commands to manage the player pool` +
                `\n        ${bold('add')}   add a player to the player pool` +
                `\n        ${bold('rate')}   give a player a star rating` +
                `\n        ${bold('assign')}   assign a player to a team` +
                `\n        ${bold('drop')}   drop a player from a team` +
                `\n        ${bold('set_inactive')}   mark a player inactive (cannot be on a team)` +
                `\n        ${bold('set_active')}   mark a player active (can be on a team)`;
        }

        await interaction.reply({ content: helpText, ephemeral: true });
    }
}