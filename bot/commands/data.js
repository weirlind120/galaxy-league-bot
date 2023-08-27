import { SlashCommandBuilder, italic, userMention } from "discord.js";
import { currentSeason } from "../globals.js";
import { baseFunctionlessHandler } from "./util.js";

import { loadReplays } from "../../database/pairing.js";

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
    async function dataCollector(interaction) {
        const player = interaction.options.getUser('player');
        const startSeason = interaction.options.getNumber('from_season') || 0;
        const endSeason = interaction.options.getNumber('through_season') || currentSeason.number;

        const replaysByWeek = await loadReplays(startSeason, endSeason, player.id);
        const replays = replaysByWeek.flatMap(week => [week.game1, week.game2, week.game3, week.game4, week.game5]).filter(game => !!game);

        return { playerSnowflake: player.id, startSeason, endSeason, replays };
    }

    function verifier(data) {
        const { playerSnowflake, startSeason, endSeason, replays } = data;
        let failures = [];

        if (startSeason > endSeason) {
            failures.push(`You asked for replays ${italic('after')} season ${startSeason} but ${italic('before')} season ${endSeason}. Obviously there are none.`);
        }

        if (replays.length === 0) {
            failures.push(`No replays found for ${userMention(playerSnowflake)} between seasons ${startSeason} and ${endSeason}.`)
        }

        return failures;
    }

    function responseWriter(data) {
        const { playerSnowflake, startSeason, endSeason, replays } = data;

        return `Replays found for ${userMention(playerSnowflake)} between seasons ${startSeason} and ${endSeason}:\n`.concat(
            replays.join('\n')
        );
    }

    await baseFunctionlessHandler(interaction, dataCollector, verifier, responseWriter, true, true);
}