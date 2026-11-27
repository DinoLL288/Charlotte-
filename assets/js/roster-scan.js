// Roster screenshot parser — pure functions, no DOM, no network.
// Used by the calendar page to turn a McDonald's myJob roster screenshot
// (read by OCR in the browser) into calendar shifts.
// The screenshot itself is never uploaded or stored anywhere; only the
// parsed shift details the user confirms are saved as calendar events.

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12'
};

const WEEKDAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun'
];

// A date like "04/Dec/2026", "4 Dec 2026" or "04-Dec-2026".
// OCR sometimes reads 0 as O, so digits allow O/o and are fixed up.
const DATE_RE = /^(\d{1,2}|[Oo]\d|\d[Oo])\s*[/\-\s]\s*([A-Za-z]{3,9})\s*[/\-\s]\s*([0-9Oo]{4})$/;

// A shift block starts with a weekday + date, or a bare date, at the
// start of a line: "Friday 04/Dec/2026" or "04/Dec/2026".
const HEADER_RE = new RegExp(
  `^(?:(${WEEKDAYS.join('|')})\\s+)?(\\d{1,2}|[Oo]\\d|\\d[Oo])\\s*[/\\-\\s]\\s*([A-Za-z]{3,9})\\s*[/\\-\\s]\\s*([0-9Oo]{4})`,
  'i'
);

// "4:00 PM", "4:00PM", "4.00 PM" (OCR often reads ':' as '.').
const TIME_RE = /(\d{1,2})\s*[:.]\s*(\d{2})\s*([AP])\.?\s*M\.?/i;

function fixDigits(value) {
  return String(value || '').replace(/[Oo]/g, '0');
}

function monthNumber(name) {
  return MONTHS[String(name || '').toLowerCase()] || null;
}

function parseRosterDate(day, monthName, year) {
  const month = monthNumber(monthName);
  if (!month) return null;
  const d = Number(fixDigits(day));
  const y = Number(fixDigits(year));
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, Number(month) - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return `${y}-${month}-${String(d).padStart(2, '0')}`;
}

// "4:00 PM" -> "16:00". Returns '' when the value is not a 12-hour time.
export function to24Hour(value) {
  const match = TIME_RE.exec(String(value || '').trim());
  if (!match) return '';
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 1 || hours > 12 || minutes > 59) return '';
  const isPm = match[3].toUpperCase() === 'P';
  if (isPm && hours !== 12) hours += 12;
  if (!isPm && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function cleanTimeDisplay(value) {
  const match = TIME_RE.exec(String(value || '').trim());
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = String(match[2]).padStart(2, '0');
  const meridiem = match[3].toUpperCase() === 'P' ? 'PM' : 'AM';
  return `${hours}:${minutes} ${meridiem}`;
}

function isNoiseLine(line) {
  const lower = line.toLowerCase();
  return (
    lower.includes('roster period') ||
    lower.includes('been rostered') ||
    lower.includes('last published') ||
    lower.includes('initially viewed') ||
    lower === 'pm' ||
    lower === 'am'
  );
}

// A location line is a mostly-uppercase line, e.g. "EAST VICTORIA PARK WA".
function looksLikeLocation(line) {
  if (line.length < 4 || line.length > 60) return false;
  if (/start|finish|break|roster|initially|published|hrs|:/i.test(line)) return false;
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.8;
}

function parseShiftBlock(lines) {
  const shift = {
    date: '',
    startTime: '',
    endTime: '',
    location: '',
    role: '',
    breakText: '',
    hours: ''
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || isNoiseLine(line)) continue;

    const startMatch = /^start\s+(.+)$/i.exec(line);
    if (startMatch) {
      shift.startTime = to24Hour(startMatch[1]);
      continue;
    }

    const finishMatch = /^finish\s+(.+)$/i.exec(line);
    if (finishMatch) {
      shift.endTime = to24Hour(finishMatch[1]);
      continue;
    }

    const breakMatch = /break\s*time\s+(.+?)\s*[-–—]\s*(.+)$/i.exec(line);
    if (breakMatch) {
      const from = cleanTimeDisplay(breakMatch[1]);
      const to = cleanTimeDisplay(breakMatch[2]);
      if (from && to) shift.breakText = `${from} - ${to}`;
      continue;
    }

    const hoursMatch = /(\d{1,2}\s*[:.]\s*\d{2}\s*hrs(?:\s*\+\s*\d{1,2}\s*[:.]\s*\d{2}\s*hrs\s*break)?)/i.exec(line);
    if (hoursMatch) {
      shift.hours = hoursMatch[1].replace(/\s+/g, '').replace(/\.(\d{2})/g, ':$1');
      // Normalise "6:30hrs+0:30hrsBreak" back to a readable form.
      shift.hours = shift.hours
        .replace(/hrs\+/i, 'hrs + ')
        .replace(/hrsBreak/i, 'hrs Break');
      continue;
    }

    // Role line, e.g. "PI:Production Intermediate" or "PI: Production Intermediate".
    // OCR often misreads the code ("PI" as "Pl" or "P1") or the colon (";" for ":").
    const roleMatch = /^([A-Za-z0-9]{1,3})\s*[:;]\s*(.+)$/.exec(line);
    if (
      roleMatch &&
      /[A-Za-z]/.test(roleMatch[1]) &&
      /[A-Za-z]/.test(roleMatch[2]) &&
      !/start|finish|break/i.test(line)
    ) {
      const code = roleMatch[1].replace(/l/g, 'I').replace(/1/g, 'I').toUpperCase();
      shift.role = `${code}: ${roleMatch[2].trim()}`;
      continue;
    }

    // Fallback: a line naming the role with no readable code still counts.
    if (/production\s+intermediate/i.test(line)) {
      const cleaned = line.replace(/^[A-Za-z0-9]{1,3}\s*[:;]\s*/, '').replace(/\s+/g, ' ').trim();
      shift.role = `PI: ${cleaned}`;
      continue;
    }

    if (!shift.location && looksLikeLocation(line)) {
      shift.location = line.replace(/\s+/g, ' ').trim();
    }
  }

  return shift;
}

// Parse OCR text from a roster screenshot into shifts, in order.
// Each shift: { date, startTime, endTime, location, role, breakText, hours }.
export function parseRosterText(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (isNoiseLine(line)) continue;
    const header = HEADER_RE.exec(line);
    if (header) {
      const date = parseRosterDate(header[2], header[3], header[4]);
      if (date) {
        // The header line may also carry a time ("Start 4:00 PM ..."
        // never starts a block, but a bare date line is clean), so the
        // rest of the line after the date is not a shift detail.
        current = { date, lines: [] };
        blocks.push(current);
        continue;
      }
    }
    if (current) current.lines.push(line);
  }

  return blocks
    .map(block => ({ ...parseShiftBlock(block.lines), date: block.date }))
    .filter(shift => shift.date && (shift.startTime || shift.endTime));
}

// Just the break, if there is one — the calendar shows the start/end times itself.
export function formatShiftDetails(shift) {
  return shift.breakText ? `Break ${shift.breakText}` : '';
}

// Build the { date, event } payload the calendar API expects for a shift.
export function buildShiftEvent(shift, author) {
  const name = String(author || '').trim() || 'Us';
  return {
    date: shift.date,
    event: {
      title: `${name}'s job shift`,
      startTime: shift.startTime || '',
      endTime: shift.endTime || '',
      time: formatShiftDetails(shift),
      author: name,
      // A scanned shift belongs to the one person on the roster, never both.
      for: name === 'Luke' || name === 'Charlotte' ? name : 'both'
    }
  };
}

export { DATE_RE };
