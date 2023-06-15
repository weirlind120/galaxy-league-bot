import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import ALL_COMMANDS from './commands/allcommands.js';

const commands = [];

for (const command of ALL_COMMANDS) {
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.token);

// and deploy your commands!
(async () => {
	try {
		console.log(commands);
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(process.env.clientId, process.env.guildId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();