/**
 * =============================================================================
 * MATCH STORE - Data Persistence Layer
 * =============================================================================
 * Handles all match data storage and retrieval with file-based locking
 * to prevent race conditions during concurrent operations.
 * 
 * Data is stored in: data/matches.json
 * Lock file: data/matches.lock
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'matches.json');
const LOCK_FILE = path.join(__dirname, '..', '..', 'data', 'matches.lock');

// Lock configuration
const LOCK_TIMEOUT = 5000;      // Max time to wait for lock (ms)
const LOCK_RETRY_DELAY = 50;    // Delay between lock acquisition attempts (ms)

// Shared buffer for non-blocking sleep (avoids busy-wait spin loops)
const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));

// Games that support map veto (used for filtering)
const GAMES_WITH_MAP_VETO = ['CS2', 'VALORANT', 'VALORANT_MOBILE'];

// =============================================================================
// FILE LOCKING
// =============================================================================

/**
 * Ensure the data directory exists
 */
function ensureDataDir() {
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

/**
 * Clean up stale lock file on startup.
 * If the process crashed while holding the lock, the lock file persists.
 * This should be called once during bot initialization.
 */
function cleanupStaleLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const lockPid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
            console.log(`Found stale lock file (PID: ${lockPid}), removing...`);
            fs.unlinkSync(LOCK_FILE);
            console.log(`Stale lock removed.`);
        }
    } catch (error) {
        // If we can't read/remove it, try force removing
        try { fs.unlinkSync(LOCK_FILE); } catch (e) { /* ignore */ }
    }
}

/**
 * Acquire a file lock to prevent race conditions
 * Uses exclusive file creation to ensure only one process holds the lock
 * @returns {boolean} True if lock was acquired
 */
function acquireLock() {
    ensureDataDir();
    const startTime = Date.now();
    
    while (Date.now() - startTime < LOCK_TIMEOUT) {
        try {
            // Try to create lock file exclusively (fails if exists)
            fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
            return true;
        } catch (error) {
            if (error.code === 'EEXIST') {
                // Lock exists - check if it's stale
                try {
                    const lockStat = fs.statSync(LOCK_FILE);
                    const lockAge = Date.now() - lockStat.mtimeMs;
                    
                    if (lockAge > LOCK_TIMEOUT) {
                        // Lock is stale, remove and retry
                        fs.unlinkSync(LOCK_FILE);
                        continue;
                    }
                } catch (e) {
                    // Lock file was removed by another process, retry
                    continue;
                }
                
                // Wait and retry (non-blocking sleep using Atomics.wait)
                Atomics.wait(SLEEP_BUFFER, 0, 0, LOCK_RETRY_DELAY);
            } else {
                throw error;
            }
        }
    }
    
    console.error('Failed to acquire lock after timeout');
    return false;
}

/**
 * Release the file lock
 */
function releaseLock() {
    try {
        fs.unlinkSync(LOCK_FILE);
    } catch (error) {
        // Lock file might already be removed
    }
}

/**
 * Execute a function with file locking
 * @param {Function} fn - Function to execute while holding the lock
 * @returns {*} Result of the function
 */
function withLock(fn) {
    if (!acquireLock()) {
        throw new Error('Could not acquire file lock');
    }
    try {
        return fn();
    } finally {
        releaseLock();
    }
}

// =============================================================================
// INTERNAL FILE OPERATIONS (no locking)
// =============================================================================

/**
 * Load all matches from storage (internal, no locking)
 * @returns {Object[]}
 */
function loadMatchesInternal() {
    ensureDataDir();
    
    if (!fs.existsSync(DATA_FILE)) {
        return [];
    }
    
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading matches:', error);
        return [];
    }
}

/**
 * Save all matches to storage (internal, no locking)
 * @param {Object[]} matches
 */
function saveMatchesInternal(matches) {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(matches, null, 2));
}

/**
 * Generate a unique numeric ID
 * @param {Object[]} matches - Existing matches
 * @returns {number}
 */
function generateId(matches) {
    if (matches.length === 0) return 1;
    const maxId = Math.max(...matches.map(m => typeof m.id === 'number' ? m.id : 0));
    return maxId + 1;
}

// =============================================================================
// PUBLIC API - Basic Operations
// =============================================================================

/**
 * Load all matches from storage
 * @returns {Object[]}
 */
function loadMatches() {
    return withLock(() => loadMatchesInternal());
}

/**
 * Save all matches to storage
 * @param {Object[]} matches
 */
function saveMatches(matches) {
    return withLock(() => saveMatchesInternal(matches));
}

/**
 * Add a new match
 * @param {Object} matchData - Match data (without id, announced, etc.)
 * @returns {Object} The created match with generated fields
 */
