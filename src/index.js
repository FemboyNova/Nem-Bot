require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// ============================================================================
// IMPORTS
// ============================================================================

const {
    Client,
    GatewayIntentBits,
    Collection,
    Events,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    GuildScheduledEventEntityType,
    GuildScheduledEventPrivacyLevel,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const matchStore = require('./utils/matchStore');
const { GAME_CONFIGS } = require('./utils/gameConfig');

// ============================================================================
// CLIENT SETUP
// ============================================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// ============================================================================
// CONFIGURATION
// ============================================================================

const ALLOWED_ROLES = process.env.ALLOWED_ROLES
    ? process.env.ALLOWED_ROLES.split(',').map(id => id.trim())
    : [];

// Store interval references for graceful shutdown
let schedulerInterval = null;
let cleanupInterval = null;

// ============================================================================
// COMMAND LOADING
// ============================================================================

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`✓ Loaded command: ${command.data.name}`);
        }
    }
}

// ============================================================================
// BOT READY EVENT
// ============================================================================

client.once(Events.ClientReady, (c) => {
    console.log(`Bot is online as ${c.user.tag}`);
    console.log(`Serving ${c.guilds.cache.size} server(s)`);

    // Clean up any stale lock files from a previous crash
    matchStore.cleanupStaleLock();

    startMatchScheduler();
    console.log(`Match scheduler started (checking every 30 seconds)`);

    // Run cleanup immediately, then every 24 hours
    matchStore.cleanupOldMatches();
    cleanupInterval = setInterval(() => {
        try {
            matchStore.cleanupOldMatches();
        } catch (error) {
            console.error('Periodic cleanup error:', error);
        }
    }, 24 * 60 * 60 * 1000);
    console.log(`Match cleanup scheduled (every 24 hours)`);
});

// ============================================================================
// SCHEDULER
// ============================================================================

function startMatchScheduler() {
    schedulerInterval = setInterval(async () => {
        try {
            await checkForAnnouncements();
            await checkForMapVetoPrompts();
        } catch (error) {
            console.error('Scheduler error:', error);
        }
    }, 30 * 1000);

    // Run immediately on startup (after 5s delay)
    setTimeout(async () => {
        try {
            await checkForAnnouncements();
            await checkForMapVetoPrompts();
        } catch (error) {
            console.error('Initial scheduler error:', error);
        }
    }, 5000);
}

async function checkForAnnouncements() {
    const { buildAnnouncement } = require('./commands/add');
    const matchesToAnnounce = matchStore.getMatchesNeedingAnnouncement();

    for (const match of matchesToAnnounce) {
        try {
            const guild = await client.guilds.fetch(match.guildId);
            if (!guild) continue;

            const gameConfig = GAME_CONFIGS[match.game];
            if (!gameConfig) continue;

            const announceChannelId = process.env.ANNOUNCE_CHANNEL_ID;
            if (!announceChannelId) {
                console.log(`⚠ No announce channel configured`);
                matchStore.updateMatch(match.id, { announced: true });
                continue;
            }

            const announceChannel = await guild.channels.fetch(announceChannelId);
            if (!announceChannel) {
                console.log(`⚠ Could not find announce channel ${announceChannelId}`);
                matchStore.updateMatch(match.id, { announced: true });
                continue;
            }

            const announcement = buildAnnouncement(
                match.game,
                gameConfig,
                match.enemyTeam,
                match.eventName,
                match.bestOfDisplay,
                match.streamLink,
                match.infoLink,
                match.mapVeto
            );

            matchStore.updateMatch(match.id, { isAnnouncing: true });
            await announceChannel.send(announcement);
            const result = matchStore.updateMatch(match.id, { announced: true, isAnnouncing: false });
            
            if (!result) {
                console.error(`Failed to mark match ${match.id} as announced after sending`);
            } else {
                console.log(`📢 Posted announcement for: ${match.matchTitle}`);
            }
        } catch (error) {
            matchStore.updateMatch(match.id, { isAnnouncing: false });
            console.error(`Error announcing match ${match.id}:`, error);
        }
    }
}

