import { channels } from '../globals.js';
import { saveScheduleMessageId } from '../../database/matchup.js';
import { userMention, roleMention } from 'discord.js';
import { saveScheduledTime } from '../../database/pairing.js';

export async function postScheduling(groupedPairings) {
    const scheduleChannel = await channels.fetch(process.env.scheduleChannelId);

    for (const pairingSet of groupedPairings.values()) {
        await postSchedulingForMatchup(scheduleChannel, pairingSet);
    }
}

async function postSchedulingForMatchup(scheduleChannel, pairingSet) {
    let content = `${roleMention(pairingSet[0].leftTeamSnowflake)} vs ${roleMention(pairingSet[0].rightTeamSnowflake)} scheduled times:\n\n`.concat(
        pairingSet.map(pairing => `${userMention(pairing.leftPlayerSnowflake)} vs ${userMention(pairing.rightPlayerSnowflake)}:`).join('\n')
    );

    const message = await scheduleChannel.send({
        content: content,
        allowedMentions: { parse: [] }
    });

    await saveScheduleMessageId(message.id, pairingSet[0].matchup);
}

export async function changeScheduledPlayer(scheduleMessageId, replacedPlayerSnowflake, newPlayerSnowflake) {
    const scheduleMessage = await getScheduleMessage(scheduleMessageId);
    const newScheduleMessage = scheduleMessage.content.replace(RegExp(`^(.*${replacedPlayerSnowflake}.*>:).*$`, 'm'), `$1`).replace(replacedPlayerSnowflake, newPlayerSnowflake);
    await scheduleMessage.edit(newScheduleMessage);
}

async function getScheduleMessage(scheduleMessageId) {
    const scheduleChannel = await channels.fetch(process.env.scheduleChannelId);
    return await scheduleChannel.messages.fetch({ message: scheduleMessageId, force: true });
}

export async function setScheduledTime(playerSnowflake, scheduleMessageId, dateString, pairingId, date) {
    const scheduleMessage = await getScheduleMessage(scheduleMessageId);
    const newScheduleMessage = scheduleMessage.content.replace(RegExp(`^(.*${playerSnowflake}.*>:).*$`, 'm'), `$1 ${dateString}`);
    await scheduleMessage.edit(newScheduleMessage);

    if (date) {
        await saveScheduledTime(pairingId, date);
    }
}