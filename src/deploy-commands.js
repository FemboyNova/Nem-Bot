require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✓ Loaded command: ${command.data.name}`);
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`\nStarting refresh of ${commands.length} application (/) commands...`);

        // Deploy to specific guild (faster for development)
        const guildId = process.env.DISCORD_SERVER_ID;
        
        if (guildId) {
            const data = await rest.put(
                Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId),
                { body: commands },
            );
            console.log(`✓ Successfully reloaded ${data.length} guild commands.`);
        } else {
            // Deploy globally (takes up to 1 hour to propagate)
            const data = await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                { body: commands },
            );
            console.log(`✓ Successfully reloaded ${data.length} global commands.`);
        }
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
})();