async function checkForMapVetoPrompts() {
    const matchesNeedingVeto = matchStore.getMatchesNeedingMapVetoPrompt();

    for (const match of matchesNeedingVeto) {
        try {
            const guild = await client.guilds.fetch(match.guildId);
            if (!guild) continue;

            const gameConfig = GAME_CONFIGS[match.game];
            if (!gameConfig || !gameConfig.hasMapVeto) continue;

            const botCommandsChannelId = process.env.BOT_COMMANDS_CHANNEL_ID;
            if (!botCommandsChannelId) {
                console.log(`⚠ No BOT_COMMANDS_CHANNEL_ID configured, skipping map veto reminder`);
                matchStore.updateMatch(match.id, { mapVetoPrompted: true });
                continue;
            }

            const channel = await guild.channels.fetch(botCommandsChannelId);
            if (!channel) {
                console.log(`⚠ Could not find bot commands channel ${botCommandsChannelId}`);
                matchStore.updateMatch(match.id, { mapVetoPrompted: true });
                continue;
            }

            const startTimestamp = Math.floor(new Date(match.startTime).getTime() / 1000);
            const mapVetoPingUsers = process.env.MAP_VETO_PING_USERS || '';
            const pingContent = mapVetoPingUsers 
                ? mapVetoPingUsers.split(',').map(id => `<@${id.trim()}>`).join(' ') + '\n\n' 
                : '';
            const reminder = `⚠️ **Map Veto Reminder!**\n\n` +
                pingContent +
                `**${match.matchTitle}** starts <t:${startTimestamp}:R>!\n\n` +
                `No map veto has been added yet. Click the button below to add it:`;

            const button = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`mapveto_${match.id}`)
                    .setLabel('Add Map Veto')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🗺️')
            );

            await channel.send({ content: reminder, components: [button] });
            matchStore.updateMatch(match.id, { mapVetoPrompted: true });
            console.log(`🗺️ Sent map veto reminder for: ${match.matchTitle}`);
        } catch (error) {
            console.error(`Error sending map veto prompt for ${match.id}:`, error);
        }
    }
}

// ============================================================================
// INTERACTION HANDLER
// ============================================================================

client.on(Events.InteractionCreate, async (interaction) => {
    // Permission check
    const memberRoles = interaction.member?.roles?.cache;
    const hasPermission = memberRoles && ALLOWED_ROLES.some(roleId => memberRoles.has(roleId));

    if (!hasPermission) {
        return interaction.reply({
            content: '❌ You do not have permission to use this bot.',
            ephemeral: true
        });
    }

    // Route to appropriate handler
    if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
        await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
    }
});

// ============================================================================
// SLASH COMMAND HANDLER
// ============================================================================

async function handleSlashCommand(interaction) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        const errorMessage = { content: 'There was an error executing this command!', ephemeral: true };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
}

// ============================================================================
// BUTTON HANDLERS
// ============================================================================

async function handleButton(interaction) {
    const { customId } = interaction;

    // Map Veto Button
    if (customId.startsWith('mapveto_')) {
        return handleMapVetoButton(interaction);
    }

    // Create Event Buttons
    if (customId.startsWith('match_create_event_')) {
        if (customId.includes('confirm')) return handleCreateEventConfirm(interaction);
        if (customId.includes('cancel')) return interaction.update({ content: '❌ Event creation cancelled.', components: [] });
        return handleCreateEventButton(interaction);
    }

    // Announce Buttons
    if (customId.startsWith('match_announce_')) {
        if (customId.includes('confirm')) return handleAnnounceConfirm(interaction);
        if (customId.includes('cancel')) return interaction.update({ content: '❌ Announcement cancelled.', components: [] });
        return handleAnnounceButton(interaction);
    }

    // Edit Buttons (individual fields)
    if (customId.startsWith('edit_time_')) return handleEditTimeButton(interaction);
    if (customId.startsWith('edit_format_')) return handleEditFormatButton(interaction);
    if (customId.startsWith('edit_stream_')) return handleEditStreamButton(interaction);
    if (customId.startsWith('edit_enemy_')) return handleEditEnemyButton(interaction);
    if (customId.startsWith('edit_event_')) return handleEditEventButton(interaction);
    if (customId.startsWith('edit_info_')) return handleEditInfoButton(interaction);

    // Delete Buttons
    if (customId.startsWith('match_delete_')) {
        if (customId.includes('confirm')) return handleDeleteConfirm(interaction);
        if (customId.includes('cancel')) return interaction.update({ content: '❌ Deletion cancelled.', components: [] });
        return handleDeleteButton(interaction);
    }

    // Pagination - Upcoming
    if (customId.startsWith('upcoming_prev_') || customId.startsWith('upcoming_next_')) {
        return handleUpcomingPagination(interaction);
    }

    // Pagination - Past
    if (customId.startsWith('past_prev_') || customId.startsWith('past_next_')) {
        return handlePastPagination(interaction);
    }
}

// --- Map Veto ---

