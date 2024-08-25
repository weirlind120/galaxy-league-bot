import { userMention, roleMention, bold } from 'discord.js';
import { channels } from '../globals.js';
import { weekName, wait } from '../commands/util.js';

import { savePredictionsMessageId } from '../../database/pairing.js';
import { loadWeeklyTopTenInPredictions, loadCumulativeTopTenInPredictions, savePredictionsToDatabase } from '../../database/prediction.js';

export async function postPredictions(groupedPairings) {
    const predictionsChannel = await channels.fetch(process.env.predictionsChannelId);
    for (const pairingSet of groupedPairings.values()) {
        wait(1000);
        await postPredictionsForMatchup(predictionsChannel, pairingSet);
    }
}

async function postPredictionsForMatchup(predictionsChannel, pairingSet) {
    const headerMessage = `${pairingSet[0].leftEmoji} ${roleMention(pairingSet[0].leftTeamSnowflake)} vs ${roleMention(pairingSet[0].rightTeamSnowflake)} ${pairingSet[0].rightEmoji}\n \
                                           Current score: 0-0`;
    await sendPredictionMessage(predictionsChannel, headerMessage, pairingSet[0].leftEmoji, pairingSet[0].rightEmoji, 'matchup', pairingSet[0].matchup);

    for (const pairing of pairingSet) {
        const pairingMessage = `${pairing.leftPlayerName} vs ${pairing.rightPlayerName}`;
        await sendPredictionMessage(predictionsChannel, pairingMessage, pairing.leftEmoji, pairing.rightEmoji, 'pairing', pairing.id);
    }
}

async function sendPredictionMessage(predictionsChannel, content, leftEmoji, rightEmoji, table, primaryKey) {
    const message = await predictionsChannel.send({
        content: content,
        allowedMentions: { parse: [] }
    });

    await message.react(leftEmoji);
    await message.react(rightEmoji);

    await savePredictionsMessageId(table, message.id, primaryKey);
}

export async function changePredictionsPlayer(predictionsMessageId, replacedPlayerName, newPlayerName) {
    const predictionsMessage = await getPredictionsMessage(predictionsMessageId);

    const newPredictionContent = predictionsMessage.content.replace(replacedPlayerName, newPlayerName);
    await predictionsMessage.edit(newPredictionContent);
}

async function getPredictionsMessage(predictionsMessageId) {
    const predictionsChannel = await channels.fetch(process.env.predictionsChannelId);
    return await predictionsChannel.messages.fetch({ message: predictionsMessageId, force: true });
}

export async function savePredictions(pairingId, leftPlayer, leftEmoji, rightPlayer, rightEmoji, predictionsMessageId) {
    const predictionsMessage = await getPredictionsMessage(predictionsMessageId);

    const predictions = await mapReactionsToPlayers(leftPlayer, leftEmoji, rightPlayer, rightEmoji, predictionsMessage.reactions.cache);
    await savePredictionsToDatabase(pairingId, predictions, leftPlayer, rightPlayer);
}

async function mapReactionsToPlayers(leftPlayer, leftEmoji, rightPlayer, rightEmoji, reactions) {
    const predictions = {};

    for (const reaction of reactions.values()) {
        const fullEmojiName = `<:${reaction.emoji.name}:${reaction.emoji.id}>`;

        if (fullEmojiName === leftEmoji) {
            const reacters = await reaction.users.fetch();
            predictions[leftPlayer] = [...reacters.keys()];
        }
        if (fullEmojiName === rightEmoji) {
            const reacters = await reaction.users.fetch();
            predictions[rightPlayer] = [...reacters.keys()];
        }
    }

    const doublePredicters = new Set(predictions[leftPlayer].filter(reacter => predictions[rightPlayer].includes(reacter)));
    predictions[leftPlayer] = predictions[leftPlayer].filter(reacter => !doublePredicters.has(reacter));
    predictions[rightPlayer] = predictions[rightPlayer].filter(reacter => !doublePredicters.has(reacter));

    return predictions;
}

export async function updatePrediction(pairingPredictionsMessageId, matchupPredictionsMessageId, act, dead, winnerOnLeft) {
    updatePairingPrediction(pairingPredictionsMessageId, act, dead, winnerOnLeft);

    if (!dead) {
        updateMatchupPrediction(matchupPredictionsMessageId, winnerOnLeft);
    }
}

