/**
 * =============================================================================
 * GAME CONFIGURATION
 * =============================================================================
 * Shared configuration for all supported esports titles.
 * 
 * This file is the single source of truth for:
 * - Game names and emojis
 * - Discord role environment variable names
 * - Team names per game
 * - Feature flags (map veto support, enemy team format)
 * - Match format options (Best of X)
 * 
 * Extracted to avoid circular dependencies between add.js and manage.js
 * =============================================================================
 */

// =============================================================================
// GAME CONFIGURATIONS
// =============================================================================

/**
 * Configuration for each supported game
 * 
 * Properties:
 * - name: Display name
 * - emoji: Discord emoji for the game
 * - roleEnv: Environment variable name for the Discord role ID
 * - teamName: Team name to use in announcements
 * - hasMapVeto: Whether the game supports map veto (default: false)
 * - hasEnemyTeam: Whether matches have an enemy team (default: true)
 */
const GAME_CONFIGS = {
    CS2: {
        name: 'CS2',
        emoji: '🎮',
        roleEnv: 'CS2_ROLE_ID',
        teamName: 'Nemesis',
        hasMapVeto: true,
    },
    DOTA2: {
        name: 'DOTA2',
        emoji: '⚔️',
        roleEnv: 'DOTA2_ROLE_ID',
        teamName: 'Nemesis',
        hasMapVeto: false,
    },
    TRACKMANIA: {
        name: 'Trackmania',
        emoji: '🏎️',
        roleEnv: 'TRACKMANIA_ROLE_ID',
        teamName: 'Nemesis',
        hasMapVeto: false,
        hasEnemyTeam: false,
    },
    VALORANT: {
        name: 'Valorant',
        emoji: '🔫',
        roleEnv: 'VALORANT_ROLE_ID',
        teamName: 'Nemesis',
        hasMapVeto: true,
    },
    VALORANT_MOBILE: {
        name: 'Valorant Mobile',
        emoji: '📱',
        roleEnv: 'VALORANT_MOBILE_ROLE_ID',
        teamName: 'Nemesis',
        hasMapVeto: true,
    },
    POKEMON_UNITE: {
        name: 'Pokemon Unite',
        emoji: '⚡',
        roleEnv: 'POKEMON_UNITE_ROLE_ID',
        teamName: 'Nemesis',
        hasMapVeto: false,
        hasEnemyTeam: false,
    },
    HONOR_OF_KINGS: {
        name: 'Honor of Kings',
        emoji: '👑',
        roleEnv: 'HONOR_OF_KINGS_ROLE_ID',
        teamName: 'Dominator by Nemesis',
        hasMapVeto: false,
    },
    PUBG: {
        name: 'PUBG',
        emoji: '🪖',
        roleEnv: 'PUBG_ROLE_ID',
        teamName: 'Nemesis',
        hasMapVeto: false,
        hasEnemyTeam: false,
    },
    PUBG_MOBILE: {
        name: 'PUBG Mobile',
        emoji: '📲',
        roleEnv: 'PUBG_MOBILE_ROLE_ID',
        teamName: 'Nemesis',
        hasMapVeto: false,
        hasEnemyTeam: false,
    },
};

// =============================================================================
// MATCH FORMAT OPTIONS
// =============================================================================

/**
 * Best-of format options
 * Keys are used in command choices, values are display strings
 */
const BEST_OF_OPTIONS = {
    none: null,
    bo1: 'BO1',
    bo3: 'BO3',
    bo5: 'BO5',
    other: 'Other',
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    GAME_CONFIGS,
    BEST_OF_OPTIONS,
};
