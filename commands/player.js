import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'

export const PLAYER_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('player')
        .setDescription("Changes a player's status")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
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

    async execute(interaction, db) {
        switch (interaction.options.getSubcommand()) {
            case 'add':
                await addPlayer(interaction, db);
                break;
            case 'rate':
                await ratePlayer(interaction, db);
                break;
            case 'assign':
                await assignPlayer(interaction, db);
                break;
            case 'drop':
                await dropPlayer(interaction, db);
                break;
            case 'set_inactive':
                await setPlayerInactive(interaction, db);
                break;
            case 'set_active':
                await setPlayerActive(interaction, db);
                break;
        }
    }
}

async function addPlayer(interaction, db) {
    const player = interaction.options.getUser('player');
    const stars = interaction.options.getNumber('stars');

    if (await db.get('SELECT id FROM players WHERE discord_snowflake = ?', player.id)) {
        sendFailure(interaction, `${player.username} is already in the pool! To adjust their rating, use /player rate`);
        return;
    }

    const confirmLabel = 'Confirm Adding Player';
    const confirmMessage = stars
        ? `${player.username} added to player pool with star rating ${stars}.`
        : `${player.username} added to player pool.`
    const cancelMessage = `Action canceled: ${player.username} not added to player pool.`;

    let prompts = [];

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run(`INSERT INTO players (name, discord_snowflake, stars) VALUES (?, ?, ?)`, player.username, player.id, player.stars);
    }
}

async function ratePlayer(interaction, db) {
    const player = interaction.options.getUser('player');
    const stars = interaction.options.getNumber('stars');

    const existingPlayerQuery = 'SELECT id, stars FROM players WHERE players.discord_snowflake = ?';
    const existingPlayer = await db.get(existingPlayerQuery, player.id);

    if (!existingPlayer.id) {
        sendFailure(interaction, `${player.username} is not in the pool; use /player add instead`);
        return;
    }
    if (existingPlayer.stars === stars) {
        sendFailure(interaction, `${player.username} is already rated ${stars}`);
        return;
    }

    const confirmLabel = 'Confirm Rating Change';
    const confirmMessage = `${player.username}'s rating set to ${stars}`;
    const cancelMessage = `Action canceled: ${player.username}'s rating not updated`;

    let prompts = [];

    if (existingPlayer.stars && existingPlayer.stars !== stars) {
        prompts.push(`${player.username} is already rated ${existingPlayer.stars}. Do you want to change their rating to ${stars}?`);
    }

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run(`UPDATE players SET stars = ? WHERE discord_snowflake = ?`, player.stars, player.id);
    }
}

async function assignPlayer(interaction, db) {
    const player = interaction.options.getMember('player');
    const newTeam = interaction.options.getRole('team');
    const newRole = interaction.options.getRole('role');

    const existingPlayerQuery = 'SELECT players.id, players.stars, roles.discord_snowflake AS roleSnowflake, roles.name AS roleName, teams.discord_snowflake AS teamSnowflake, teams.name AS teamName FROM players \
                                 LEFT JOIN teams ON teams.id = players.team \
                                 LEFT JOIN roles ON roles.id = players.role \
                                 WHERE players.discord_snowflake = ?';
    const existingPlayer = await db.get(existingPlayerQuery, player.id);

    if (existingPlayer.teamSnowflake === newTeam.id && existingPlayer.roleSnowflake === newRole.id) {
        sendFailure(interaction, `${player.user.username} is already assigned to ${newTeam.name} as a ${newRole.name}`);
        return;
    }

    if (existingPlayer.stars === null && newRole.name !== "Coach") {
        sendFailure(interaction, `${player.user.username} needs a star rating before being made a ${newRole.name}. Use /player rate.`);
        return;
    }

    let existingLeader;
    if (newRole.name === "Captain" || newRole.name === "Coach") {
        const existingLeaderQuery = 'SELECT players.id, players.name FROM players \
                                     LEFT JOIN teams ON teams.id = players.team \
                                     LEFT JOIN roles ON roles.id = players.role \
                                     WHERE teams.discord_snowflake = ? AND roles.discord_snowflake = ?';
        existingLeader = await db.get(existingLeaderQuery, newTeam.id, newRole.id);
    }

    const confirmLabel = 'Confirm Player Assignment';
    const confirmMessage = `${player.user.username} added to ${newTeam.name} as a ${newRole.name}.`;
    const cancelMessage = `Action canceled: ${player.user.username}'s team assignment not changed.`;

    let prompts = [];

    if (existingPlayer.teamSnowflake === newTeam.id && existingPlayer.roleSnowflake !== newRole.id) {
        prompts.push(`${player.user.username} is already on ${newTeam.name} but will be moved from ${existingPlayer.roleName} to ${newRole.name}.`);
    }
    if (existingPlayer.teamSnowflake && existingPlayer.teamSnowflake !== newTeam.id) {
        prompts.push(`${player.user.username} is already on ${existingPlayer.teamName} but will be moved to ${newTeam.name}.`);
    }
    if (existingPlayer.roleName && existingPlayer.roleName !== "Player" && (newRole.name !== existingPlayer.roleName || existingPlayer.teamSnowflake !== newTeam.id)) {
        prompts.push(`${player.user.username} was ${existingPlayer.teamName}'s ${existingPlayer.roleName}. This team will be without a ${existingPlayer.roleName}.`);
    }
    if (existingLeader) {
        prompts.push(`${existingLeader.name} is already ${newTeam.name}'s ${newRole.name}. Teams shouldn't have two of these.`);
    }

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        let roles = [...player.roles.cache.keys()];

        roles = roles.filter(role => role !== existingPlayer.roleSnowflake && role !== existingPlayer.teamSnowflake)

        roles.push(newRole.id)
        roles.push(newTeam.id);

        player.roles.set(roles);

        await db.run('UPDATE players SET team = teams.id, role = roles.id \
                      FROM teams, roles WHERE teams.discord_snowflake = ? AND roles.discord_snowflake = ? AND players.discord_snowflake = ?', newTeam.id, newRole.id, player.id);
    }
}

