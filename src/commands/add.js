const { SlashCommandBuilder } = require('discord.js');
const matchStore = require('../utils/matchStore');
const { parseDateTime } = require('../utils/dateParser');
const { GAME_CONFIGS, BEST_OF_OPTIONS } = require('../utils/gameConfig');

// ============================================================================
// LAZY IMPORTS (avoid circular dependency)
// ============================================================================

let manageBuilders = null;
function getManageBuilders() {
    if (!manageBuilders) {
        manageBuilders = require('./manage');
    }
    return manageBuilders;
}

// ============================================================================
// COMMAND DEFINITION
// ============================================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('Add a new esports match to track and announce')
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Select the game')
                .setRequired(true)
                .addChoices(
                    { name: 'CS2', value: 'CS2' },
                    { name: 'DOTA2', value: 'DOTA2' },
                    { name: 'Trackmania', value: 'TRACKMANIA' },
                    { name: 'Valorant', value: 'VALORANT' },
                    { name: 'Valorant Mobile', value: 'VALORANT_MOBILE' },
                    { name: 'Pokemon Unite', value: 'POKEMON_UNITE' },
                    { name: 'Honor of Kings', value: 'HONOR_OF_KINGS' },
                    { name: 'PUBG', value: 'PUBG' },
                    { name: 'PUBG Mobile', value: 'PUBG_MOBILE' },
                ))
        .addStringOption(option =>
            option.setName('event_name')
                .setDescription('Name of the tournament/event')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('start_time')
                .setDescription('UK time: "15/03 7pm", "tomorrow 19:00", "in 2 hours"')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('best_of')
                .setDescription('Match format')
                .setRequired(true)
                .addChoices(
                    { name: 'None', value: 'none' },
                    { name: 'Best of 1', value: 'bo1' },
                    { name: 'Best of 3', value: 'bo3' },
                    { name: 'Best of 5', value: 'bo5' },
                ))
        .addStringOption(option =>
            option.setName('stream_link')
                .setDescription('Stream URL (e.g., https://kick.com/starladder)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('enemy_team')
                .setDescription('Name of the enemy team (optional for Battle Royale games)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('info_link')
                .setDescription('Info/HLTV/Liquipedia link')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        // Get options
        const game = interaction.options.getString('game');
        const enemyTeam = interaction.options.getString('enemy_team');
        const eventName = interaction.options.getString('event_name');
        const startTimeInput = interaction.options.getString('start_time');
        const bestOf = interaction.options.getString('best_of');
        const streamLink = interaction.options.getString('stream_link');
        const infoLink = interaction.options.getString('info_link') || 'N/A';

        const gameConfig = GAME_CONFIGS[game];
        const bestOfDisplay = BEST_OF_OPTIONS[bestOf];

        // Parse start time
        const startTime = parseDateTime(startTimeInput);
        if (!startTime || isNaN(startTime.getTime())) {
            return interaction.editReply({
                content: '❌ Could not parse the start time. Please use a format like:\n' +
                    '• `15/03 7pm` or `15/03 19:00` (UK format, current year)\n' +
                    '• `15/03/2026 7pm` (with year)\n' +
                    '• `today 7pm` or `tomorrow 19:00`\n' +
                    '• `in 2 hours` or `in 30 minutes`',
            });
        }

        // Validate future time
        if (startTime <= new Date()) {
            return interaction.editReply({ content: '❌ Start time must be in the future!' });
        }

        // Build match title
        const matchTitle = enemyTeam
            ? `[${gameConfig.name}] ${gameConfig.teamName} vs ${enemyTeam} • ${eventName}`
            : `[${gameConfig.name}] ${gameConfig.teamName} • ${eventName}`;

        try {
            // Store match
            const match = matchStore.addMatch({
                game,
                enemyTeam,
                eventName,
                startTime: startTime.toISOString(),
                bestOf,
                bestOfDisplay,
                streamLink,
                infoLink,
                matchTitle,
                guildId: interaction.guild.id,
                scheduledEventId: null,
                mapVeto: null,
                eventCreated: false,
            });

            console.log(`✓ Match stored with ID: ${match.id}`);

            // Send manage embed
            const { buildManageEmbed, buildManageButtons } = getManageBuilders();
            const embed = buildManageEmbed(match, gameConfig);
            const components = buildManageButtons(match, gameConfig);

            await interaction.editReply({
                content: `✅ **Match Added!**`,
                embeds: [embed],
                components,
            });
        } catch (error) {
            console.error('Error creating match:', error);
            await interaction.editReply({ content: `❌ Error creating match: ${error.message}` });
        }
    },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build the event description for Discord scheduled events
 */
function buildEventDescription(gameConfig, bestOf, streamLink, infoLink) {
    let description = '';

    if (bestOf) {
        description += `➡️ Type: ${bestOf}\n`;
    }
    description += `🖥️ Stream: ${streamLink}\n`;

    if (infoLink && infoLink !== 'N/A') {
        description += `ℹ️ Info: ${infoLink}`;
    }

    return description;
}

/**
 * Build the announcement message for the announce channel
 */
function buildAnnouncement(game, gameConfig, enemyTeam, eventName, bestOf, streamLink, infoLink, mapVeto = null) {
    const roleId = process.env[gameConfig.roleEnv];
    const watchVcId = process.env.WATCH_VC_ID;

    // Title
    const title = enemyTeam
        ? `[${gameConfig.name}] ${gameConfig.teamName} vs ${enemyTeam} • ${eventName}`
        : `[${gameConfig.name}] ${gameConfig.teamName} • ${eventName}`;

    let message = `# **${title}**\n\n`;

    // Map veto (only if set)
    if (gameConfig.hasMapVeto && mapVeto && mapVeto.length > 0) {
        message += `**Map Veto:**\n`;
        mapVeto.forEach((item, index) => {
            if (typeof item === 'object' && item.map) {
                message += item.pickedBy
                    ? `• Map ${index + 1}: ${item.map} (${item.pickedBy})\n`
                    : `• Map ${index + 1}: ${item.map}\n`;
            } else {
                message += `• Map ${index + 1}: ${item}\n`;
            }
        });
        message += `\n`;
    }

    // Match info
    if (bestOf) message += `**Type:** ${bestOf}\n`;
    message += `**Stream:** <${streamLink}>\n`;
    if (infoLink && infoLink !== 'N/A') message += `**Info:** <${infoLink}>\n`;
    if (watchVcId) message += `**Watchparty VC:** <#${watchVcId}>\n`;

    message += `\n`;

    // Role ping
    if (roleId) message += `<@&${roleId}>`;

    return message;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports.GAME_CONFIGS = GAME_CONFIGS;
module.exports.BEST_OF_OPTIONS = BEST_OF_OPTIONS;
module.exports.buildAnnouncement = buildAnnouncement;
module.exports.buildEventDescription = buildEventDescription;