async function handleMapVetoButton(interaction) {
    const matchId = interaction.customId.replace('mapveto_', '');
    const match = matchStore.getMatch(matchId);

    if (!match) {
        return interaction.reply({ content: '❌ Match not found or already announced.', ephemeral: true });
    }

    if (match.announced) {
        return interaction.reply({ content: '❌ This match has already been announced.', ephemeral: true });
    }

    const modal = new ModalBuilder()
        .setCustomId(`mapveto_modal_${matchId}`)
        .setTitle('Add Map Veto');

    const map1Input = new TextInputBuilder()
        .setCustomId('map1')
        .setLabel('Map 1 (format: Map, PickedBy)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Mirage, Nemesis');

    const map2Input = new TextInputBuilder()
        .setCustomId('map2')
        .setLabel('Map 2 (format: Map, PickedBy)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Nuke, EYEBALLERS');

    const map3Input = new TextInputBuilder()
        .setCustomId('map3')
        .setLabel('Map 3 - Decider (just map name)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Inferno');

    modal.addComponents(
        new ActionRowBuilder().addComponents(map1Input),
        new ActionRowBuilder().addComponents(map2Input),
        new ActionRowBuilder().addComponents(map3Input)
    );

    await interaction.showModal(modal);
}

// --- Create Event ---

async function handleCreateEventButton(interaction) {
    const matchId = interaction.customId.replace('match_create_event_', '');
    const match = matchStore.getMatch(matchId);

    if (!match) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }

    if (match.eventCreated) {
        return interaction.reply({ content: '❌ Event has already been created for this match.', ephemeral: true });
    }

    const originalMessageId = interaction.message.id;
    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`match_create_event_confirm_${matchId}_${originalMessageId}`)
            .setLabel('Yes, Create Event')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`match_create_event_cancel_${matchId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
        content: `⚠️ **Are you sure you want to create a Discord event for:**\n\n**${match.matchTitle}**`,
        components: [confirmRow],
        ephemeral: true,
    });
}

async function handleCreateEventConfirm(interaction) {
    const parts = interaction.customId.replace('match_create_event_confirm_', '').split('_');
    const matchId = parts[0];
    const originalMessageId = parts[1];
    const match = matchStore.getMatch(matchId);

    if (!match) {
        return interaction.update({ content: '❌ Match not found.', components: [] });
    }

    if (match.eventCreated) {
        return interaction.update({ content: '❌ Event has already been created.', components: [] });
    }

    try {
        const { buildEventDescription } = require('./commands/add');
        const { buildManageEmbed, buildManageButtons } = require('./commands/manage');
        const gameConfig = GAME_CONFIGS[match.game];
        
        if (!gameConfig) {
            return interaction.update({ content: '❌ Error: Invalid game configuration.', components: [] });
        }
        
        const eventDescription = buildEventDescription(gameConfig, match.bestOfDisplay, match.streamLink, match.infoLink);
        const channelLink = process.env.CHANNEL_LINK || 'https://discord.com';
        const startTime = new Date(match.startTime);

        const scheduledEvent = await interaction.guild.scheduledEvents.create({
            name: match.matchTitle,
            scheduledStartTime: startTime,
            scheduledEndTime: new Date(startTime.getTime() + 3 * 60 * 60 * 1000),
            privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
            entityType: GuildScheduledEventEntityType.External,
            entityMetadata: { location: channelLink },
            description: eventDescription,
        });

        const updatedMatch = matchStore.updateMatch(matchId, {
            eventCreated: true,
            scheduledEventId: scheduledEvent.id
        });

        if (!updatedMatch) {
            return interaction.update({ content: '❌ Match not found.', components: [] });
        }

        // Refresh the manage embed
        const embed = buildManageEmbed(updatedMatch, gameConfig);
        const components = buildManageButtons(updatedMatch, gameConfig);
        const originalMessage = await interaction.channel.messages.fetch(originalMessageId);
        await originalMessage.edit({ embeds: [embed], components });

        await interaction.update({ content: '✅ Event created!', components: [] });
        console.log(`📅 Created scheduled event: ${match.matchTitle}`);
    } catch (error) {
        console.error('Error creating event:', error);
        await interaction.update({ content: `❌ Error creating event: ${error.message}`, components: [] });
    }
}

// --- Announce ---

async function handleAnnounceButton(interaction) {
    const matchId = interaction.customId.replace('match_announce_', '');
    const match = matchStore.getMatch(matchId);

    if (!match) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }

    const originalMessageId = interaction.message.id;
    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`match_announce_confirm_${matchId}_${originalMessageId}`)
            .setLabel('Yes, Announce Now')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`match_announce_cancel_${matchId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
        content: `⚠️ **Are you sure you want to announce this match now?**\n\n**${match.matchTitle}**\n\nThis will send the announcement to the channel immediately.`,
        components: [confirmRow],
        ephemeral: true,
    });
}

