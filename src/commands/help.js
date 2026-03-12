/**
 * =============================================================================
 * HELP COMMAND - /help
 * =============================================================================
 * Displays a comprehensive help embed with all available commands,
 * time formats, supported games, and automatic features.
 * 
 * Response is ephemeral (only visible to the user who ran the command).
 * =============================================================================
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GAME_CONFIGS } = require('../utils/gameConfig');

// =============================================================================
// SLASH COMMAND
// =============================================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands and usage'),

    /**
     * Execute the /help command
     */
    async execute(interaction) {
        // Build game list with emojis
        const gameList = Object.entries(GAME_CONFIGS)
            .map(([key, config]) => `${config.emoji} ${config.name}`)
            .join(', ');

        const embed = new EmbedBuilder()
            .setTitle('Nemesis Bot Help')
            .setColor(0x5865F2)
            .setDescription('Manage esports match announcements and Discord events.')
            .addFields(
                {
                    name: '📝 Adding Matches',
                    value: [
                        '`/add` - Add a new match',
                        '**Time formats supported:**',
                        '• `today 7pm` or `today 19:00`',
                        '• `tomorrow 3pm` or `tomorrow 15:00`',
                        '• `25/03 7pm` or `25/03/2026 19:00`',
                        '• `in 2 hours` or `in 30 minutes`',
                        '',
                        '*All times use UK timezone (Europe/London)*',
                    ].join('\n'),
                },
                {
                    name: '📋 Managing Matches',
                    value: [
                        '`/upcoming` - View upcoming matches',
                        '`/past` - View past matches',
                        '`/manage <match_id>` - Manage a specific match',
                        '`/delete <match_id>` - Delete a match',
                    ].join('\n'),
                },
                {
                    name: '🎮 Supported Games',
                    value: gameList,
                },
                {
                    name: '🔘 Manage Embed Buttons',
                    value: [
                        '**Create Event** - Create a Discord scheduled event',
                        '**Announce** - Post announcement to channel immediately',
                        '**Edit Time/Format/Stream/etc.** - Edit individual fields',
                        '**Map Veto** - Add map veto info (CS2, Valorant only)',
                        '**Delete** - Delete the match',
                    ].join('\n'),
                },
                {
                    name: '⚙️ Automatic Features',
                    value: [
                        '• Matches are announced automatically at start time',
                        '• Map veto reminder sent 5 minutes before (if not set)',
                        '• Old matches cleaned up after 7 days',
                    ].join('\n'),
                },
            )
            .setFooter({ text: 'Nemesis Esports Bot' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