function addMatch(matchData) {
    return withLock(() => {
        const matches = loadMatchesInternal();
        
        const match = {
            id: generateId(matches),
            ...matchData,
            announced: false,
            mapVetoPrompted: false,
            createdAt: new Date().toISOString(),
        };
        
        matches.push(match);
        saveMatchesInternal(matches);
        
        return match;
    });
}

/**
 * Get a match by ID (supports both string and number)
 * @param {string|number} id
 * @returns {Object|undefined}
 */
function getMatch(id) {
    return withLock(() => {
        const matches = loadMatchesInternal();
        const numId = typeof id === 'string' ? parseInt(id, 10) : id;
        return matches.find(m => m.id === numId || m.id === id);
    });
}

/**
 * Update a match
 * @param {string|number} id
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated match or null if not found
 */
function updateMatch(id, updates) {
    return withLock(() => {
        const matches = loadMatchesInternal();
        const numId = typeof id === 'string' ? parseInt(id, 10) : id;
        const index = matches.findIndex(m => m.id === numId || m.id === id);
        
        if (index !== -1) {
            matches[index] = { ...matches[index], ...updates };
            saveMatchesInternal(matches);
            return matches[index];
        }
        
        return null;
    });
}

/**
 * Delete a match
 * @param {string|number} id
 * @returns {boolean} True if deleted
 */
function deleteMatch(id) {
    return withLock(() => {
        const matches = loadMatchesInternal();
        const numId = typeof id === 'string' ? parseInt(id, 10) : id;
        const filtered = matches.filter(m => m.id !== numId && m.id !== id);
        
        if (filtered.length < matches.length) {
            saveMatchesInternal(filtered);
            return true;
        }
        
        return false;
    });
}

// =============================================================================
// PUBLIC API - Query Operations
// =============================================================================

/**
 * Get all matches (including past)
 * @returns {Object[]}
 */
function getAllMatches() {
    return loadMatches();
}

/**
 * Get upcoming matches (not yet announced, in the future)
 * @returns {Object[]} Sorted by start time (soonest first)
 */
function getUpcomingMatches() {
    return withLock(() => {
        const matches = loadMatchesInternal();
        const now = new Date();
        
        return matches
            .filter(m => !m.announced && new Date(m.startTime) > now)
            .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    });
}

/**
 * Get past matches (announced or start time has passed)
 * @returns {Object[]} Sorted by start time (most recent first)
 */
function getPastMatches() {
    return withLock(() => {
        const matches = loadMatchesInternal();
        const now = new Date();
        
        return matches
            .filter(m => m.announced || new Date(m.startTime) <= now)
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    });
}

/**
 * Get matches that need announcement (start time reached, not announced)
 * @returns {Object[]}
 */
function getMatchesNeedingAnnouncement() {
    return withLock(() => {
        const matches = loadMatchesInternal();
        const now = new Date();
        return matches.filter(m => !m.announced && !m.isAnnouncing && new Date(m.startTime) <= now);
    });
}

/**
 * Get matches needing map veto prompt
 * Criteria: 5 minutes before start, game supports map veto, no veto set
 * @returns {Object[]}
 */
function getMatchesNeedingMapVetoPrompt() {
    return withLock(() => {
        const matches = loadMatchesInternal();
        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
        
        return matches.filter(m => {
            // Skip if already prompted or announced
            if (m.mapVetoPrompted || m.announced) return false;
            
            // Skip if game doesn't support map veto
            if (!GAMES_WITH_MAP_VETO.includes(m.game)) return false;
            
            // Skip if map veto already set
            if (m.mapVeto && m.mapVeto.length > 0) return false;
            
            // Check if within 5-minute window
            const startTime = new Date(m.startTime);
            return startTime <= fiveMinutesFromNow && startTime > now;
        });
    });
}

// =============================================================================
// PUBLIC API - Maintenance
// =============================================================================

/**
 * Clean up old announced matches (older than 7 days)
 */
function cleanupOldMatches() {
    return withLock(() => {
        const matches = loadMatchesInternal();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const filtered = matches.filter(m => {
            // Keep unannounced matches
            if (!m.announced) return true;
            // Keep matches from last 7 days
            return new Date(m.startTime) > sevenDaysAgo;
        });
        
        if (filtered.length < matches.length) {
            saveMatchesInternal(filtered);
            console.log(`✓ Cleaned up ${matches.length - filtered.length} old matches`);
        }
    });
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    // Basic operations
    loadMatches,
    saveMatches,
    addMatch,
    getMatch,
    updateMatch,
    deleteMatch,
    
    // Query operations
    getAllMatches,
    getUpcomingMatches,
    getPastMatches,
    getMatchesNeedingAnnouncement,
    getMatchesNeedingMapVetoPrompt,
    
    // Maintenance
    cleanupOldMatches,
    cleanupStaleLock,
};
