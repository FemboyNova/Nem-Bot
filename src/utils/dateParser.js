/**
 * =============================================================================
 * DATE PARSER - UK Timezone Support
 * =============================================================================
 * Shared utility for parsing various datetime formats with UK timezone support.
 * All times are interpreted and converted to/from UK timezone (Europe/London).
 * 
 * Supported Formats:
 * - UK date + time: "15/03 7pm", "15/03 19:00", "15/03/2026 7pm"
 * - Relative day: "today 7pm", "tomorrow 19:00"
 * - Relative time: "in 2 hours", "in 30 minutes"
 * - ISO format: "2026-03-15 19:00"
 * - EU format: "15.03.2026 19:00"
 * =============================================================================
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const UK_TIMEZONE = 'Europe/London';

// =============================================================================
// TIME PARSING
// =============================================================================

/**
 * Parse a time string (supports 12h and 24h formats)
 * @param {string} timeStr - e.g., "7pm", "7:30pm", "19:00", "19:30"
 * @returns {{ hours: number, minutes: number } | null}
 */
function parseTime(timeStr) {
    if (!timeStr) return null;
    
    const cleaned = timeStr.toLowerCase().trim();
    
    // 12-hour format: 7pm, 7:30pm, 7:30 pm, 7 pm
    const twelveHourMatch = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (twelveHourMatch) {
        let hours = parseInt(twelveHourMatch[1], 10);
        const minutes = parseInt(twelveHourMatch[2] || '0', 10);
        const period = twelveHourMatch[3];
        
        // Validate ranges
        if (hours < 1 || hours > 12) return null;
        if (minutes < 0 || minutes > 59) return null;
        
        // Convert to 24-hour
        if (period === 'pm' && hours !== 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;
        
        return { hours, minutes };
    }
    
    // 24-hour format: 19:00, 9:30, 09:30
    const twentyFourHourMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (twentyFourHourMatch) {
        const hours = parseInt(twentyFourHourMatch[1], 10);
        const minutes = parseInt(twentyFourHourMatch[2], 10);
        
        // Validate ranges
        if (hours < 0 || hours > 23) return null;
        if (minutes < 0 || minutes > 59) return null;
        
        return { hours, minutes };
    }
    
    return null;
}

// =============================================================================
// UK TIMEZONE HELPERS
// =============================================================================

/**
 * Get current date/time components in UK timezone
 * @param {Date} date - Date to convert (defaults to now)
 * @returns {{ day: number, month: number, year: number, hours: number, minutes: number, seconds: number }}
 */
function getUKDate(date = new Date()) {
    const ukString = date.toLocaleString('en-GB', { timeZone: UK_TIMEZONE });
    const [datePart, timePart] = ukString.split(', ');
    const [day, month, year] = datePart.split('/').map(Number);
    const [hours, minutes, seconds] = timePart.split(':').map(Number);
    
    return { day, month, year, hours, minutes, seconds };
}

/**
 * Create a Date object for a specific UK time
 * Handles timezone offset calculation to return correct UTC time
 * 
 * @param {number} year
 * @param {number} month - 1-indexed (1 = January)
 * @param {number} day
 * @param {number} hours - 24-hour format
 * @param {number} minutes
 * @returns {Date}
 */
function createUKDate(year, month, day, hours, minutes) {
    // Create a local date first
    const localDate = new Date(year, month - 1, day, hours, minutes, 0);
    
    // Use Intl formatter to get UK time for the same instant
    const ukFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: UK_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    
    // Parse UK time components
    const ukParts = ukFormatter.formatToParts(localDate);
    const ukValues = {};
    ukParts.forEach(part => {
        if (part.type !== 'literal') {
            ukValues[part.type] = parseInt(part.value, 10);
        }
    });
    
    // Calculate offset and adjust
    const ukTime = new Date(
        ukValues.year,
        ukValues.month - 1,
        ukValues.day,
        ukValues.hour,
        ukValues.minute,
        0
    );
    const offset = localDate.getTime() - ukTime.getTime();
    
    return new Date(localDate.getTime() + offset);
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parse various datetime formats into a Date object
 * All times are interpreted as UK timezone
 * 
 * @param {string} input - The datetime string to parse
 * @returns {Date | null} - Parsed date or null if invalid
 */
function parseDateTime(input) {
    if (!input || typeof input !== 'string') return null;
    
    const trimmed = input.trim().toLowerCase();
    const now = new Date();
    const ukNow = getUKDate(now);
    
    // -------------------------------------------------------------------------
    // Relative time: "in X hours/minutes"
    // -------------------------------------------------------------------------
    const relativeMatch = trimmed.match(/^in\s+(\d+)\s*(hours?|hrs?|minutes?|mins?)$/);
    if (relativeMatch) {
        const amount = parseInt(relativeMatch[1], 10);
        const unit = relativeMatch[2];
        
        const multiplier = unit.startsWith('h')
            ? 60 * 60 * 1000  // hours
            : 60 * 1000;      // minutes
        
        return new Date(now.getTime() + amount * multiplier);
    }
    
    // -------------------------------------------------------------------------
    // Relative day: "today 7pm", "tomorrow 19:00"
    // -------------------------------------------------------------------------
    const relativeDayMatch = trimmed.match(/^(today|tomorrow)\s+(.+)$/);
    if (relativeDayMatch) {
        const dayWord = relativeDayMatch[1];
        const timeStr = relativeDayMatch[2];
        const time = parseTime(timeStr);
        
        if (time) {
            let { day, month, year } = ukNow;
            
            if (dayWord === 'tomorrow') {
                const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                const ukTomorrow = getUKDate(tomorrow);
                day = ukTomorrow.day;
                month = ukTomorrow.month;
                year = ukTomorrow.year;
            }
            
            return createUKDate(year, month, day, time.hours, time.minutes);
        }
    }
    
    // -------------------------------------------------------------------------
    // UK date format: "DD/MM time" or "DD/MM/YYYY time"
    // -------------------------------------------------------------------------
    const ukDateMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(.+)$/);
    if (ukDateMatch) {
        const day = parseInt(ukDateMatch[1], 10);
        const month = parseInt(ukDateMatch[2], 10);
        const year = ukDateMatch[3] ? parseInt(ukDateMatch[3], 10) : ukNow.year;
        const timeStr = ukDateMatch[4];
        const time = parseTime(timeStr);
        
        // Validate date components
        if (time && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            return createUKDate(year, month, day, time.hours, time.minutes);
        }
    }
    
    // -------------------------------------------------------------------------
    // ISO format: "YYYY-MM-DD HH:MM" (treated as UK time)
    // -------------------------------------------------------------------------
    const isoMatch = input.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
    if (isoMatch) {
        const [, year, month, day, hour, minute] = isoMatch;
        return createUKDate(
            parseInt(year, 10),
            parseInt(month, 10),
            parseInt(day, 10),
            parseInt(hour, 10),
            parseInt(minute, 10)
        );
    }
    
    // -------------------------------------------------------------------------
    // EU format: "DD.MM.YYYY HH:MM" (treated as UK time)
    // -------------------------------------------------------------------------
    const euMatch = input.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (euMatch) {
        const [, day, month, year, hour, minute] = euMatch;
        return createUKDate(
            parseInt(year, 10),
            parseInt(month, 10),
            parseInt(day, 10),
            parseInt(hour, 10),
            parseInt(minute, 10)
        );
    }
    
    // -------------------------------------------------------------------------
    // Fallback: Native Date parsing
    // -------------------------------------------------------------------------
    const nativeDate = new Date(input);
    if (!isNaN(nativeDate.getTime())) {
        return nativeDate;
    }
    
    return null;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    parseDateTime,
    parseTime,
    createUKDate,
    UK_TIMEZONE,
};
