require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { REST, Routes, Client, GatewayIntentBits } = require('discord.js');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const clientId = process.env.DISCORD_CLIENT_ID;

(async () => {
    try {
        console.log('Clearing all slash commands...\n');

        // Clear global commands first
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: [] },
        );
        console.log('✓ Cleared all global commands');

        // Get all guilds the bot is in and clear commands from each
        const client = new Client({ intents: [GatewayIntentBits.Guilds] });
        
        await client.login(process.env.DISCORD_TOKEN);
        
        // Wait for client to be ready
        await new Promise(resolve => {
            client.once('ready', resolve);
        });

        console.log(`\nBot is in ${client.guilds.cache.size} server(s):`);
        
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: [] },
                );
                console.log(`✓ Cleared commands from: ${guild.name} (${guildId})`);
            } catch (error) {
                console.log(`✗ Failed to clear from ${guild.name}: ${error.message}`);
            }
        }

        console.log('\n✅ All commands cleared!');
        client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error clearing commands:', error);
        process.exit(1);
    }
})();
