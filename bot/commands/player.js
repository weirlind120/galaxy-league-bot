import { SlashCommandBuilder, PermissionFlagsBits, roleMention, userMention } from 'discord.js';
import { confirmAction, baseHandler } from './util.js';
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
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Display name of player (for spreadsheet)')
                        .setRequired(true))
                .addNumberOption(option =>
                    option
                        .setName('stars')
                        .setDescription('Star rating of player')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('rename')
                .setDescription("Changes a player's name on the sheet")
                .addUserOption(option =>
                    option
                        .setName('player')
                        .setDescription('Player')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('new_name')
                        .setDescription('New name')
                        .setRequired(true)))
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
            case 'rename':
                await renamePlayer(interaction);
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
    async function dataCollector(interaction) {
        const player = interaction.options.getUser('player');
        const name = interaction.options.getString('name');
        const stars = interaction.options.getNumber('stars');

        const existingPlayer = await db.get('SELECT id FROM player WHERE discord_snowflake = ?', player.id);

        return { playerSnowflake: player.id, name, stars, existingPlayer };
    }

    function verifier(data) {
        const { playerSnowflake, stars, existingPlayer } = data;
        let failures = [], prompts = [];

        if (existingPlayer) {
            failures.push(`${userMention(playerSnowflake)} is already in the pool! To adjust their name, use /player rename. To adjust their rating, use /player rate.`);
        }

        const confirmLabel = 'Confirm Adding Player';
        const confirmMessage = stars
            ? `${userMention(playerSnowflake)} added to player pool with star rating ${stars}.`
            : `${userMention(playerSnowflake)} added to player pool.`
        const cancelMessage = `${userMention(playerSnowflake)} not added to player pool.`;

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        await db.run(`INSERT INTO player (name, discord_snowflake, stars) VALUES (?, ?, ?)`, data.name, data.playerSnowflake, data.stars);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}