async function handleAnnounceConfirm(interaction) {
    const parts = interaction.customId.replace('match_announce_confirm_', '').split('_');
    const matchId = parts[0];
    const originalMessageId = parts[1];
    const match = matchStore.getMatch(matchId);

    if (!match) {
        return interaction.update({ content: '❌ Match not found.', components: [] });
    }

    try {
        const { buildAnnouncement } = require('./commands/add');
        const { buildManageEmbed, buildManageButtons } = require('./commands/manage');
        const gameConfig = GAME_CONFIGS[match.game];

        if (!gameConfig) {
            return interaction.update({ content: '❌ Error: Invalid game configuration.', components: [] });
        }

        const announceChannelId = process.env.ANNOUNCE_CHANNEL_ID;
        if (!announceChannelId) {
            return interaction.update({ content: '❌ No announce channel configured.', components: [] });
        }

        const announceChannel = await interaction.guild.channels.fetch(announceChannelId);
        if (!announceChannel) {
            return interaction.update({ content: '❌ Could not find announce channel.', components: [] });
        }

        const announcement = buildAnnouncement(
            match.game,
            gameConfig,
            match.enemyTeam,
            match.eventName,
            match.bestOfDisplay,
            match.streamLink,
            match.infoLink,
            match.mapVeto
        );

        matchStore.updateMatch(matchId, { isAnnouncing: true });
        await announceChannel.send(announcement);
        const updatedMatch = matchStore.updateMatch(matchId, { announced: true, isAnnouncing: false });

        if (!updatedMatch) {
            console.error(`Failed to mark match ${matchId} as announced after sending`);
            return interaction.update({ content: '❌ Announcement sent but failed to update match status.', components: [] });
        }

        // Refresh the manage embed
        const embed = buildManageEmbed(updatedMatch, gameConfig);
        const components = buildManageButtons(updatedMatch, gameConfig);
        const originalMessage = await interaction.channel.messages.fetch(originalMessageId);
        await originalMessage.edit({ embeds: [embed], components });

        await interaction.update({ content: '✅ Announced!', components: [] });
        console.log(`📢 Manually announced: ${match.matchTitle}`);
    } catch (error) {
        matchStore.updateMatch(matchId, { isAnnouncing: false });
        console.error('Error announcing:', error);
        await interaction.update({ content: `❌ Error announcing: ${error.message}`, components: [] });
    }
}

// --- Edit Buttons ---

