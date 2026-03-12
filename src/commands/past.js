/**
 * =============================================================================
 * PAST COMMAND - /past
 * =============================================================================
 * Displays a paginated list of past matches (announced or time has passed).
 * 
 * Features:
 * - Pagination with Previous/Next buttons
 * - Optional game filter
 * - Shows match details: time, format, announcement status
 * 
 * Exports helpers for use by index.js button handlers
 * =============================================================================
 */

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const matchStore = require('../utils/matchStore');
const { GAME_CONFIGS } = require('../utils/gameConfig');

// =============================================================================
// CONSTANTS
// =============================================================================

const MATCHES_PER_PAGE = 5;

// Build game choices for the command option
const gameChoices = Object.entries(GAME_CONFIGS).map(([key, config]) => ({
    name: config.name,
    value: key,
}));

// =============================================================================
// EMBED BUILDER
// =============================================================================

/**
 * Build the embed for a specific page of past matches
 * @param {Object[]} matches - Array of match objects
 * @param {number} page - Current page (0-indexed)
 * @param {string|null} gameFilter - Game key to filter by
 * @returns {EmbedBuilder}
 */
function buildPastEmbed(matches, page, gameFilter = null) {
    const totalPages = Math.ceil(matches.length / MATCHES_PER_PAGE) || 1;
    const startIndex = page * MATCHES_PER_PAGE;
    const endIndex = Math.min(startIndex + MATCHES_PER_PAGE, matches.length);
    const pageMatches = matches.slice(startIndex, endIndex);

    const filterText = gameFilter
        ? ` (${GAME_CONFIGS[gameFilter]?.name || gameFilter})`
        : '';
    
    const embed = new EmbedBuilder()
        .setTitle(`📜 Past Matches${filterText}`)
        .setColor(0x95a5a6)
        .setTimestamp();

    // Build description with match entries
    let description = '';
    pageMatches.forEach((match, index) => {
        const startTime = new Date(match.startTime);
        const timestamp = Math.floor(startTime.getTime() / 1000);
        const gameConfig = GAME_CONFIGS[match.game];
        const emoji = gameConfig?.emoji || '🎮';

        const displayNum = startIndex + index + 1;
        const announcedStatus = match.announced ? '✅ Announced' : '❌ Not announced';
        
        description += `**${displayNum}. ${emoji} ${match.matchTitle}**\n`;
        description += `> ⏰ <t:${timestamp}:F>\n`;
        description += `> 🎯 Format: ${match.bestOfDisplay || 'N/A'} • ${announcedStatus}\n`;
        description += `> 🆔 \`${match.id}\`\n\n`;
    });

    embed.setDescription(description || 'No matches found.');
    embed.setFooter({
        text: `Page ${page + 1}/${totalPages} • ${matches.length} match(es) total`,
    });

    return embed;
}

// =============================================================================
// PAGINATION BUTTONS
// =============================================================================

/**
 * Build pagination buttons for past matches
 * @param {number} page - Current page (0-indexed)
 * @param {number} totalPages - Total number of pages
 * @param {string|null} gameFilter - Game key to filter by
 * @returns {ActionRowBuilder}
 */
function buildPastPaginationButtons(page, totalPages, gameFilter = null) {
    const filterSuffix = gameFilter ? `_${gameFilter}` : '';
    
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`past_prev_${page}${filterSuffix}`)
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`past_next_${page}${filterSuffix}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1),
    );
}

// =============================================================================
// SLASH COMMAND
// =============================================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('past')
        .setDescription('View past matches')
        .addStringOption(option =>
            option
                .setName('game')
                .setDescription('Filter by game')
                .setRequired(false)
                .addChoices(...gameChoices)
        ),

    /**
     * Execute the /past command
     */
    async execute(interaction) {
        await interaction.deferReply();

        const gameFilter = interaction.options.getString('game');
        let matches = matchStore.getPastMatches();
        
        // Apply game filter if specified
        if (gameFilter) {
            matches = matches.filter(m => m.game === gameFilter);
        }

        // Handle empty state
        if (matches.length === 0) {
            const filterText = gameFilter
                ? ` for ${GAME_CONFIGS[gameFilter]?.name || gameFilter}`
                : '';
            return interaction.editReply({
                content: `📭 No past matches found${filterText}.`,
            });
        }

        // Build response
        const totalPages = Math.ceil(matches.length / MATCHES_PER_PAGE);
        const embed = buildPastEmbed(matches, 0, gameFilter);
        
        const response = { embeds: [embed] };
        
        // Only add buttons if there's more than one page
        if (totalPages > 1) {
            response.components = [buildPastPaginationButtons(0, totalPages, gameFilter)];
        }

        await interaction.editReply(response);
    },

    // Export helpers for use by index.js button handlers
    buildPastEmbed,
    buildPastPaginationButtons,
    MATCHES_PER_PAGE,
};
