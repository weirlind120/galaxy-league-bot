import { SlashCommandBuilder } from "discord.js";
import { currentSeason, db } from "../globals.js";

export const DATA_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('data')
        .setDescription('Get data from mushi league history')
        .addSubcommand(subcommand =>
            subcommand
                .setName('scout')
                .setDescription("Get a player's replay history")
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('the player to scout')
                        .setRequired(true))
                .addNumberOption(option =>
                    option
                        .setName('from_season')
                        .setDescription('oldest season to get replays from'))
                .addNumberOption(option =>
                    option
                        .setName('through_season')
                        .setDescription('newest season to get replays from'))),

    async execute(interaction) {
        switch (interaction.options.getSubcommand()) {
            case 'scout':
                await scoutPlayer(interaction);
                break;
        }
    }
}

async function scoutPlayer(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const player = interaction.options.getUser('player');
    const startSeason = interaction.options.getNumber('from_season') || 0;
    const endSeason = interaction.options.getNumber('through_season') || currentSeason.number;

    const replayQuery =
        'SELECT pairing.game1, pairing.game2, pairing.game3, pairing.game4, pairing.game5 FROM pairing \
         INNER JOIN matchup ON pairing.matchup = matchup.id \
         INNER JOIN week ON matchup.week = week.id \
         WHERE week.season >= ? AND week.season <= ? AND pairing.game1 IS NOT NULL \
             AND (pairing.left_player = (SELECT id FROM player WHERE discord_snowflake = ?) OR \
                  pairing.right_player = (SELECT id FROM player WHERE discord_snowflake = ?)) \
         ORDER BY week.season DESC, week.number DESC';

    const replays = await db.all(replayQuery, startSeason, endSeason, player.id, player.id);

    const allReplaysString = `Replays found for ${player} between seasons ${startSeason} and ${endSeason}:\n`.concat(
        replays.length > 0
            ? replays.flatMap(week => [week.game1, week.game2, week.game3, week.game4, week.game5]).filter(game => !!game).join('\n')
            : 'None :('
    );

    await interaction.editReply({ content: allReplaysString, ephemeral: true });
}