/**
 * =============================================================================
 * MANAGE COMMAND - /manage
 * =============================================================================
 * Displays a management interface for a specific match with action buttons.
 * 
 * Features:
 * - View match details (time, format, stream, info link)
 * - Status indicators (Event created, Announced)
 * - Action buttons: Create Event, Announce, Delete
 * - Individual edit buttons for each field
 * - Map Veto button (for supported games)
 * 
 * Exports buildManageEmbed and buildManageButtons for use by other modules
 * (add.js uses these to show manage embed after adding a match)
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
// EMBED BUILDER
// =============================================================================

/**
 * Build the manage embed for a match
 * @param {Object} match - The match object
 * @param {Object} gameConfig - The game configuration
 * @returns {EmbedBuilder}
 */
function buildManageEmbed(match, gameConfig) {
    const startTime = new Date(match.startTime);
    const timestamp = Math.floor(startTime.getTime() / 1000);
    
    // Status indicators
    const eventStatus = match.eventCreated ? '✅' : '⬜';
    const announceStatus = match.announced ? '✅' : '⬜';
    const mapVetoStatus = (match.mapVeto && match.mapVeto.length > 0) ? '✅' : '⬜';
    
    // Build description
    let description = `<t:${timestamp}:F> (<t:${timestamp}:R>)\n\n`;
    
    // Type/Format
    if (match.bestOfDisplay) {
        description += `**Type:** ${match.bestOfDisplay}\n`;
    }
    
    // Map Veto (only for games that support it)
    if (gameConfig.hasMapVeto) {
        if (match.mapVeto && match.mapVeto.length > 0) {
            const mapList = match.mapVeto.map(m => {
                if (typeof m === 'object' && m.map) {
                    return m.pickedBy ? `${m.map} (${m.pickedBy})` : m.map;
                }
                return m;
            }).join(', ');
            description += `**Map Veto:** ${mapList}\n`;
        } else {
            description += `**Map Veto:** None\n`;
        }
    }
    
    // Links
    description += `**Stream:** [Link](${match.streamLink})\n`;
    if (match.infoLink && match.infoLink !== 'N/A') {
        description += `**Info:** [Link](${match.infoLink})\n`;
    }
    
    // Status line and ID
    const mapVetoStatusText = gameConfig.hasMapVeto ? `  ${mapVetoStatus} Map Veto` : '';
    description += `\n${eventStatus} Event  ${announceStatus} Announced${mapVetoStatusText}\n`;
    description += `**ID:** ${match.id}`;
    
    return new EmbedBuilder()
        .setTitle(match.matchTitle)
        .setDescription(description)
        .setColor(match.announced ? 0x57F287 : 0x5865F2);
}

// =============================================================================
// BUTTON BUILDER
// =============================================================================

/**
 * Build the action buttons for a match
 * @param {Object} match - The match object
 * @param {Object} gameConfig - The game configuration
 * @returns {ActionRowBuilder[]}
 */
function buildManageButtons(match, gameConfig) {
    const isAnnounced = match.announced;
    
    // Row 1: Main action buttons (Create Event, Announce)
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`match_create_event_${match.id}`)
            .setLabel('Create Event')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📅')
            .setDisabled(match.eventCreated),
        new ButtonBuilder()
            .setCustomId(`match_announce_${match.id}`)
            .setLabel('Announce')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📢')
            .setDisabled(match.isAnnouncing === true),
    );

    // Row 2: Edit buttons - Time, Format, Stream
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`edit_time_${match.id}`)
            .setLabel('Edit Time')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏰')
            .setDisabled(isAnnounced),
        new ButtonBuilder()
            .setCustomId(`edit_format_${match.id}`)
            .setLabel('Edit Format')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎯')
            .setDisabled(isAnnounced),
        new ButtonBuilder()
            .setCustomId(`edit_stream_${match.id}`)
            .setLabel('Edit Stream')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📺')
            .setDisabled(isAnnounced),
    );

    // Row 3: Edit buttons - Enemy, Event, Info
    const row3Buttons = [];
    
    // Only show Enemy Team edit if the game supports enemy teams
    if (gameConfig.hasEnemyTeam !== false) {
        row3Buttons.push(
            new ButtonBuilder()
                .setCustomId(`edit_enemy_${match.id}`)
                .setLabel('Edit Enemy')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⚔️')
                .setDisabled(isAnnounced)
        );
    }
    
    row3Buttons.push(
        new ButtonBuilder()
            .setCustomId(`edit_event_${match.id}`)
            .setLabel('Edit Event')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏆')
            .setDisabled(isAnnounced),
        new ButtonBuilder()
            .setCustomId(`edit_info_${match.id}`)
            .setLabel('Edit Info')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔗')
            .setDisabled(isAnnounced)
    );
    
    const row3 = new ActionRowBuilder().addComponents(...row3Buttons);

    // Row 4: Map Veto (if supported) + Delete
    const row4Buttons = [];
    
    if (gameConfig.hasMapVeto) {
        row4Buttons.push(
            new ButtonBuilder()
                .setCustomId(`mapveto_${match.id}`)
                .setLabel('Map Veto')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🗺️')
                .setDisabled(isAnnounced)
        );
    }
    
    row4Buttons.push(
        new ButtonBuilder()
            .setCustomId(`match_delete_${match.id}`)
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );
    
    const row4 = new ActionRowBuilder().addComponents(...row4Buttons);

    return [row1, row2, row3, row4];
}

// =============================================================================
// SLASH COMMAND
// =============================================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manage')
        .setDescription('Manage an existing match')
        .addIntegerOption(option =>
            option
                .setName('match_id')
                .setDescription('The match ID to manage')
                .setRequired(true)
        ),

    /**
     * Execute the /manage command
     */
    async execute(interaction) {
        const matchId = interaction.options.getInteger('match_id');
        const match = matchStore.getMatch(matchId);

        // Validate match exists
        if (!match) {
            return interaction.reply({
                content: `❌ Match with ID \`${matchId}\` not found.`,
                ephemeral: true,
            });
        }

        // Validate game config
        const gameConfig = GAME_CONFIGS[match.game];
        if (!gameConfig) {
            return interaction.reply({
                content: '❌ Invalid game configuration for match.',
                ephemeral: true,
            });
        }

        // Build and send response
        const embed = buildManageEmbed(match, gameConfig);
        const components = buildManageButtons(match, gameConfig);

        await interaction.reply({
            embeds: [embed],
            components,
        });
    },

    // Export helpers for use by other modules
    buildManageEmbed,
    buildManageButtons,
};
