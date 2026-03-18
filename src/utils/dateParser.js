/**
 * =============================================================================
 * DATE PARSER - UK Timezone Support
 * =============================================================================
 * Shared utility for parsing various datetime formats with UK timezone support.
 * All times are interpreted and converted to/from UK timezone (Europe/London).
 * 
 * Supported Formats:
 * - UK date + time: "15/03 7pm", "15/03 19:00", "15/03/2026 7pm"
 * - UK date + time + timezone: "15/03 13:00 CET", "15/03 13:00 BST"
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

const TIMEZONE_OFFSETS = {
    'utc': 0,
    'gmt': 0,
    'wet': 0,
    'bst': 1,
    'cet': 1,
    'cest': 2,
    'west': 1,
    'eet': 2,
    'eest': 3,
    'ist': 5.5,
    'jst': 9,
    'aest': 10,
    'nzst': 12,
    'pdt': -7,
    'pst': -8,
    'mdt': -6,
    'mst': -7,
    'cdt': -5,
    'cst': -6,
    'edt': -4,
    'est': -5,
    'adt': -3,
    'ast': -4,
};

function isUkBsTime(year, month, day) {
    const prevSunday = new Date(Date.UTC(year, month - 1, day));
    prevSunday.setDate(prevSunday.getDate() - prevSunday.getDay());
    const march = new Date(Date.UTC(year, 2, 31));
    const marchLastSunday = march.getDate() - ((march.getDay() + 6) % 7);
    const bstStart = new Date(Date.UTC(year, 2, marchLastSunday, 1, 0, 0));
    const october = new Date(Date.UTC(year, 9, 31));
    const octLastSunday = october.getDate() - ((october.getDay() + 6) % 7);
    const bstEnd = new Date(Date.UTC(year, 9, octLastSunday, 1, 0, 0));
    const check = new Date(Date.UTC(year, month - 1, day));
    return check >= bstStart && check < bstEnd;
}

// =============================================================================
// TIMEZONE PARSING
// =============================================================================

/**
 * Extract timezone from input string and return offset in hours
 * @param {string} input - The input string to check for timezone
 * @returns {{ offset: number, remainingInput: string } | null}
 */
function parseTimezone(input) {
    const tzMatch = input.match(/\b(utc|gmt|wet|bst|cet|cest|west|eet|eest|ist|jst|aest|nzst|pdt|pst|mdt|mst|cdt|cst|edt|est|adt|ast)\b/i);
    
    if (tzMatch) {
        const tz = tzMatch[1].toLowerCase();
        const offset = TIMEZONE_OFFSETS[tz];
        const remainingInput = input.replace(tzMatch[0], '').trim();
        return { offset, remainingInput };
    }
    
    return null;
}

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
 * Interprets input as UK wall-clock time and converts to UTC
 * 
 * @param {number} year
 * @param {number} month - 1-indexed (1 = January)
 * @param {number} day
 * @param {number} hours - 24-hour format (UK time)
 * @param {number} minutes
 * @param {number} [tzOffsetHours=0] - Timezone offset from UTC for input (e.g., 1 for CET)
 * @returns {Date}
 */
function createUKDate(year, month, day, hours, minutes, tzOffsetHours = 0) {
    const utcTime = Date.UTC(year, month - 1, day, hours - tzOffsetHours, minutes, 0);
    return new Date(utcTime);
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parse various datetime formats into a Date object
 * All times are interpreted as UK timezone by default
 * 
 * @param {string} input - The datetime string to parse
 * @returns {Date | null} - Parsed date or null if invalid
 */
function parseDateTime(input) {
    if (!input || typeof input !== 'string') return null;
    
    const trimmed = input.trim();
    const lowerTrimmed = trimmed.toLowerCase();
    const now = new Date();
    const ukNow = getUKDate(now);
    
    let timezoneOffset = null;
    let remainingInput = trimmed;
    
    const tzResult = parseTimezone(trimmed);
    if (tzResult) {
        timezoneOffset = tzResult.offset;
        remainingInput = tzResult.remainingInput;
    }
    
    const workingInput = remainingInput.toLowerCase();
    
    let parsedYear = ukNow.year;
    let parsedMonth = ukNow.month;
    let parsedDay = null;
    
    // -------------------------------------------------------------------------
    // Relative time: "in X hours/minutes"
    // -------------------------------------------------------------------------
    const relativeMatch = workingInput.match(/^in\s+(\d+)\s*(hours?|hrs?|minutes?|mins?)$/);
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
    const relativeDayMatch = workingInput.match(/^(today|tomorrow)\s+(.+)$/);
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
            
            if (timezoneOffset === null) {
                timezoneOffset = isUkBsTime(year, month, day) ? 1 : 0;
            }
            
            return createUKDate(year, month, day, time.hours, time.minutes, timezoneOffset);
        }
    }
    
    // -------------------------------------------------------------------------
    // UK date format: "DD/MM time" or "DD/MM/YYYY time"
    // -------------------------------------------------------------------------
    const ukDateMatch = workingInput.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(.+)$/);
    if (ukDateMatch) {
        const day = parseInt(ukDateMatch[1], 10);
        const month = parseInt(ukDateMatch[2], 10);
        const year = ukDateMatch[3] ? parseInt(ukDateMatch[3], 10) : ukNow.year;
        const timeStr = ukDateMatch[4];
        const time = parseTime(timeStr);
        
        // Validate date components
        if (time && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            if (timezoneOffset === null) {
                timezoneOffset = isUkBsTime(year, month, day) ? 1 : 0;
            }
            return createUKDate(year, month, day, time.hours, time.minutes, timezoneOffset);
        }
    }
    
    // -------------------------------------------------------------------------
    // ISO format: "YYYY-MM-DD HH:MM" (treated as UK time)
    // -------------------------------------------------------------------------
    const isoMatch = trimmed.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
    if (isoMatch) {
        const [, year, month, day, hour, minute] = isoMatch;
        parsedYear = parseInt(year, 10);
        parsedMonth = parseInt(month, 10);
        parsedDay = parseInt(day, 10);
        
        if (timezoneOffset === null) {
            timezoneOffset = isUkBsTime(parsedYear, parsedMonth, parsedDay) ? 1 : 0;
        }
        
        return createUKDate(
            parsedYear,
            parsedMonth,
            parsedDay,
            parseInt(hour, 10),
            parseInt(minute, 10),
            timezoneOffset
        );
    }
    
    // -------------------------------------------------------------------------
    // EU format: "DD.MM.YYYY HH:MM" (treated as UK time)
    // -------------------------------------------------------------------------
    const euMatch = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (euMatch) {
        const [, day, month, year, hour, minute] = euMatch;
        parsedYear = parseInt(year, 10);
        parsedMonth = parseInt(month, 10);
        parsedDay = parseInt(day, 10);
        
        if (timezoneOffset === null) {
            timezoneOffset = isUkBsTime(parsedYear, parsedMonth, parsedDay) ? 1 : 0;
        }
        
        return createUKDate(
            parseInt(year, 10),
            parseInt(month, 10),
            parseInt(day, 10),
            parseInt(hour, 10),
            parseInt(minute, 10),
            timezoneOffset
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
    parseTimezone,
    createUKDate,
    isUkBsTime,
    UK_TIMEZONE,
    TIMEZONE_OFFSETS,
};
