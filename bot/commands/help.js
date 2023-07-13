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
            `\n        ${bold('schedule')}   adds a scheduled time to the main room` +
            `\n        ${bold('start')}   gives both players the role which bars them from #live-matches` +
            `\n        ${bold('link')}   links a game in #live-matches` +
            `\n        ${bold('report')}   reports the result of a played set` +
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
                `\n        ${bold('undo')}   undo a match report` +
                `\n    ${bold('/player')}   commands to manage the player pool` +
                `\n        ${bold('add')}   add a player to the player pool` +
                `\n        ${bold('rate')}   give a player a star rating` +
                `\n        ${bold('assign')}   assign a player to a team` +
                `\n        ${bold('drop')}   drop a player from a team` +
                `\n        ${bold('set_inactive')}   mark a player inactive (cannot be on a team)` +
                `\n        ${bold('set_active')}   mark a player active (can be on a team)`;
        }

        if (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            helpText +=
                '\n' +
                `\n${italic('admin only')}` +
                `\n    ${bold('/season')}   powerful and difficult-to-reverse commands to advance the season` +
                `\n        ${bold('new')}   start a new season` +
                `\n        ${bold('next_week')}   start the next week: make new match rooms, post predictions, make extension rooms` +
                `\n        ${bold('calculate_standings')}   calculate the player and team standings after a week finishes, set up the next playoff round if applicable`;
        }

        await interaction.reply({ content: helpText, ephemeral: true });
    }
}