async function dropPlayer(interaction, db) {
    const player = interaction.options.getMember('player');

    const existingPlayerQuery = 'SELECT players.id, roles.discord_snowflake AS roleSnowflake, roles.name AS roleName, teams.discord_snowflake AS teamSnowflake, teams.name AS teamName FROM players \
                                 LEFT JOIN teams ON teams.id = players.team \
                                 LEFT JOIN roles ON roles.id = players.role \
                                 WHERE players.discord_snowflake = ?';
    const existingPlayer = await db.get(existingPlayerQuery, player.id);

    if (!existingPlayer.teamSnowflake) {
        sendFailure(interaction, `${player.user.username} is already not on a team.`);
        return;
    }

    const confirmLabel = 'Confirm Player Dropping';
    const confirmMessage = `${player.user.username} dropped from ${existingPlayer.teamName}.`
    const cancelMessage = `Action canceled: ${player.user.username}'s team assignment not changed.`

    let prompts = [];

    if (existingPlayer.roleName && existingPlayer.roleName !== "Player") {
        prompts.push(`${player.user.username} was ${existingPlayer.teamName}'s ${existingPlayer.roleName}. This team will be without a ${existingPlayer.roleName}.`);
    }

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        player.roles.remove([existingPlayer.roleSnowflake, existingPlayer.teamSnowflake]);

        await db.run('UPDATE players SET role = NULL, team = NULL WHERE id = ?', existingPlayer.id);
    }
}

async function setPlayerInactive(interaction, db) {
    const player = interaction.options.getUser('player');

    const existingPlayerQuery = 'SELECT players.id, players.active, roles.discord_snowflake AS roleSnowflake, roles.name AS roleName, teams.discord_snowflake AS teamSnowflake, teams.name AS teamName FROM players \
                                 LEFT JOIN teams ON teams.id = players.team \
                                 LEFT JOIN roles ON roles.id = players.role \
                                 WHERE players.discord_snowflake = ?';
    const existingPlayer = await db.get(existingPlayerQuery, player.id);

    if (!existingPlayer.active) {
        sendFailure(interaction, `${player.username} is already inactive.`);
        return;
    }

    const confirmLabel = 'Confirm Player Deactivation';
    const confirmMessage = existingPlayer.teamName
        ? `${player.username} dropped from ${existingPlayer.teamName} and set to inactive (cannot be on a team).`
        : `${player.username} set to inactive (cannot be on a team).`;
    const cancelMessage = `Action canceled: ${player.username}'s active status not changed.`;

    let prompts = [];

    if (existingPlayer.teamName) {
        prompts.push(`${player.username} was on ${existingPlayer.teamName}. They will be dropped.`);
    }
    if (existingPlayer.roleName && existingPlayer.roleName !== "Player") {
        prompts.push(`${player.username} was ${existingPlayer.teamName}'s ${existingPlayer.roleName}. This team will be without a ${existingPlayer.roleName}.`);
    }

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run('UPDATE players SET role = NULL, team = NULL, active = 0 WHERE id = ?', existingPlayer.id)
    }
}

async function setPlayerActive(interaction, db) {
    const player = interaction.options.getUser('player');

    const existingPlayerQuery = 'SELECT id, active FROM players WHERE players.discord_snowflake = ?';
    const existingPlayer = await db.get(existingPlayerQuery, player.id);

    if (existingPlayer.active) {
        sendFailure(interaction, `${player.username} is already active.`);
        return;
    }

    const confirmLabel = 'Confirm Player Activation';
    const confirmMessage = `${player.username} set to active (can be on a team).`;
    const cancelMessage = `Action canceled: ${player.username}'s inactive status not changed`;

    let prompts = [];

    if (await confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage)) {
        await db.run('UPDATE players SET active = 1 WHERE id = ?', existingPlayer.id);
    }
}

async function confirmAction(interaction, confirmLabel, prompts, confirmMessage, cancelMessage) {
    if (!prompts || prompts.length === 0) {
        queries.forEach(async (query) => await db.run(query));
        await interaction.reply(confirmMessage);
        return true;
    }

    const prompt = prompts.join('\n');
    const cancelButton = new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
    const confirmButton = new ButtonBuilder().setCustomId('confirm').setLabel(confirmLabel).setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(cancelButton).addComponents(confirmButton);
    const response = await interaction.reply({ content: prompt, components: [row], ephemeral: true });

    const collectorFilter = i => i.user.id === interaction.user.id;

    try {
        const confirmation = await response.awaitMessageComponent({ filter: collectorFilter, time: 60000 });

        if (confirmation.customId === 'confirm') { 
            await confirmation.update({ components: [] });
            await interaction.followUp(`${prompt}\n${confirmMessage}`);
            return true;
        }
        else {
            await confirmation.update({ content: cancelMessage, components: [] });
        }
    } catch (e) {
        await interaction.editReply({ content: 'Confirmation not received within 1 minute, cancelling', components: [] });
    }

    return false;
}

async function sendFailure(interaction, message) {
    await interaction.reply({ content: message, ephemeral: true });
}