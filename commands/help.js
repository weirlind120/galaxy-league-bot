import { SlashCommandBuilder, bold, italic } from 'discord.js';

export const HELP_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('get a list of commands'),

    async execute(interaction) {
        const helpText =
            '\nCommands:' +
            `\n    ${bold('/player')} ${italic('mod only')} commands to manage the player pool` +
            `\n        ${bold('add')} add a player to the player pool` +
            `\n        ${bold('rate')} give a player a star rating` +
            `\n        ${bold('assign')} assign a player to a team` +
            `\n        ${bold('drop')} drop a player from a team` +
            `\n        ${bold('set_inactive')} mark a player inactive (cannot be on a team)` +
            `\n        ${bold('set_active')} mark a player active (can be on a team)` +
            `\n    ${bold('/lineup')} ${italic('mod, captain, or coach only')} commands to manage lineups` +
            `\n        ${bold('submit')} submit a lineup for next week` +
            `\n        ${bold('substitution')} perform a substitution in the current week (or past week, for an extension)` +
            `\n    ${bold('/match')} commands to set the outcome of a match` +
            `\n        ${bold('report')} report the result of a played set` +
            `\n        ${bold('act')} ${italic('mod only')} award an activity win` +
            `\n        ${bold('dead')} ${italic('mod only')} mark a match dead` +
            `\n    ${bold('/help')} ...this`;

        await interaction.reply({ content: helpText, ephemeral: true });
    }
}