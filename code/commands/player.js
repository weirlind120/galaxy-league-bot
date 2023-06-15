import { SlashCommandBuilder, PermissionFlagsBits, roleMention } from 'discord.js';
import { confirmAction, sendFailure } from './util.js';
import { db } from '../globals.js';

export const PLAYER_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('player')
        .setDescription("Changes a player's status")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Adds a player to the pool')
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('Player')
                        .setRequired(true))
                .addNumberOption(option =>
                    option
                        .setName('stars')
                        .setDescription('Star rating of player')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('rate')
                .setDescription('Sets a star rating on a player already in the pool')
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('Player')
                        .setRequired(true))
                .addNumberOption(option =>
                    option
                        .setName('stars')
                        .setDescription('Star rating of player')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('assign')
                .setDescription('Assigns a player to a team')
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('Player')
                        .setRequired(true))
                .addRoleOption(option =>
                    option
                        .setName('team')
                        .setDescription('Team to add to')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Role of player on team')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('drop')
                .setDescription('Drops player from their team')
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('Player')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set_inactive')
                .setDescription('Sets a player to inactive (unable to be on a team)')
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('Player to add')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set_active')
                .setDescription('Sets a player to active (able to be on a team)')
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('Player to add')
                        .setRequired(true))),

    async execute(interaction) {
        switch (interaction.options.getSubcommand()) {
            case 'add':
                await addPlayer(interaction);
                break;
            case 'rate':
                await ratePlayer(interaction);
                break;
            case 'assign':
                await assignPlayer(interaction);
                break;
            case 'drop':
                await dropPlayer(interaction);
                break;
            case 'set_inactive':
                await setPlayerInactive(interaction);
                break;
            case 'set_active':
                await setPlayerActive(interaction);
                break;
        }
    }
}

async function addPlayer(interaction) {
    const player = interaction.options.getUser('player');
    const stars = interaction.options.getNumber('stars');

    const existingPlayer = await db.get('SELECT id FROM player WHERE discord_snowflake = ?', player.id);

    let failures = [];
    let prompts = [];

    if (existingPlayer.id) {
        failures.push(`${player} is already in the pool! To adjust their rating, use /player rate.`);
    }

    console.log(failures);

    if (sendFailure(interaction, failures)) {
        return;
    }

    const confirmLabel = 'Confirm Adding Player';
    const confirmMessage = stars
        ? `${player} added to player pool with star rating ${stars}.`
        : `${player} added to player pool.`
    const cancelMessage = `${player} not added to player pool.`;

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run(`INSERT INTO player (name, discord_snowflake, stars) VALUES (?, ?, ?)`, player.username, player.id, stars);
    }
}

async function ratePlayer(interaction) {
    const player = interaction.options.getUser('player');
    const stars = interaction.options.getNumber('stars');

    const existingPlayerQuery = 'SELECT id, stars FROM player WHERE discord_snowflake = ?';
    const existingPlayer = await db.get(existingPlayerQuery, player.id);

    let failures = [];
    let prompts = [];

    if (!existingPlayer.id) {
        failures.push(`${player} is not in the pool; use /player add instead`);
    }
    if (existingPlayer.stars === stars) {
        failures.push(`${player} is already rated ${stars}`);
    }
    if (existingPlayer.stars && existingPlayer.stars !== stars) {
        prompts.push(`${player} is already rated ${existingPlayer.stars}. Do you want to change their rating to ${stars}?`);
    }

    if (sendFailure(interaction, failures)) {
        return;
    }

    const confirmLabel = 'Confirm Rating Change';
    const confirmMessage = `${player}'s rating set to ${stars}`;
    const cancelMessage = `${player}'s rating not updated`;

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run(`UPDATE player SET stars = ? WHERE discord_snowflake = ?`, stars, player.id);
    }
}

async function assignPlayer(interaction) {
    const player = interaction.options.getMember('player');
    const newTeam = interaction.options.getRole('team');
    const newRole = interaction.options.getRole('role');

    const existingPlayerQuery = 'SELECT player.id, player.stars, role.discord_snowflake AS roleSnowflake, role.name AS roleName, team.discord_snowflake AS teamSnowflake FROM player \
                                 INNER JOIN team ON team.id = player.team \
                                 INNER JOIN role ON role.id = player.role \
                                 WHERE player.discord_snowflake = ?';
    const existingPlayer = await db.get(existingPlayerQuery, player.id);

    const existingLeaderQuery = 'SELECT player.id, player.name FROM player \
                                     INNER JOIN team ON team.id = player.team \
                                     INNER JOIN role ON role.id = player.role \
                                     WHERE team.discord_snowflake = ? AND role.discord_snowflake = ?';
    const existingLeader = (newRole.name === "Captain" || newRole.name === "Coach")
        ? await db.get(existingLeaderQuery, newTeam.id, newRole.id)
        : null;

    let failures = [];
    let prompts = [];

    if (existingPlayer.teamSnowflake === newTeam.id && existingPlayer.roleSnowflake === newRole.id) {
        failures.push(`${player.user} is already assigned to ${newTeam} as a ${newRole}`);
    }
    if (existingPlayer.stars === null && newRole.name !== "Coach") {
        failures.push(`${player.user} needs a star rating before being made a ${newRole}. Use /player rate.`);
    }
    if (existingPlayer.teamSnowflake === newTeam.id && existingPlayer.roleSnowflake !== newRole.id) {
        prompts.push(`${player.user} is already on ${newTeam} but will be moved from ${roleMention(existingPlayer.roleSnowflake)} to ${newRole}.`);
    }
    if (existingPlayer.teamSnowflake && existingPlayer.teamSnowflake !== newTeam.id) {
        prompts.push(`${player.user} is already on ${roleMention(existingPlayer.teamSnowflake)} but will be moved to ${newTeam}.`);
    }
    if (existingPlayer.roleName && existingPlayer.roleName !== "Player" && (newRole.name !== existingPlayer.roleName || existingPlayer.teamSnowflake !== newTeam.id)) {
        prompts.push(`${player.user} was ${roleMention(existingPlayer.teamSnowflake)}'s ${roleMention(existingPlayer.roleSnowflake)}. This team will be without a ${roleMention(existingPlayer.roleSnowflake)}.`);
    }
    if (existingLeader) {
        prompts.push(`${existingLeader.name} is already ${newTeam}'s ${newRole}. Teams shouldn't have two of these.`);
    }

    if (sendFailure(interaction, failures)) {
        return;
    }

    const confirmLabel = 'Confirm Player Assignment';
    const confirmMessage = `${player.user} added to ${newTeam} as a ${newRole}.`;
    const cancelMessage = `${player.user}'s team assignment not changed.`;

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        let roles = [...player.roles.cache.keys()];

        roles = roles.filter(role => role !== existingPlayer.roleSnowflake && role !== existingPlayer.teamSnowflake);

        roles.push(newRole.id);
        roles.push(newTeam.id);

        player.roles.set(roles);

        await db.run('UPDATE player SET team = team.id, role = role.id \
                      FROM team, role WHERE team.discord_snowflake = ? AND role.discord_snowflake = ? AND player.discord_snowflake = ?', newTeam.id, newRole.id, player.id);
    }
}

