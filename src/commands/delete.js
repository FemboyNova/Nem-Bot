/**
 * =============================================================================
 * DELETE COMMAND - /delete
 * =============================================================================
 * Delete a scheduled match and its associated Discord event.
 * 
 * Note: The actual deletion confirmation happens via button interaction
 * in index.js. This command is rarely used directly since users typically
 * delete via the manage embed's Delete button.
 * =============================================================================
 */

const { SlashCommandBuilder } = require('discord.js');
const matchStore = require('../utils/matchStore');

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Delete the Discord scheduled event if it exists
 * @param {Object} guild - Discord guild
 * @param {Object} match - Match data with scheduledEventId
 */
async function deleteScheduledEvent(guild, match) {
    if (!guild || !match.scheduledEventId) return;
    
    try {
        const event = await guild.scheduledEvents.fetch(match.scheduledEventId).catch(() => null);
        if (event) {
            await event.delete();
            console.log(`✓ Deleted scheduled event: ${match.matchTitle}`);
        }
    } catch (error) {
        console.log(`⚠ Could not delete scheduled event: ${error.message}`);
    }
}

// =============================================================================
// SLASH COMMAND
// =============================================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete a scheduled match')
        .addIntegerOption(option =>
            option
                .setName('match_id')
                .setDescription('The match ID to delete (use /upcoming to find it)')
                .setRequired(true)
        ),

    /**
     * Execute the /delete command
     */
    async execute(interaction) {
        await interaction.deferReply();

        const matchId = interaction.options.getInteger('match_id');
        const match = matchStore.getMatch(matchId);

        // Validate match exists
        if (!match) {
            return interaction.editReply({
                content: `❌ Match with ID \`${matchId}\` not found.\n\nUse \`/upcoming\` to see available matches.`,
            });
        }

        // Delete the Discord scheduled event
        await deleteScheduledEvent(interaction.guild, match);

        // Delete the match from storage
        const deleted = matchStore.deleteMatch(matchId);

        if (deleted) {
            await interaction.editReply({
                content: `✅ **Match Deleted!**\n\n**Match:** ${match.matchTitle}\n**ID:** \`${matchId}\`\n\n🗑️ The scheduled event has also been removed.`,
            });
        } else {
            await interaction.editReply({
                content: '❌ Failed to delete match. Please try again.',
            });
        }
    },
};