async function handleEditTimeButton(interaction) {
    const matchId = interaction.customId.replace('edit_time_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const modal = new ModalBuilder()
        .setCustomId(`edit_time_modal_${matchId}`)
        .setTitle('Edit Start Time');
    
    const timeInput = new TextInputBuilder()
        .setCustomId('start_time')
        .setLabel('New Start Time (UK timezone)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., 15/03 7pm, tomorrow 19:00, in 2 hours');
    
    modal.addComponents(new ActionRowBuilder().addComponents(timeInput));
    await interaction.showModal(modal);
}

async function handleEditFormatButton(interaction) {
    const matchId = interaction.customId.replace('edit_format_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const modal = new ModalBuilder()
        .setCustomId(`edit_format_modal_${matchId}`)
        .setTitle('Edit Match Format');
    
    const formatInput = new TextInputBuilder()
        .setCustomId('format')
        .setLabel('New Format')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., BO1, BO3, BO5');
    
    modal.addComponents(new ActionRowBuilder().addComponents(formatInput));
    await interaction.showModal(modal);
}

async function handleEditStreamButton(interaction) {
    const matchId = interaction.customId.replace('edit_stream_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const modal = new ModalBuilder()
        .setCustomId(`edit_stream_modal_${matchId}`)
        .setTitle('Edit Stream Link');
    
    const streamInput = new TextInputBuilder()
        .setCustomId('stream_link')
        .setLabel('New Stream URL')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('https://twitch.tv/...');
    
    modal.addComponents(new ActionRowBuilder().addComponents(streamInput));
    await interaction.showModal(modal);
}

async function handleEditEnemyButton(interaction) {
    const matchId = interaction.customId.replace('edit_enemy_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const modal = new ModalBuilder()
        .setCustomId(`edit_enemy_modal_${matchId}`)
        .setTitle('Edit Enemy Team');
    
    const enemyInput = new TextInputBuilder()
        .setCustomId('enemy_team')
        .setLabel('New Enemy Team Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., Team Liquid');
    
    modal.addComponents(new ActionRowBuilder().addComponents(enemyInput));
    await interaction.showModal(modal);
}

async function handleEditEventButton(interaction) {
    const matchId = interaction.customId.replace('edit_event_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const modal = new ModalBuilder()
        .setCustomId(`edit_event_modal_${matchId}`)
        .setTitle('Edit Event Name');
    
    const eventInput = new TextInputBuilder()
        .setCustomId('event_name')
        .setLabel('New Event/Tournament Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., IEM Katowice 2026');
    
    modal.addComponents(new ActionRowBuilder().addComponents(eventInput));
    await interaction.showModal(modal);
}

async function handleEditInfoButton(interaction) {
    const matchId = interaction.customId.replace('edit_info_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const modal = new ModalBuilder()
        .setCustomId(`edit_info_modal_${matchId}`)
        .setTitle('Edit Info Link');
    
    const infoInput = new TextInputBuilder()
        .setCustomId('info_link')
        .setLabel('New Info/HLTV/Liquipedia Link')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('https://hltv.org/... (leave empty for N/A)');
    
    modal.addComponents(new ActionRowBuilder().addComponents(infoInput));
    await interaction.showModal(modal);
}

// --- Delete ---

async function handleDeleteButton(interaction) {
    const matchId = interaction.customId.replace('match_delete_', '');
    const match = matchStore.getMatch(matchId);

    if (!match) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }

    const originalMessageId = interaction.message.id;
    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`match_delete_confirm_${matchId}_${originalMessageId}`)
            .setLabel('Yes, Delete')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`match_delete_cancel_${matchId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    const warning = match.eventCreated ? '\n\n⚠️ This will also delete the Discord event.' : '';

    await interaction.reply({
        content: `⚠️ **Are you sure you want to delete this match?**\n\n**${match.matchTitle}**${warning}`,
        components: [confirmRow],
        ephemeral: true,
    });
}

async function handleDeleteConfirm(interaction) {
    const parts = interaction.customId.replace('match_delete_confirm_', '').split('_');
    const matchId = parts[0];
    const originalMessageId = parts[1];
    const match = matchStore.getMatch(matchId);

    if (!match) {
        return interaction.update({ content: '❌ Match not found.', components: [] });
    }

    try {
        // Delete scheduled event if exists
        if (match.scheduledEventId) {
            try {
                const event = await interaction.guild.scheduledEvents.fetch(match.scheduledEventId);
                if (event) await event.delete();
                console.log(`🗑️ Deleted scheduled event for: ${match.matchTitle}`);
            } catch (e) {
                // Event might not exist
            }
        }

        matchStore.deleteMatch(matchId);

        // Update original message
        try {
            const originalMessage = await interaction.channel.messages.fetch(originalMessageId);
            await originalMessage.edit({
                content: `🗑️ **Match Deleted:** ${match.matchTitle}`,
                embeds: [],
                components: [],
            });
        } catch (e) {
            // Message might not be editable
        }

        await interaction.update({ content: `✅ **Match deleted:** ${match.matchTitle}`, components: [] });
        console.log(`🗑️ Deleted match: ${match.matchTitle}`);
    } catch (error) {
        console.error('Error deleting match:', error);
        await interaction.update({ content: `❌ Error deleting match: ${error.message}`, components: [] });
    }
}

// --- Pagination ---

async function handleUpcomingPagination(interaction) {
    const { customId } = interaction;
    const isNext = customId.startsWith('upcoming_next_');
    const prefix = isNext ? 'upcoming_next_' : 'upcoming_prev_';
    const afterPrefix = customId.replace(prefix, '');
    const sepIndex = afterPrefix.indexOf('::');
    const currentPage = parseInt(sepIndex >= 0 ? afterPrefix.substring(0, sepIndex) : afterPrefix, 10);
    const gameFilter = sepIndex >= 0 ? afterPrefix.substring(sepIndex + 2) : null;
    const newPage = isNext ? currentPage + 1 : Math.max(0, currentPage - 1);

    const { buildUpcomingEmbed, buildPaginationButtons, MATCHES_PER_PAGE } = require('./commands/upcoming');
    let matches = matchStore.getUpcomingMatches();
    if (gameFilter) matches = matches.filter(m => m.game === gameFilter);

    const totalPages = Math.ceil(matches.length / MATCHES_PER_PAGE);

    if (isNext && newPage >= totalPages) return;

    const embed = buildUpcomingEmbed(matches, newPage, gameFilter);
    const buttons = buildPaginationButtons(newPage, totalPages, gameFilter);
    await interaction.update({ embeds: [embed], components: [buttons] });
}

async function handlePastPagination(interaction) {
    const { customId } = interaction;
    const isNext = customId.startsWith('past_next_');
    const prefix = isNext ? 'past_next_' : 'past_prev_';
    const afterPrefix = customId.replace(prefix, '');
    const sepIndex = afterPrefix.indexOf('::');
    const currentPage = parseInt(sepIndex >= 0 ? afterPrefix.substring(0, sepIndex) : afterPrefix, 10);
    const gameFilter = sepIndex >= 0 ? afterPrefix.substring(sepIndex + 2) : null;
    const newPage = isNext ? currentPage + 1 : Math.max(0, currentPage - 1);

    const { buildPastEmbed, buildPastPaginationButtons, MATCHES_PER_PAGE } = require('./commands/past');
    let matches = matchStore.getPastMatches();
    if (gameFilter) matches = matches.filter(m => m.game === gameFilter);

    const totalPages = Math.ceil(matches.length / MATCHES_PER_PAGE);

    if (isNext && newPage >= totalPages) return;

    const embed = buildPastEmbed(matches, newPage, gameFilter);
    const buttons = buildPastPaginationButtons(newPage, totalPages, gameFilter);
    await interaction.update({ embeds: [embed], components: [buttons] });
}

// ============================================================================
// MODAL HANDLER
// ============================================================================

async function handleModal(interaction) {
    const { customId } = interaction;
    
    if (customId.startsWith('mapveto_modal_')) return handleMapVetoModal(interaction);
    if (customId.startsWith('edit_time_modal_')) return handleEditTimeModal(interaction);
    if (customId.startsWith('edit_format_modal_')) return handleEditFormatModal(interaction);
    if (customId.startsWith('edit_stream_modal_')) return handleEditStreamModal(interaction);
    if (customId.startsWith('edit_enemy_modal_')) return handleEditEnemyModal(interaction);
    if (customId.startsWith('edit_event_modal_')) return handleEditEventModal(interaction);
    if (customId.startsWith('edit_info_modal_')) return handleEditInfoModal(interaction);
}

async function handleMapVetoModal(interaction) {
    const matchId = interaction.customId.replace('mapveto_modal_', '');
    const match = matchStore.getMatch(matchId);

    if (!match) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }

    if (match.announced) {
        return interaction.reply({ content: '❌ This match has already been announced.', ephemeral: true });
    }

    const map1Raw = interaction.fields.getTextInputValue('map1');
    const map2Raw = interaction.fields.getTextInputValue('map2');
    const map3Raw = interaction.fields.getTextInputValue('map3');

    // Parse map entries
    const parseMapEntry = (input, isDecider = false) => {
        if (!input || !input.trim()) return null;
        if (isDecider) return { map: input.trim(), pickedBy: 'Decider' };

        const parts = input.split(',').map(s => s.trim());
        if (parts.length >= 2 && parts[1]) {
            return { map: parts[0], pickedBy: parts[1] };
        }
        return { map: parts[0], pickedBy: null };
    };

    const mapVeto = [];
    const map1 = parseMapEntry(map1Raw);
    const map2 = parseMapEntry(map2Raw);
    const map3 = parseMapEntry(map3Raw, true);

    if (map1) mapVeto.push(map1);
    if (map2) mapVeto.push(map2);
    if (map3) mapVeto.push(map3);

    const updatedMatch = matchStore.updateMatch(matchId, { mapVeto });
    
    if (!updatedMatch) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }
    
    const isManageEmbed = interaction.message?.embeds?.length > 0;

    if (isManageEmbed) {
        // Refresh the manage embed
        const { buildManageEmbed, buildManageButtons } = require('./commands/manage');
        const gameConfig = GAME_CONFIGS[updatedMatch.game];
        
        if (!gameConfig) {
            return interaction.update({ content: '❌ Error: Invalid game configuration.', components: [] });
        }
        
        const embed = buildManageEmbed(updatedMatch, gameConfig);
        const components = buildManageButtons(updatedMatch, gameConfig);

        await interaction.update({ embeds: [embed], components });
    } else {
        // From scheduler reminder
        const mapList = mapVeto.map((m, i) => {
            if (m.pickedBy) return `• Map ${i + 1}: ${m.map} (${m.pickedBy})`;
            return `• Map ${i + 1}: ${m.map}`;
        }).join('\n');

        try {
            await interaction.message.edit({
                content: `✅ **Map Veto Added!**\n\n**${match.matchTitle}**\n\n${mapList}`,
                components: []
            });
        } catch (e) {
            // Message might not be editable
        }

        await interaction.reply({
            content: `✅ **Map Veto Saved!**\n\n${mapList}\n\nThis will be included in the announcement.`,
            ephemeral: true
        });
    }

    console.log(`🗺️ Map veto added for: ${match.matchTitle}`);
}

// --- Edit Modals ---

/**
 * Helper to refresh the manage embed after an edit
 */
async function refreshManageEmbed(interaction, updatedMatch) {
    const { buildManageEmbed, buildManageButtons } = require('./commands/manage');
    const gameConfig = GAME_CONFIGS[updatedMatch?.game];
    
    if (!gameConfig) {
        console.error(`Invalid game config for match: ${updatedMatch?.id}`);
        return interaction.update({ content: '❌ Error: Invalid game configuration.', components: [] });
    }
    
    const embed = buildManageEmbed(updatedMatch, gameConfig);
    const components = buildManageButtons(updatedMatch, gameConfig);
    await interaction.update({ embeds: [embed], components });
}

/**
 * Helper to update Discord scheduled event after an edit
 */
async function updateScheduledEventAfterEdit(guild, match, updates) {
    if (!match.scheduledEventId) return;
    
    try {
        const event = await guild.scheduledEvents.fetch(match.scheduledEventId).catch(() => null);
        if (!event) return;
        
        await event.edit(updates);
        console.log(`📅 Updated scheduled event: ${match.matchTitle}`);
    } catch (error) {
        console.log(`⚠ Could not update scheduled event: ${error.message}`);
    }
}

async function handleEditTimeModal(interaction) {
    const { parseDateTime } = require('./utils/dateParser');
    const matchId = interaction.customId.replace('edit_time_modal_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const startTimeInput = interaction.fields.getTextInputValue('start_time');
    const startTime = parseDateTime(startTimeInput);
    
    if (!startTime || isNaN(startTime.getTime())) {
        return interaction.reply({
            content: '❌ Could not parse the start time. Please use a format like:\n' +
                '• `15/03 7pm` or `15/03 19:00` (UK format)\n' +
                '• `today 7pm` or `tomorrow 19:00`\n' +
                '• `in 2 hours` or `in 30 minutes`',
            ephemeral: true,
        });
    }
    
    if (startTime <= new Date()) {
        return interaction.reply({ content: '❌ Start time must be in the future!', ephemeral: true });
    }
    
    const updatedMatch = matchStore.updateMatch(matchId, { startTime: startTime.toISOString() });
    
    if (!updatedMatch) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }
    
    // Update scheduled event if exists
    await updateScheduledEventAfterEdit(interaction.guild, updatedMatch, {
        scheduledStartTime: startTime,
        scheduledEndTime: new Date(startTime.getTime() + 3 * 60 * 60 * 1000),
    });
    
    await refreshManageEmbed(interaction, updatedMatch);
    console.log(`✏️ Updated time for: ${match.matchTitle}`);
}

async function handleEditFormatModal(interaction) {
    const { BEST_OF_OPTIONS } = require('./utils/gameConfig');
    const matchId = interaction.customId.replace('edit_format_modal_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const formatInput = interaction.fields.getTextInputValue('format').toUpperCase().trim();
    
    // Normalize input (accept "BO3", "bo3", "Best of 3", etc.)
    let bestOf = null;
    let bestOfDisplay = null;
    
    if (formatInput === 'BO1' || formatInput === 'BEST OF 1' || formatInput === '1') {
        bestOf = 'bo1';
        bestOfDisplay = 'BO1';
    } else if (formatInput === 'BO3' || formatInput === 'BEST OF 3' || formatInput === '3') {
        bestOf = 'bo3';
        bestOfDisplay = 'BO3';
    } else if (formatInput === 'BO5' || formatInput === 'BEST OF 5' || formatInput === '5') {
        bestOf = 'bo5';
        bestOfDisplay = 'BO5';
    } else if (formatInput === 'NONE' || formatInput === '') {
        bestOf = 'none';
        bestOfDisplay = null;
    } else {
        // Custom format
        bestOf = 'other';
        bestOfDisplay = interaction.fields.getTextInputValue('format').trim();
    }
    
    const updatedMatch = matchStore.updateMatch(matchId, { bestOf, bestOfDisplay });
    
    if (!updatedMatch) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }
    
    // Update scheduled event description if exists
    if (match.scheduledEventId) {
        const { buildEventDescription } = require('./commands/add');
        const gameConfig = GAME_CONFIGS[updatedMatch.game];
        await updateScheduledEventAfterEdit(interaction.guild, updatedMatch, {
            description: buildEventDescription(gameConfig, bestOfDisplay, updatedMatch.streamLink, updatedMatch.infoLink),
        });
    }
    
    await refreshManageEmbed(interaction, updatedMatch);
    console.log(`✏️ Updated format for: ${match.matchTitle}`);
}

async function handleEditStreamModal(interaction) {
    const matchId = interaction.customId.replace('edit_stream_modal_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const streamLink = interaction.fields.getTextInputValue('stream_link').trim();
    
    if (!streamLink) {
        return interaction.reply({ content: '❌ Stream link cannot be empty.', ephemeral: true });
    }
    
    const updatedMatch = matchStore.updateMatch(matchId, { streamLink });
    
    if (!updatedMatch) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }
    
    // Update scheduled event description if exists
    if (match.scheduledEventId) {
        const { buildEventDescription } = require('./commands/add');
        const gameConfig = GAME_CONFIGS[updatedMatch.game];
        await updateScheduledEventAfterEdit(interaction.guild, updatedMatch, {
            description: buildEventDescription(gameConfig, updatedMatch.bestOfDisplay, streamLink, updatedMatch.infoLink),
        });
    }
    
    await refreshManageEmbed(interaction, updatedMatch);
    console.log(`✏️ Updated stream for: ${match.matchTitle}`);
}

async function handleEditEnemyModal(interaction) {
    const matchId = interaction.customId.replace('edit_enemy_modal_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const enemyTeam = interaction.fields.getTextInputValue('enemy_team').trim();
    
    if (!enemyTeam) {
        return interaction.reply({ content: '❌ Enemy team name cannot be empty.', ephemeral: true });
    }
    
    const gameConfig = GAME_CONFIGS[match.game];
    const matchTitle = `[${gameConfig.name}] ${gameConfig.teamName} vs ${enemyTeam} • ${match.eventName}`;
    
    const updatedMatch = matchStore.updateMatch(matchId, { enemyTeam, matchTitle });
    
    if (!updatedMatch) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }
    
    // Update scheduled event name if exists
    await updateScheduledEventAfterEdit(interaction.guild, updatedMatch, { name: matchTitle });
    
    await refreshManageEmbed(interaction, updatedMatch);
    console.log(`✏️ Updated enemy team for: ${match.matchTitle}`);
}

async function handleEditEventModal(interaction) {
    const matchId = interaction.customId.replace('edit_event_modal_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const eventName = interaction.fields.getTextInputValue('event_name').trim();
    
    if (!eventName) {
        return interaction.reply({ content: '❌ Event name cannot be empty.', ephemeral: true });
    }
    
    const gameConfig = GAME_CONFIGS[match.game];
    let matchTitle;
    
    if (gameConfig.hasEnemyTeam === false || !match.enemyTeam) {
        matchTitle = `[${gameConfig.name}] ${gameConfig.teamName} • ${eventName}`;
    } else {
        matchTitle = `[${gameConfig.name}] ${gameConfig.teamName} vs ${match.enemyTeam} • ${eventName}`;
    }
    
    const updatedMatch = matchStore.updateMatch(matchId, { eventName, matchTitle });
    
    if (!updatedMatch) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }
    
    // Update scheduled event name if exists
    await updateScheduledEventAfterEdit(interaction.guild, updatedMatch, { name: matchTitle });
    
    await refreshManageEmbed(interaction, updatedMatch);
    console.log(`✏️ Updated event name for: ${match.matchTitle}`);
}

async function handleEditInfoModal(interaction) {
    const matchId = interaction.customId.replace('edit_info_modal_', '');
    const match = matchStore.getMatch(matchId);
    
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    if (match.announced) return interaction.reply({ content: '❌ Cannot edit announced match.', ephemeral: true });
    
    const infoLink = interaction.fields.getTextInputValue('info_link').trim() || 'N/A';
    
    const updatedMatch = matchStore.updateMatch(matchId, { infoLink });
    
    if (!updatedMatch) {
        return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    }
    
    // Update scheduled event description if exists
    if (match.scheduledEventId) {
        const { buildEventDescription } = require('./commands/add');
        const gameConfig = GAME_CONFIGS[updatedMatch.game];
        await updateScheduledEventAfterEdit(interaction.guild, updatedMatch, {
            description: buildEventDescription(gameConfig, updatedMatch.bestOfDisplay, updatedMatch.streamLink, infoLink),
        });
    }
    
    await refreshManageEmbed(interaction, updatedMatch);
    console.log(`✏️ Updated info link for: ${match.matchTitle}`);
}

// ============================================================================
// LOGIN
// ============================================================================

client.login(process.env.DISCORD_TOKEN);

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

function shutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    
    // Clear scheduled intervals
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
    }
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
    
    client.destroy();
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ============================================================================
// ERROR HANDLERS
// ============================================================================

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    // Give time for the error to be logged, then exit
    // The container restart policy (docker-compose) will restart the bot
    setTimeout(() => process.exit(1), 1000);
});
