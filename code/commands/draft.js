export const SEASON_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('draft')
        .setDescription('commands for drafting players')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list_available')
                .setDescription('shows all players you can draft in descending star order'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pick_up')
                .setDescription('adds an available player to your team')
                .addUserOption(option => 
                    option
                        .setName('player')
                        .setDescription('player to draft')
                        .setRequired(true))),

    async execute(interaction) {
        //xtina
    }
}