async function renamePlayer(interaction) {
    async function dataCollector(interaction) {
        const player = interaction.options.getUser('player');
        const name = interaction.options.getString('new_name');

        const existingPlayer = await db.get('SELECT name FROM player WHERE discord_snowflake = ?', player.id);

        if (!existingPlayer) {
            return { failure: `${player} is not in the pool; use /player add instead` };
        }

        return { playerSnowflake: player.id, name, existingPlayerName: existingPlayer.name };
    }

    function verifier(data) {
        const { playerSnowflake, name, existingPlayerName } = data;
        let failures = [], prompts = [];

        if (existingPlayerName === name) {
            failures.push(`${userMention(playerSnowflake)} is already named ${name}`);
        }

        const confirmLabel = 'Confirm Rename Player';
        const confirmMessage = `${userMention(playerSnowflake)} renamed from ${existingPlayerName} to ${name}.`;
        const cancelMessage = `${userMention(playerSnowflake)} not renamed from ${existingPlayerName}.`;

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        await db.run(`UPDATE player SET name = ? WHERE discord_snowflake = ?`, data.name, data.playerSnowflake);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}

async function ratePlayer(interaction) {
    async function dataCollector(interaction) {
        const player = interaction.options.getUser('player');
        const stars = interaction.options.getNumber('stars');

        const existingPlayer = await db.get('SELECT id, stars FROM player WHERE discord_snowflake = ?', player.id);

        if (!existingPlayer) {
            return { failure: `${player} is not in the pool; use /player add instead` };
        }

        return { playerSnowflake: player.id, stars, existingPlayerStars: existingPlayer.stars };
    }

    function verifier(data) {
        const { playerSnowflake, stars, existingPlayerStars } = data;
        let failures = [], prompts = [];

        if (existingPlayerStars === stars) {
            failures.push(`${userMention(playerSnowflake)} is already rated ${stars}.`);
        }

        if (existingPlayerStars && existingPlayer.stars !== stars) {
            prompts.push(`${userMention(playerSnowflake)} is already rated ${existingPlayerStars}. Do you want to change their rating to ${stars}?`);
        }

        const confirmLabel = 'Confirm Rating Change';
        const confirmMessage = `${userMention(playerSnowflake)}'s rating set to ${stars}`;
        const cancelMessage = `${userMention(playerSnowflake)}'s rating not updated`;

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        await db.run(`UPDATE player SET stars = ? WHERE discord_snowflake = ?`, data.stars, data.playerSnowflake);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}

async function assignPlayer(interaction) {
    async function dataCollector(interaction) {
        const player = interaction.options.getMember('player');
        const newTeam = interaction.options.getRole('team');
        const newRole = interaction.options.getRole('role');

        const existingPlayerQuery =
            'SELECT player.id, player.stars, role.discord_snowflake AS roleSnowflake, role.name AS roleName, team.discord_snowflake AS teamSnowflake FROM player \
             LEFT JOIN team ON team.id = player.team \
             LEFT JOIN role ON role.id = player.role \
             WHERE player.discord_snowflake = ?';
        const existingPlayer = await db.get(existingPlayerQuery, player.id);

        if (!existingPlayer) {
            return { failure: `${player} is not in the pool; use /player add first.` };
        }

        const existingLeaderQuery =
            'SELECT player.discord_snowflake FROM player \
             INNER JOIN team ON team.id = player.team \
             INNER JOIN role ON role.id = player.role \
             WHERE team.discord_snowflake = ? AND role.discord_snowflake = ?';
        const existingLeader = (newRole.name === "Captain" || newRole.name === "Coach")
            ? await db.get(existingLeaderQuery, newTeam.id, newRole.id)
            : null;

        return { player, newTeam, newRole, existingPlayer, existingLeader };
    }

    function verifier(data) {
        const { player, newTeam, newRole, existingPlayer, existingLeader } = data;
        let failures = [], prompts = [];

        if (existingPlayer.teamSnowflake === newTeam.id && existingPlayer.roleSnowflake === newRole.id) {
            failures.push(`${player} is already assigned to ${newTeam} as a ${newRole}`);
        }

        if (existingPlayer.stars === null && newRole.name !== "Coach") {
            failures.push(`${player} needs a star rating before being made a ${newRole}. Use /player rate.`);
        }

        if (existingPlayer.teamSnowflake === newTeam.id && existingPlayer.roleSnowflake !== newRole.id) {
            prompts.push(`${player} is already on ${newTeam} but will be moved from ${roleMention(existingPlayer.roleSnowflake)} to ${newRole}.`);
        }

        if (existingPlayer.teamSnowflake && existingPlayer.teamSnowflake !== newTeam.id) {
            prompts.push(`${player} is on ${roleMention(existingPlayer.teamSnowflake)} but will be moved to ${newTeam}.`);
        }

        if (existingPlayer.roleName && existingPlayer.roleName !== "Player" && (newRole.name !== existingPlayer.roleName || existingPlayer.teamSnowflake !== newTeam.id)) {
            prompts.push(`${player} was ${roleMention(existingPlayer.teamSnowflake)}'s ${roleMention(existingPlayer.roleSnowflake)}. This team will be without a ${roleMention(existingPlayer.roleSnowflake)}.`);
        }

        if (existingLeader) {
            prompts.push(`${userMention(existingLeader.discord_snowflake)} is already ${newTeam}'s ${newRole}. Teams shouldn't have two of these.`);
        }

        const confirmLabel = 'Confirm Player Assignment';
        const confirmMessage = `${player} added to ${newTeam} as a ${newRole}.`;
        const cancelMessage = `${player}'s team assignment not changed.`;

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { player, newTeam, newRole, existingPlayer } = data;
        let roles = [...player.roles.cache.keys()];

        roles = roles.filter(role => role !== existingPlayer.roleSnowflake && role !== existingPlayer.teamSnowflake);

        roles.push(newRole.id);
        roles.push(newTeam.id);

        player.roles.set(roles);

        await db.run('UPDATE player SET team = team.id, role = role.id \
                      FROM team, role WHERE team.discord_snowflake = ? AND role.discord_snowflake = ? AND player.discord_snowflake = ?', newTeam.id, newRole.id, player.id);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);

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
    async function dataCollector(interaction) {
        const player = interaction.options.getMember('player');

        const existingPlayerQuery = 
            'SELECT player.id, role.name AS roleName, role.discord_snowflake AS roleSnowflake, team.discord_snowflake AS teamSnowflake FROM player \
             LEFT JOIN team ON team.id = player.team \
             LEFT JOIN role ON role.id = player.role \
             WHERE player.discord_snowflake = ?';
        const existingPlayer = await db.get(existingPlayerQuery, player.id);

        if (!existingPlayer) {
            return { failure: `${player} is not in the pool.` };
        }

        return { player, existingPlayer };
    }

    function verifier(data) {
        const { player, existingPlayer } = data;
        let failures = [], prompts = [];

        if (!existingPlayer.teamSnowflake) {
            failures.push(`${player} is already not on a team.`);
        }

        if (existingPlayer.roleName === "Captain" || existingPlayer.roleName === "Coach") {
            prompts.push(`${player} was ${roleMention(existingPlayer.teamSnowflake)}'s ${existingPlayer.roleName}. This team will be without a ${existingPlayer.roleName}.`);
        }

        const confirmLabel = 'Confirm Player Dropping';
        const confirmMessage = `${player} dropped from ${roleMention(existingPlayer.teamSnowflake)}.`;
        const cancelMessage = `${player}'s team assignment not changed.`;

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { player, existingPlayer } = data;

        await db.run('UPDATE player SET role = NULL, team = NULL WHERE discord_snowflake = ?', player.id);
        player.roles.remove([existingPlayer.roleSnowflake, existingPlayer.teamSnowflake]);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}

async function setPlayerInactive(interaction) {
    async function dataCollector(interaction) {
        const player = interaction.options.getMember('player');

        const existingPlayerQuery = 
            'SELECT player.id, role.name AS roleName, role.discord_snowflake AS roleSnowflake, team.discord_snowflake AS teamSnowflake FROM player \
             LEFT JOIN team ON team.id = player.team \
             LEFT JOIN role ON role.id = player.role \
             WHERE player.discord_snowflake = ?';
        const existingPlayer = await db.get(existingPlayerQuery, player.id);

        if (!existingPlayer) {
            return { failure: `${player} is not in the pool.` };
        }

        return { player, existingPlayer };
    }

    function verifier(data) {
        const { player, existingPlayer } = data;
        let failures = [], prompts = [];

        if (existingPlayer.teamSnowflake) {
            prompts.push(`${player} was on ${roleMention(existingPlayer.teamSnowflake)}. They will be dropped.`);
        }

        if (existingPlayer.roleName === "Captain" || existingPlayer.roleName === "Coach") {
            prompts.push(`${player} was ${roleMention(existingPlayer.teamSnowflake)}'s ${existingPlayer.roleName}. This team will be without a ${existingPlayer.roleName}.`);
        }

        const confirmLabel = 'Confirm Player Deactivation';
        const confirmMessage = existingPlayer.teamSnowflake
            ? `${player} dropped from ${roleMention(existingPlayer.teamSnowflake)} and set to inactive (cannot be on a team).`
            : `${player} set to inactive (cannot be on a team).`;
        const cancelMessage = `${player}'s active status not changed.`;

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        const { player, existingPlayer } = data;
        await db.run('UPDATE player SET role = NULL, team = NULL, active = 0 WHERE discord_snowflake = ?', player.id);

        if (existingPlayer.teamSnowflake) {
            player.roles.remove([existingPlayer.roleSnowflake, existingPlayer.teamSnowflake]);
        }
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}

async function setPlayerActive(interaction) {
    async function dataCollector(interaction) {
        const player = interaction.options.getUser('player');

        const existingPlayer = await db.get('SELECT id, active FROM player WHERE player.discord_snowflake = ?', player.id);

        if (!existingPlayer) {
            return { failure: `${player} is not in the pool; use /player add instead.` };
        }

        return { playerSnowflake: player.id };
    }

    function verifier(data) {
        const { playerSnowflake } = data;
        let failures = [], prompts = [];

        const confirmLabel = 'Confirm Player Activation';
        const confirmMessage = `${userMention(playerSnowflake)} set to active (can be on a team).`;
        const cancelMessage = `${userMention(playerSnowflake)}'s inactive status not changed`;

        return [failures, prompts, confirmLabel, confirmMessage, cancelMessage];
    }

    async function onConfirm(data) {
        await db.run('UPDATE player SET active = 1 WHERE discord_snowflake = ?', data.playerSnowflake);
    }

    await baseHandler(interaction, dataCollector, verifier, onConfirm, false, false);
}