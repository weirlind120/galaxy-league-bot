import {
  SlashCommandBuilder,
  roleMention,
  userMention,
  spoiler,
  italic,
  time,
  hyperlink,
  EmbedBuilder,
  channelMention,
} from "discord.js";
import { baseHandler, userIsMod, baseFunctionlessHandler } from "./util.js";
import { currentSeason, channels, mushiLeagueGuild } from "../globals.js";
import { set, parse, isValid, sub, add, endOfWeek } from "date-fns";
import {
  savePredictions,
  updatePrediction,
  resetPredictionWinner,
} from "../features/predictions.js";
import { setScheduledTime } from "../features/schedule.js";
import {
  savePairingResult,
  loadOnePairing,
  loadOpenPairings,
  loadNextMatches,
} from "../../database/pairing.js";

export const MATCH_COMMAND = {
  data: new SlashCommandBuilder()
    .setName("match")
    .setDescription("updates the status of a pairing")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("schedule")
        .setDescription("Set the scheduled time for a match")
        .addStringOption((option) =>
          option
            .setName("time")
            .setDescription(
              'the scheduled time. Accepted formats: "Tuesday 11:00 PM", "Sunday 1 PM", "Wednesday 21:30"'
            )
            .setRequired(true)
        )
        .addNumberOption((option) =>
          option
            .setName("timezone")
            .setDescription("the timezone as a pure GMT number (e.g. +5.5, -4)")
            .setMinValue(-12)
            .setMaxValue(13)
        )
        .addBooleanOption((option) =>
          option
            .setName("inexact")
            .setDescription("whether the time is inexact")
        )
        .addUserOption((option) =>
          option
            .setName("player")
            .setDescription(
              "name of either player in the bo3, defaults to yourself"
            )
        )
        .addBooleanOption((option) =>
          option
            .setName("extension")
            .setDescription("whether this is an extension match")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("link")
        .setDescription(
          `links a game in ${channelMention(process.env.liveMatchesChannelId)}`
        )
        .addStringOption((option) =>
          option
            .setName("game_link")
            .setDescription("url of game to link")
            .setRequired(true)
        )
        .addNumberOption((option) =>
          option
            .setName("number")
            .setDescription("which game in the set this is")
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName("player")
            .setDescription("either player in the set, defaults to yourself")
        )
        .addBooleanOption((option) =>
          option
            .setName("extension")
            .setDescription("whether this is an extension match")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("report")
        .setDescription("Reports the completion of a series")
        .addUserOption((option) =>
          option
            .setName("winner")
            .setDescription("Player who won the match")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("game1")
            .setDescription("replay link for g1")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("game2")
            .setDescription("replay link for g2")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option.setName("game3").setDescription("replay link for g3")
        )
        .addStringOption((option) =>
          option.setName("game4").setDescription("replay link for the rare g4")
        )
        .addStringOption((option) =>
          option
            .setName("game5")
            .setDescription(
              "replay link for g5, which has never happened to my knowledge"
            )
        )
        .addBooleanOption((option) =>
          option
            .setName("extension")
            .setDescription("Whether this is an extension from last week")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("act")
        .setDescription("Awards an activity win")
        .addUserOption((option) =>
          option
            .setName("winner")
            .setDescription("Player to give act win")
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("extension")
            .setDescription("Whether this is an extension from last week")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("dead")
        .setDescription("Marks a game dead")
        .addUserOption((option) =>
          option
            .setName("player")
            .setDescription("One of the players in the dead pairing")
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("extension")
            .setDescription("Whether this is an extension from last week")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("undo")
        .setDescription("undoes a match decision")
        .addUserOption((option) =>
          option
            .setName("player")
            .setDescription("one of the players in the pairing to undo")
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("extension")
            .setDescription("whether this is an extension from last week")
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("next")
        .setDescription("shows next 10 upcoming matches")
    ),

  async execute(interaction) {
    switch (interaction.options.getSubcommand()) {
      case "schedule":
        await scheduleMatch(interaction);
        break;
      case "start":
        await startMatch(interaction);
        break;
      case "link":
        await linkMatch(interaction);
        break;
      case "report":
        await reportMatch(interaction);
        break;
      case "act":
        await awardActWin(interaction);
        break;
      case "dead":
        await markDeadGame(interaction);
        break;
      case "undo":
        await undoReport(interaction);
        break;
      case "next":
        await nextMatches(interaction);
        break;
    }
  },
};

async function scheduleMatch(interaction) {
  async function dataCollector(interaction) {
    let date = interaction.options.getString("time");
    const inexact = interaction.options.getBoolean("inexact");
    const timezone = interaction.options.getNumber("timezone");
    const player = interaction.options.getUser("player") || interaction.user;
    const extension = interaction.options.getBoolean("extension");

    const week = extension
      ? currentSeason.current_week - 1
      : currentSeason.current_week;
    const pairing = await loadOnePairing(currentSeason.number, week, player.id);

    if (!pairing) {
      return {
        failure: `No pairing found for ${player}. Is this a Mushi League match?`,
      };
    }

    if (!inexact) {
      date = parseDateInput(date);

      if (!date) {
        return {
          failure:
            'Couldn\'t parse the date. Please either specify that it\'s inexact, or pass it in formatted like "Sunday 4:00 PM", "Sunday 4 PM", or "Sunday 16:00"',
        };
      }

      const botTimezone = date.getTimezoneOffset() / -60;
      date = sub(date, { hours: timezone - botTimezone });

      const endOfGameWeek = endOfWeek(
        sub(Date.now(), { hours: -7 - botTimezone }),
        { weekStartsOn: 1 }
      );
      if (date > endOfGameWeek) {
        date = sub(date, { weeks: 1 });
      }

      if (date < Date.now()) {
        date = add(date, { weeks: 1 });
      }
    }

    const dateString = inexact ? date : time(date);

    return {
      playerSnowflake: player.id,
      date,
      dateString,
      timezone,
      inexact,
      pairing,
    };
  }

  function verifier(data) {
    const { playerSnowflake, dateString, timezone, inexact, pairing } = data;
    let failures = [],
      prompts = [];

    if (!inexact && timezone == null) {
      failures.push(
        "You either need to specify that the time is inexact, or give a timezone"
      );
    }

    const confirmLabel = "Confirm Schedule";
    const confirmMessage = `${userMention(
      pairing.leftPlayerSnowflake
    )} and ${userMention(
      pairing.rightPlayerSnowflake
    )}'s game scheduled for ${dateString}`;
    const cancelMessage = `Game schedule for ${userMention(
      playerSnowflake
    )} not changed.`;

    return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
  }

  async function onConfirm(data) {
    const { playerSnowflake, date, dateString, pairing, inexact } = data;
    await setScheduledTime(
      playerSnowflake,
      pairing.schedule_message,
      dateString,
      pairing.id,
      inexact ? undefined : date
    );
  }

  await baseHandler(
    interaction,
    dataCollector,
    verifier,
    onConfirm,
    false,
    false
  );
}

function parseDateInput(dateString) {
  const allowedInputs = ["iiii hh:mm a", "iiii hh a", "iiii HH:mm"];

  const referenceDate = set(new Date(), { minutes: 0 });

  for (const format of allowedInputs) {
    const attempt = parse(dateString, format, referenceDate);
    if (isValid(attempt)) {
      return attempt;
    }
  }

  return false;
}

async function linkMatch(interaction) {
  async function dataCollector(interaction) {
    const gameLink = interaction.options.getString("game_link");
    const number = interaction.options.getNumber("number");
    const extension = interaction.options.getBoolean("extension");
    const week = extension
      ? currentSeason.current_week - 1
      : currentSeason.current_week;
    const player =
      interaction.options.getMember("player") || interaction.member;
    const pairing = await loadOnePairing(currentSeason.number, week, player.id);

    if (!pairing) {
      return { failure: "this is not a league set" };
    }

    const start = !pairing.predictionsSaved;

    const matchRoom = await channels.fetch(
      eval(`process.env.matchChannel${pairing.room}Id`)
    );

    const opponentSnowflake =
      pairing.leftPlayerSnowflake === player.user.id
        ? pairing.rightPlayerSnowflake
        : pairing.leftPlayerSnowflake;

    const opponent = await mushiLeagueGuild.members.fetch(opponentSnowflake);

    const eitherPlayerIsOwner =
      player.roles.cache.has(process.env.ownerRoleId) ||
      opponent.roles.cache.has(process.env.ownerRoleId);

    return {
      gameLink,
      number,
      player,
      opponent,
      pairing,
      matchRoom,
      opponent,
      eitherPlayerIsOwner,
      start,
    };
  }

  function verifier(data) {
    const { start, eitherPlayerIsOwner } = data;

    let failures = [],
      prompts = [];

    if (start) {
      let startPrompt = "This will also close predictions";
      if (eitherPlayerIsOwner) {
        startPrompt += `. One of the players in this match is a server admin, so neither player can be blocked from ${channelMention(
          process.env.liveMatchesChannelId
        )}`;
      } else {
        startPrompt += ` and lock both players out of ${channelMention(
          process.env.liveMatchesChannelId
        )}`;
      }
      prompts.push(startPrompt);
    }

    const confirmLabel = "Confirm Link Game";
    const confirmMessage = `Game linked in ${channelMention(
      process.env.matchLinksChannelId
    )}`;
    const cancelMessage = "Game not linked";

    return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
  }

  async function onConfirm(data) {
    const {
      gameLink,
      number,
      start,
      pairing,
      matchRoom,
      player,
      opponent,
      eitherPlayerIsOwner,
    } = data;

    const leftPlayerText = `(${roleMention(
      pairing.leftTeamSnowflake
    )}) ${userMention(pairing.leftPlayerSnowflake)}`;
    const rightPlayerText = `${userMention(
      pairing.rightPlayerSnowflake
    )} (${roleMention(pairing.rightTeamSnowflake)})`;

    const linkMessage = `${gameLink} ${leftPlayerText} vs ${rightPlayerText} game ${number}`;
    const linkMessageWithPing =
      linkMessage + ` ${roleMention(process.env.spectatorRoleId)}`;

    const matchLinksChannel = await channels.fetch(
      process.env.matchLinksChannelId
    );
    await matchLinksChannel.send({
      content: start ? linkMessageWithPing : linkMessage,
      allowedMentions: { roles: [process.env.spectatorRoleId] },
    });

    if (matchRoom) {
      await matchRoom.send({
        content: linkMessage,
        allowedMentions: { parse: [] },
      });
    }

    if (start) {
      if (!eitherPlayerIsOwner) {
        await player.roles.add(process.env.currentlyPlayingRoleId);
        await opponent.roles.add(process.env.currentlyPlayingRoleId);
      }

      if (pairing) {
        await savePredictions(
          pairing.id,
          pairing.leftPlayerId,
          pairing.leftEmoji,
          pairing.rightPlayerId,
          pairing.rightEmoji,
          pairing.predictions_message
        );
      }
    }
  }

  await baseHandler(
    interaction,
    dataCollector,
    verifier,
    onConfirm,
    false,
    false
  );
}

async function reportMatch(interaction) {
  async function dataCollector(interaction) {
    const winner = interaction.options.getUser("winner");
    const games = [
      interaction.options.getString("game1"),
      interaction.options.getString("game2"),
      interaction.options.getString("game3"),
      interaction.options.getString("game4"),
      interaction.options.getString("game5"),
    ].filter((game) => !!game);
    const extension = interaction.options.getBoolean("extension");
    const week = extension
      ? currentSeason.current_week - 1
      : currentSeason.current_week;

    const pairing = await loadOnePairing(currentSeason.number, week, winner.id);

    if (!pairing) {
      return {
        failure: `No pairing found for ${winner}. Is this a Mushi League match?`,
      };
    }

    const winnerOnLeft = pairing.leftPlayerSnowflake === winner.id;

    return { games, extension, week, pairing, winnerOnLeft };
  }

  function verifier(data) {
    const { games, pairing, winnerOnLeft } = data;
    let failures = [],
      prompts = [];

    if (pairing.winner || pairing.dead) {
      failures.push(
        `${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(
          pairing.rightPlayerSnowflake
        )} already has a result reported. Use /match undo first.`
      );
    }

    if (games.any((game) => game.search("battle") !== -1)) {
      failures.push(
        "You seem to have given live game links instead of replay links."
      );
    }

    if (games.length === 2) {
      prompts.push(
        "Only 2 games reported. If this series wasn't a 2-0, make sure to use the optional parameters for the other games."
      );
    }

    const winnerSnowflake = winnerOnLeft
      ? pairing.leftPlayerSnowflake
      : pairing.rightPlayerSnowflake;
    const loserSnowflake = winnerOnLeft
      ? pairing.rightPlayerSnowflake
      : pairing.leftPlayerSnowflake;

    const confirmLabel = "Confirm match report";
    const confirmMessage = `${userMention(
      winnerSnowflake
    )} defeated ${userMention(loserSnowflake)} in slot ${pairing.slot}.`;
    const cancelMessage = "No match reported.";

    return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
  }

  async function onConfirm(data) {
    const { games, extension, week, pairing, winnerOnLeft } = data;

    const winnerId = winnerOnLeft
      ? pairing.leftPlayerId
      : pairing.rightPlayerId;
    await savePairingResult(pairing.id, games, winnerId, null);

    if (!pairing.predictionsSaved) {
      await savePredictions(
        pairing.id,
        pairing.leftPlayerId,
        pairing.leftEmoji,
        pairing.rightPlayerId,
        pairing.rightEmoji,
        pairing.predictions_message
      );
    }

    await postReport(pairing, winnerOnLeft, extension, games);
    await removePlayingRole(
      pairing.leftPlayerSnowflake,
      pairing.rightPlayerSnowflake
    );
    await updatePrediction(
      pairing.predictions_message,
      pairing.matchupPrediction,
      false,
      false,
      winnerOnLeft
    );
    await setScheduledTime(
      pairing.leftPlayerSnowflake,
      pairing.schedule_message,
      "DONE"
    );
    await notifyOwnersIfAllMatchesDone(week);
  }

  await baseHandler(
    interaction,
    dataCollector,
    verifier,
    onConfirm,
    false,
    false
  );
}

async function awardActWin(interaction) {
  async function dataCollector(interaction) {
    if (!userIsMod(interaction.member)) {
      return { failure: "Only mods can use this command" };
    }

    const winner = interaction.options.getUser("winner");
    const extension = interaction.options.getBoolean("extension");

    const week = extension
      ? currentSeason.current_week - 1
      : currentSeason.current_week;

    const pairing = await loadOnePairing(currentSeason.number, week, winner.id);

    if (!pairing) {
      return {
        failure: `No pairing found for ${winner}. Is this a Mushi League match?`,
      };
    }

    const winnerOnLeft = pairing.leftPlayerSnowflake === winner.id;

    return { extension, week, pairing, winnerOnLeft };
  }

  function verifier(data) {
    const { pairing, winnerOnLeft } = data;
    let failures = [],
      prompts = [];

    if (pairing.winner || pairing.dead) {
      failures.push(
        `${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(
          pairing.rightPlayerSnowflake
        )} already has a result reported. Use /match undo first.`
      );
    }

    const winnerSnowflake = winnerOnLeft
      ? pairing.leftPlayerSnowflake
      : pairing.rightPlayerSnowflake;
    const loserSnowflake = winnerOnLeft
      ? pairing.rightPlayerSnowflake
      : pairing.leftPlayerSnowflake;

    const confirmLabel = "Confirm activity win";
    const confirmMessage = `${userMention(
      winnerSnowflake
    )} granted win over ${userMention(loserSnowflake)} in slot ${
      pairing.slot
    }.`;
    const cancelMessage = "No activity win granted.";

    return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
  }

  async function onConfirm(data) {
    const { extension, week, pairing, winnerOnLeft } = data;

    const winnerId = winnerOnLeft
      ? pairing.leftPlayerId
      : pairing.rightPlayerId;
    await savePairingResult(pairing.id, null, winnerId, null);

    await postReport(pairing, winnerOnLeft, extension, null, true, false);
    await updatePrediction(
      pairing.predictions_message,
      pairing.matchupPrediction,
      true,
      false,
      winnerOnLeft
    );
    await setScheduledTime(
      pairing.leftPlayerSnowflake,
      pairing.schedule_message,
      "DONE"
    );
    await notifyOwnersIfAllMatchesDone(week);
  }

  await baseHandler(
    interaction,
    dataCollector,
    verifier,
    onConfirm,
    false,
    false
  );
}

async function markDeadGame(interaction) {
  async function dataCollector(interaction) {
    if (!userIsMod(interaction.member)) {
      return { failure: "Only mods can use this command" };
    }

    const player = interaction.options.getUser("player");
    const extension = interaction.options.getBoolean("extension");

    const week = extension
      ? currentSeason.current_week - 1
      : currentSeason.current_week;

    const pairing = await loadOnePairing(currentSeason.number, week, player.id);

    if (!pairing) {
      return {
        failure: `No pairing found for ${player}. Is this a Mushi League match?`,
      };
    }

    return { extension, week, pairing };
  }

  function verifier(data) {
    const { pairing } = data;
    let failures = [],
      prompts = [];

    if (pairing.winner || pairing.dead) {
      failures.push(
        `${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(
          pairing.rightPlayerSnowflake
        )} already has a result reported. Use /match undo first.`
      );
    }

    const confirmLabel = "Confirm dead game";
    const confirmMessage = `${userMention(
      pairing.leftPlayerSnowflake
    )} vs ${userMention(pairing.rightPlayerSnowflake)} declared dead in slot ${
      pairing.slot
    }.`;
    const cancelMessage = "Game not marked dead.";

    return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
  }

  async function onConfirm(data) {
    const { extension, week, pairing } = data;

    await savePairingResult(pairing.id, null, null, 1);

    await postReport(pairing, null, extension, null, false, true);
    await updatePrediction(
      pairing.predictions_message,
      pairing.matchupPrediction,
      false,
      true
    );
    await setScheduledTime(
      pairing.leftPlayerSnowflake,
      pairing.schedule_message,
      "DONE"
    );
    await notifyOwnersIfAllMatchesDone(week);
  }

  await baseHandler(
    interaction,
    dataCollector,
    verifier,
    onConfirm,
    false,
    false
  );
}

async function postReport(pairing, winnerOnLeft, extension, games, act, dead) {
  const matchReportChannel = await channels.fetch(
    process.env.matchReportChannelId
  );

  if (games) {
    await matchReportChannel.send({
      embeds: [makeReplayEmbed(pairing, winnerOnLeft, extension, games)],
      allowedMentions: { parse: [] },
    });
  } else {
    await matchReportChannel.send({
      content: makeReportPlaintext(pairing, winnerOnLeft, extension, act, dead),
      allowedMentions: { parse: [] },
    });
  }
}

function makeReportPlaintext(pairing, winnerOnLeft, extension, act, dead) {
  const leftPlayerText = `(${roleMention(pairing.leftTeamSnowflake)}) ${
    pairing.leftPlayerName
  }`;
  const rightPlayerText = `${pairing.rightPlayerName} (${roleMention(
    pairing.rightTeamSnowflake
  )})`;
  const extensionMessage = extension
    ? italic("\n(Extension from last week)")
    : "";

  if (act) {
    const winnerText = winnerOnLeft ? ">" : "<";
    return (
      `${leftPlayerText} ${winnerText} ${rightPlayerText} on activity.` +
      extensionMessage
    );
  }
  if (dead) {
    return (
      `${leftPlayerText} vs ${rightPlayerText} marked dead.` + extensionMessage
    );
  }
  return "jumpy broke a thing";
}

function makeReplayEmbed(pairing, winnerOnLeft, extension, games) {
  let gameFields = [];

  for (let i = 0; i < Math.max(games.length, 3); i++) {
    gameFields.push({
      name: `game ${i + 1}`,
      value: hyperlink(
        "link",
        games.at(i) || "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      ),
      inline: true,
    });
  }

  const leftPlayerText = `(${roleMention(pairing.leftTeamSnowflake)}) ${
    pairing.leftPlayerName
  }`;
  const rightPlayerText = `${pairing.rightPlayerName} (${roleMention(
    pairing.rightTeamSnowflake
  )})`;
  const winnerText =
    games.length === 2
      ? winnerOnLeft
        ? "\u{0032}\u{FE0F}\u{20E3} > \u{0030}\u{FE0F}\u{20E3}"
        : "\u{0030}\u{FE0F}\u{20E3} < \u{0032}\u{FE0F}\u{20E3}"
      : winnerOnLeft
      ? "\u{0032}\u{FE0F}\u{20E3} > \u{0031}\u{FE0F}\u{20E3}"
      : "\u{0031}\u{FE0F}\u{20E3} < \u{0032}\u{FE0F}\u{20E3}";
  const extensionMessage = extension
    ? italic("\n(Extension from last week)")
    : "";

  return new EmbedBuilder()
    .setDescription(
      `${leftPlayerText} ${spoiler(
        winnerText
      )} ${rightPlayerText}${extensionMessage}`
    )
    .addFields(...gameFields);
}

async function removePlayingRole(leftPlayerSnowflake, rightPlayerSnowflake) {
  const currentlyPlayingRole = process.env.currentlyPlayingRoleId;

  const player1 = await mushiLeagueGuild.members.fetch(leftPlayerSnowflake);
  const player2 = await mushiLeagueGuild.members.fetch(rightPlayerSnowflake);

  await player1.roles.remove(currentlyPlayingRole);
  await player2.roles.remove(currentlyPlayingRole);
}

async function undoReport(interaction) {
  async function dataCollector(interaction) {
    if (!userIsMod(interaction.member)) {
      return { failure: "Only mods can use this command" };
    }

    const player = interaction.options.getUser("player");
    const extension = interaction.options.getBoolean("extension");

    const week = extension
      ? currentSeason.current_week - 1
      : currentSeason.current_week;

    const pairing = await loadOnePairing(currentSeason.number, week, player.id);

    if (!pairing) {
      return {
        failure: `No pairing found for ${player}. Is this a Mushi League match?`,
      };
    }

    return { pairing };
  }

  function verifier(data) {
    const { pairing } = data;
    let failures = [],
      prompts = [];

    if (!pairing.winner && !pairing.dead) {
      failures.push("Nothing to undo");
    }

    const confirmLabel = "Confirm undo report";
    const confirmMessage = `${userMention(
      pairing.leftPlayerSnowflake
    )} vs ${userMention(pairing.rightPlayerSnowflake)} result undone.`;
    const cancelMessage = "Result not undone.";

    return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
  }

  async function onConfirm(data) {
    const { pairing } = data;
    await savePairingResult(
      pairing.id,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );

    await resetPredictionWinner(
      pairing.predictions_message,
      pairing.matchupPrediction,
      pairing.winner === pairing.leftPlayerId,
      pairing.dead,
      pairing.leftPlayerName,
      pairing.rightPlayerName
    );
    await setScheduledTime(
      pairing.leftPlayerSnowflake,
      pairing.schedule_message,
      ""
    );
  }

  await baseHandler(
    interaction,
    dataCollector,
    verifier,
    onConfirm,
    false,
    false
  );
}

async function notifyOwnersIfAllMatchesDone(week) {
  if ((await loadOpenPairings(currentSeason.number, week)).length === 0) {
    const captainChannel = await channels.fetch(process.env.captainChannelId);
    await captainChannel.send({
      content: `${roleMention(
        process.env.ownerRoleId
      )} all matches are in -- run /season calculate_standings when you've confirmed.`,
      allowedMentions: { parse: ["roles"] },
    });
  }
}

async function nextMatches(interaction) {
  async function dataCollector(interaction) {
    const upcomingMatches = await loadNextMatches();

    return { upcomingMatches };
  }

  function verifier(data) {}

  function responseWriter(data) {
    const { upcomingMatches } = data;

    if (upcomingMatches.length === 0) {
      return "No upcoming matches.";
    }

    return "Next 10 upcoming matches:\n\n".concat(
      upcomingMatches
        .map(
          (match) =>
            `${time(new Date(match.scheduled_datetime))}: ${roleMention(
              match.leftTeamSnowflake
            )} ${match.leftPlayerName} vs ${
              match.rightPlayerName
            } ${roleMention(match.rightTeamSnowflake)}`
        )
        .join("\n")
    );
  }

  await baseFunctionlessHandler(
    interaction,
    dataCollector,
    verifier,
    responseWriter,
    true
  );
}