async function dropPlayer(interaction) {
    const player = interaction.options.getMember('player');

    const existingPlayerQuery = 'SELECT player.id, role.discord_snowflake AS roleSnowflake, role.name AS roleName, team.discord_snowflake AS teamSnowflake FROM player \
                                 INNER JOIN team ON team.id = player.team \
                                 INNER JOIN role ON role.id = player.role \
                                 WHERE player.discord_snowflake = ?';
    const existingPlayer = await db.get(existingPlayerQuery, player.id);

    let failures = [];
    let prompts = [];

    if (!existingPlayer.teamSnowflake) {
        failures.push(`${player.user} is already not on a team.`);
    }
    if (existingPlayer.roleName && existingPlayer.roleName !== "Player") {
        prompts.push(`${player.user} was ${roleMention(existingPlayer.teamSnowflake)}'s ${roleMention(existingPlayer.roleSnowflake)}. This team will be without a ${roleMention(existingPlayer.roleSnowflake)}.`);
    }

    if (sendFailure(interaction, failures)) {
        return;
    }

    const confirmLabel = 'Confirm Player Dropping';
    const confirmMessage = `${player.user} dropped from ${roleMention(existingPlayer.teamSnowflake)}.`
    const cancelMessage = `${player.user}'s team assignment not changed.`

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        player.roles.remove([existingPlayer.roleSnowflake, existingPlayer.teamSnowflake]);

        await db.run('UPDATE player SET role = NULL, team = NULL WHERE id = ?', existingPlayer.id);
    }
}

async function setPlayerInactive(interaction) {
    const player = interaction.options.getUser('player');

    const existingPlayerQuery = 'SELECT player.id, player.active, role.discord_snowflake AS roleSnowflake, role.name AS roleName, team.discord_snowflake AS teamSnowflake FROM player \
                                 INNER JOIN team ON team.id = player.team \
                                 INNER JOIN role ON role.id = player.role \
                                 WHERE player.discord_snowflake = ?';
    const existingPlayer = await db.get(existingPlayerQuery, player.id);

    let failures = [];
    let prompts = [];

    if (!existingPlayer.active) {
        failures.push(`${player} is already inactive.`);
    }
    if (existingPlayer.teamSnowflake) {
        prompts.push(`${player} was on ${roleMention(existingPlayer.teamSnowflake)}. They will be dropped.`);
    }
    if (existingPlayer.roleName && existingPlayer.roleName !== "Player") {
        prompts.push(`${player} was ${roleMention(existingPlayer.teamSnowflake)}'s ${roleMention(existingPlayer.roleSnowflake)}. This team will be without a ${roleMention(existingPlayer.roleSnowflake)}.`);
    }

    if (sendFailure(interaction, failures)) {
        return;
    }

    const confirmLabel = 'Confirm Player Deactivation';
    const confirmMessage = existingPlayer.teamSnowflake
        ? `${player} dropped from ${roleMention(existingPlayer.teamSnowflake)} and set to inactive (cannot be on a team).`
        : `${player} set to inactive (cannot be on a team).`;
    const cancelMessage = `${player}'s active status not changed.`;

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run('UPDATE player SET role = NULL, team = NULL, active = 0 WHERE id = ?', existingPlayer.id)
    }
}

async function setPlayerActive(interaction) {
    const player = interaction.options.getUser('player');

    const existingPlayerQuery = 'SELECT id, active FROM player WHERE player.discord_snowflake = ?';
    const existingPlayer = await db.get(existingPlayerQuery, player.id);

    let failures = [];
    let prompts = [];

    if (existingPlayer.active) {
        failures.push(`${player} is already active.`);
    }

    if (sendFailure(interaction, failures)) {
        return;
    }

    const confirmLabel = 'Confirm Player Activation';
    const confirmMessage = `${player} set to active (can be on a team).`;
    const cancelMessage = `${player}'s inactive status not changed`;

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run('UPDATE player SET active = 1 WHERE id = ?', existingPlayer.id);
    }
}