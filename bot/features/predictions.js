import { userMention, roleMention, bold } from 'discord.js';
import { db, channels, currentSeason } from '../globals.js';
import { weekName } from '../commands/util.js';

export async function postPredictions(groupedPairings) {
    const predictionsChannel = await channels.fetch(process.env.predictionsChannelId);
    for (const pairingSet of groupedPairings.values()) {
        await postPredictionsForMatchup(predictionsChannel, pairingSet);
    }
}

async function postPredictionsForMatchup(predictionsChannel, pairingSet) {
    const headerMessage = `${pairingSet[0].leftEmoji} ${roleMention(pairingSet[0].leftTeamSnowflake)} vs ${roleMention(pairingSet[0].rightTeamSnowflake)} ${pairingSet[0].rightEmoji}\n \
                                           Current score: 0-0`;
    await sendPredictionMessage(predictionsChannel, headerMessage, pairingSet[0].leftEmoji, pairingSet[0].rightEmoji, 'matchup', pairingSet[0].matchup);

    for (const pairing of pairingSet) {
        const pairingMessage = `${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(pairing.rightPlayerSnowflake)}`;
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

    await savePredictionsMessage(table, message.id, primaryKey);
}

async function savePredictionsMessage(table, messageId, primaryKey) {
    await db.run(`UPDATE ${table} SET predictions_message = ? WHERE id = ?`, messageId, primaryKey);
}

export async function changePredictionsPlayer(predictionsMessageId, replacedPlayerSnowflake, newPlayerSnowflake) {
    const predictionsMessage = await getPredictionsMessage(predictionsMessageId);

    const newPredictionContent = predictionsMessage.content.replace(replacedPlayerSnowflake, newPlayerSnowflake);
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

async function savePredictionsToDatabase(pairingId, predictions, leftPlayer, rightPlayer) {
    let insertQuery = 'INSERT INTO prediction (pairing, predictor_snowflake, predicted_winner) VALUES\n';

    insertQuery = insertQuery.concat(
        predictions[leftPlayer].map(reacter => `(${pairingId}, ${reacter}, ${leftPlayer}),\n`).join(''),
        predictions[rightPlayer].map(reacter => `(${pairingId}, ${reacter}, ${rightPlayer})`).join(',\n')
    );

    await db.run(insertQuery);
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

export async function resetPredictionWinner(pairingPredictionsMessageId, matchupPredictionsMessageId, winnerWasOnLeft, pairingWasDead, leftPlayerSnowflake, rightPlayerSnowflake) {
    await resetPairingPrediction(pairingPredictionsMessageId, leftPlayerSnowflake, rightPlayerSnowflake);

    if (!pairingWasDead) {
        await resetMatchupPrediction(matchupPredictionsMessageId, winnerWasOnLeft);
    }
}

async function resetPairingPrediction(pairingPredictionsMessageId, leftPlayerSnowflake, rightPlayerSnowflake) {
    const predictionsMessage = await getPredictionsMessage(pairingPredictionsMessageId);
    const newPredictionsContent = `${userMention(leftPlayerSnowflake)} vs ${userMention(rightPlayerSnowflake)}`;
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
    const mainRoom = await channels.fetch(process.env.mainRoomId);

    const cumulativeTopTen = await getCumulativeTopTenInPredictions(season, week);
    const cumulativeStandingsMessage = bold(`Cumulative top ten in predictions as of ${weekName(week)}:`).concat(
        '\n\n',
        cumulativeTopTen.map((val, index) => `${index + 1}. ${userMention(val.predictor_snowflake)} (${val.correctPredictions})`).join('\n')
    );
    await mainRoom.send({ content: cumulativeStandingsMessage, allowedMentions: { parse: ['users'] } });

    if (week > 1) {
        const weeklyTopTen = await getWeeklyTopTenInPredictions(season, week);
        const weeklyStandingsMessage = bold(`Weekly top ten in predictions for ${weekName(week)}:`).concat(
            '\n\n',
            weeklyTopTen.map((val, index) => `${index + 1}. ${userMention(val.predictor_snowflake)} (${val.correctPredictions})`).join('\n')
        );
        await mainRoom.send({ content: weeklyStandingsMessage, allowedMentions: { parse: ['users'] } });
    }
}

async function getCumulativeTopTenInPredictions(season, week) {
    const topTenQuery = 
        'SELECT predictor_snowflake, count(predictor_snowflake) AS correctPredictions FROM prediction \
         INNER JOIN pairing ON pairing = pairing.id \
         INNER JOIN matchup ON pairing.matchup = matchup.id \
         INNER JOIN week ON matchup.week = week.id \
         WHERE pairing.winner IS NOT NULL AND pairing.winner = predicted_winner AND pairing.game1 IS NOT NULL AND week.season = ? AND week.number <= ? \
         GROUP BY predictor_snowflake \
         ORDER BY correctPredictions DESC LIMIT 10';

    return await db.all(topTenQuery, season, week);
}

async function getWeeklyTopTenInPredictions(season, week) {
    const topTenQuery =
        'SELECT predictor_snowflake, count(predictor_snowflake) AS correctPredictions FROM prediction \
         INNER JOIN pairing ON pairing = pairing.id \
         INNER JOIN matchup ON pairing.matchup = matchup.id \
         INNER JOIN week ON matchup.week = week.id \
         WHERE pairing.winner IS NOT NULL AND pairing.winner = predicted_winner AND pairing.game1 IS NOT NULL AND week.season = ? AND week.number = ? \
         GROUP BY predictor_snowflake \
         ORDER BY correctPredictions DESC LIMIT 10';

    return await db.all(topTenQuery, season, week);
}