async function updatePairingPrediction(pairingPredictionsMessageId, act, dead, winnerOnLeft) {
    const pairingPredictionsMessage = await getPredictionsMessage(pairingPredictionsMessageId);
    let predictionContent = pairingPredictionsMessage.content;

    if (dead) {
        predictionContent = predictionContent.replace('vs', '\u{1f480}');
    }
    if (act) {
        predictionContent = predictionContent.replace('vs', '\u{23F0}');
    }

    if (!dead) {
        predictionContent = winnerOnLeft
            ? `\u{1F1FC} ${predictionContent} \u{1F1F1}`
            : `\u{1F1F1} ${predictionContent} \u{1F1FC}`;
    }

    await pairingPredictionsMessage.edit(predictionContent);
}

async function updateMatchupPrediction(matchupPredictionsMessageId, winnerOnLeft) {
    const matchupPredictionsMessage = await getPredictionsMessage(matchupPredictionsMessageId);
    const score = matchupPredictionsMessage.content.substring(matchupPredictionsMessage.content.length - 3, matchupPredictionsMessage.content.length);
    const newScore = winnerOnLeft
        ? ''.concat(parseInt(score.charAt(0)) + 1, score.substring(1))
        : score.substring(0, 2).concat(parseInt(score.charAt(2)) + 1);
    const newMatchupPredictionsContent = matchupPredictionsMessage.content.substring(0, matchupPredictionsMessage.content.length - 3).concat(newScore);
    await matchupPredictionsMessage.edit(newMatchupPredictionsContent);
}

export async function resetPredictionWinner(pairingPredictionsMessageId, matchupPredictionsMessageId, winnerWasOnLeft, pairingWasDead, leftPlayerName, rightPlayerName) {
    await resetPairingPrediction(pairingPredictionsMessageId, leftPlayerName, rightPlayerName);

    if (!pairingWasDead) {
        await resetMatchupPrediction(matchupPredictionsMessageId, winnerWasOnLeft);
    }
}

async function resetPairingPrediction(pairingPredictionsMessageId, leftPlayerName, rightPlayerName) {
    const predictionsMessage = await getPredictionsMessage(pairingPredictionsMessageId);
    const newPredictionsContent = `${leftPlayerName} vs ${rightPlayerName}`;
    await predictionsMessage.edit(newPredictionsContent);
}

async function resetMatchupPrediction(matchupPredictionsMessageId, winnerWasOnLeft) {
    const matchupPredictionsMessage = await getPredictionsMessage(matchupPredictionsMessageId);
    const score = matchupPredictionsMessage.content.substring(matchupPredictionsMessage.content.length - 3, matchupPredictionsMessage.content.length);
    const newScore = winnerWasOnLeft
        ? ''.concat(parseInt(score.charAt(0)) - 1, score.substring(1))
        : score.substring(0, 2).concat(parseInt(score.charAt(2)) - 1);
    const newMatchupPredictionsContent = matchupPredictionsMessage.content.substring(0, matchupPredictionsMessage.content.length - 3).concat(newScore);
    await matchupPredictionsMessage.edit(newMatchupPredictionsContent);
}

export async function postPredictionStandings(season, week) {
    const weeklyTopTen = await loadWeeklyTopTenInPredictions(season, week);
    await sendTopTenMessage(weeklyTopTen, bold(`Weekly top ten in predictions for ${weekName(week)}:`));

    if (week > 1) {
        const cumulativeTopTen = await loadCumulativeTopTenInPredictions(season, week);
        await sendTopTenMessage(cumulativeTopTen, bold(`Cumulative top ten in predictions as of ${weekName(week)}:`));
    }
}

async function sendTopTenMessage(topTen, header) {
    const message = header.concat(
        '\n\n',
        topTen.map((val, index) => `${index + 1}. ${userMention(val.predictor_snowflake)} (${val.correctPredictions})`).join('\n')
    );

    const mainRoom = await channels.fetch(process.env.mainRoomId);

    await mainRoom.send({
        content: message,
        allowedMentions: { parse: ['users'] }
    });
}