import {
  SlashCommandBuilder,
  italic,
  userMention,
  roleMention,
  codeBlock,
} from "discord.js";
import { baseFunctionlessHandler, rightAlign, fixFloat } from "./util.js";

import { loadReplays } from "../../database/pairing.js";
import { loadTeamData } from "../../database/team.js";

import { currentSeason } from "../globals.js";

export const DATA_COMMAND = {
  data: new SlashCommandBuilder()
    .setName("data")
    .setDescription("Get data from mushi league history")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("scout")
        .setDescription("Get a player's replay history")
        .addUserOption((option) =>
          option
            .setName("player")
            .setDescription("the player to scout")
            .setRequired(true)
        )
        .addNumberOption((option) =>
          option
            .setName("from_season")
            .setDescription("oldest season to get replays from")
        )
        .addNumberOption((option) =>
          option
            .setName("through_season")
            .setDescription("newest season to get replays from")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("team")
        .setDescription("Get a team's player data")
        .addRoleOption((option) =>
          option
            .setName("team")
            .setDescription("the team to get data for")
            .setRequired(true)
        )
        .addNumberOption((option) =>
          option
            .setName("season")
            .setDescription("the season to get data for (defaults to current)")
            .setRequired(false)
        )
    ),
  async execute(interaction) {
    switch (interaction.options.getSubcommand()) {
      case "scout":
        await scoutPlayer(interaction);
        break;
      case "team":
        await getTeamData(interaction);
        break;
    }
  },
};

async function getTeamData(interaction) {
  async function dataCollector(interaction) {
    const team = interaction.options.getRole("team");
    const season =
      interaction.options.getNumber("season") || currentSeason.number;

    const playerData = await loadTeamData(team.id, season);

    return { team, playerData };
  }

  function verifier(data) {
    const { team, playerData } = data;
    let failures = [];

    if (playerData.length === 0) {
      failures.push(
        `No data found for ${roleMention(team.id)} from the current season.`
      );
    }

    return failures;
  }

  function responseWriter(data) {
    const { team, playerData } = data;

    function makePlayerIntoRow(p) {
      return `${rightAlign(29, p.name)}|${rightAlign(6, p.wins)}|${rightAlign(
        9,
        p.act_wins
      )}|${rightAlign(8, p.losses)}|${rightAlign(
        12,
        p.act_losses
      )}|${rightAlign(6, p.ties)}|${rightAlign(
        13,
        fixFloat(p.star_points)
      )}| ${fixFloat(p.stars)}`;
    }

    return `Data found for ${roleMention(team.id)}:\n`.concat(
      codeBlock(
        "".concat(
          `Name                         | Wins | Act Wins | Losses | Act Losses | Ties | Star Points | Stars\n`,
          "-----------------------------|------|----------|--------|------------|------|-------------|------\n",
          playerData.map((p) => makePlayerIntoRow(p)).join("\n")
        )
      )
    );
  }

  await baseFunctionlessHandler(
    interaction,
    dataCollector,
    verifier,
    responseWriter,
    true,
    true
  );
}

async function scoutPlayer(interaction) {
  async function dataCollector(interaction) {
    const player = interaction.options.getUser("player");
    const startSeason = interaction.options.getNumber("from_season") || 0;
    const endSeason =
      interaction.options.getNumber("through_season") || currentSeason.number;

    const replaysByWeek = await loadReplays(startSeason, endSeason, player.id);
    const replays = replaysByWeek
      .flatMap((week) => [
        week.game1,
        week.game2,
        week.game3,
        week.game4,
        week.game5,
      ])
      .filter((game) => !!game);

    return { playerSnowflake: player.id, startSeason, endSeason, replays };
  }

  function verifier(data) {
    const { playerSnowflake, startSeason, endSeason, replays } = data;
    let failures = [];

    if (startSeason > endSeason) {
      failures.push(
        `You asked for replays ${italic(
          "after"
        )} season ${startSeason} but ${italic(
          "before"
        )} season ${endSeason}. Obviously there are none.`
      );
    }

    if (replays.length === 0) {
      failures.push(
        `No replays found for ${userMention(
          playerSnowflake
        )} between seasons ${startSeason} and ${endSeason}.`
      );
    }

    return failures;
  }

  function responseWriter(data) {
    const { playerSnowflake, startSeason, endSeason, replays } = data;

    return `Replays found for ${userMention(
      playerSnowflake
    )} between seasons ${startSeason} and ${endSeason}:\n`.concat(
      replays.join("\n")
    );
  }

  await baseFunctionlessHandler(
    interaction,
    dataCollector,
    verifier,
    responseWriter,
    true,
    true
  );
}
