import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRosterText,
  formatShiftDetails,
  buildShiftEvent,
  to24Hour
} from '../assets/js/roster-scan.js';

// The exact text of the McDonald's myJob roster screenshot
// (~/workspace/user/files/Screenshot_20261124-230705_0_gw7v.png).
const SCREENSHOT_TEXT = `
PM
Roster period from Monday 30/Nov/2026 to Sunday 06/Dec/2026
You have been rostered on 3 shifts this week
This weeks roster was last published on 24/Nov/2026 12:00 AM

Friday 04/Dec/2026
EAST VICTORIA PARK WA
Start 4:00 PM Friday 04/Dec/2026
Finish 8:00 PM Friday 04/Dec/2026
4:00hrs
PI:Production Intermediate
Initially viewed at Tuesday 24/Nov/2026 11:06 PM

Saturday 05/Dec/2026
EAST VICTORIA PARK WA
Start 2:00 PM Saturday 05/Dec/2026
Finish 9:00 PM Saturday 05/Dec/2026
Break time 6:30 PM - 7:00 PM
6:30hrs + 0:30hrs Break
PI:Production Intermediate
Initially viewed at Tuesday 24/Nov/2026 11:06 PM

Sunday 06/Dec/2026
EAST VICTORIA PARK WA
Start 4:00 PM Sunday 06/Dec/2026
Finish 8:30 PM Sunday 06/Dec/2026
4:30hrs
PI:Production Intermediate
Initially viewed at Tuesday 24/Nov/2026 11:06 PM
`;

test('parses all three shifts from the roster screenshot text', () => {
  const shifts = parseRosterText(SCREENSHOT_TEXT);
  assert.equal(shifts.length, 3);

  assert.deepEqual(shifts[0], {
    date: '2026-12-04',
    startTime: '16:00',
    endTime: '20:00',
    location: 'EAST VICTORIA PARK WA',
    role: 'PI: Production Intermediate',
    breakText: '',
    hours: '4:00hrs'
  });

  assert.deepEqual(shifts[1], {
    date: '2026-12-05',
    startTime: '14:00',
    endTime: '21:00',
    location: 'EAST VICTORIA PARK WA',
    role: 'PI: Production Intermediate',
    breakText: '6:30 PM - 7:00 PM',
    hours: '6:30hrs + 0:30hrs Break'
  });

  assert.deepEqual(shifts[2], {
    date: '2026-12-06',
    startTime: '16:00',
    endTime: '20:30',
    location: 'EAST VICTORIA PARK WA',
    role: 'PI: Production Intermediate',
    breakText: '',
    hours: '4:30hrs'
  });
});

test('tolerates an OCR-misread role code or colon', () => {
  const misread = `
    Friday 04/Dec/2026
    EAST VICTORIA PARK WA
    Start 4:00 PM
    Finish 8:00 PM
    4:00hrs
    Pl;Production Intermediate
  `;
  const shifts = parseRosterText(misread);
  assert.equal(shifts.length, 1);
  assert.equal(shifts[0].role, 'PI: Production Intermediate');

  const noCode = `
    Friday 04/Dec/2026
    EAST VICTORIA PARK WA
    Start 4:00 PM
    Finish 8:00 PM
    4:00hrs
    Production Intermediate
  `;
  assert.equal(parseRosterText(noCode)[0].role, 'PI: Production Intermediate');
});

test('the roster period header does not become a shift', () => {
  const shifts = parseRosterText(
    'Roster period from Monday 30/Nov/2026 to Sunday 06/Dec/2026\n' +
    'You have been rostered on 3 shifts this week\n'
  );
  assert.deepEqual(shifts, []);
});

test('12-hour times convert to 24-hour times', () => {
  assert.equal(to24Hour('4:00 PM'), '16:00');
  assert.equal(to24Hour('8:30 PM'), '20:30');
  assert.equal(to24Hour('2:00 PM'), '14:00');
  assert.equal(to24Hour('9:00 PM'), '21:00');
  assert.equal(to24Hour('12:00 AM'), '00:00');
  assert.equal(to24Hour('12:00 PM'), '12:00');
  assert.equal(to24Hour('9:05 AM'), '09:05');
  assert.equal(to24Hour(''), '');
  assert.equal(to24Hour('not a time'), '');
});

test('tolerates OCR noise: tight times, dotted times, short weekdays, extra spaces', () => {
  const noisy = `
    Fri 04/Dec/2026
    EAST VICTORIA PARK WA
    Start 4:00PM Fri 04/Dec/2026
    Finish 8.00 PM Fri 04/Dec/2026
    4:00hrs
    PI: Production Intermediate
  `;
  const shifts = parseRosterText(noisy);
  assert.equal(shifts.length, 1);
  assert.equal(shifts[0].date, '2026-12-04');
  assert.equal(shifts[0].startTime, '16:00');
  assert.equal(shifts[0].endTime, '20:00');
  assert.equal(shifts[0].role, 'PI: Production Intermediate');
});

test('tolerates a bare date header and a zero read as the letter O', () => {
  const shifts = parseRosterText(
    'O4/Dec/2026\nEAST VICTORIA PARK WA\nStart 4:00 PM\nFinish 8:00 PM\n4:00hrs\n'
  );
  assert.equal(shifts.length, 1);
  assert.equal(shifts[0].date, '2026-12-04');
  assert.equal(shifts[0].startTime, '16:00');
  assert.equal(shifts[0].endTime, '20:00');
});

test('returns no shifts for empty or unrelated text', () => {
  assert.deepEqual(parseRosterText(''), []);
  assert.deepEqual(parseRosterText('Hello world, no roster here.'), []);
  assert.deepEqual(parseRosterText('Friday 04/Dec/2026\nJust a date, no times\n'), []);
});

test('formats shift details as just the break, if there is one', () => {
  assert.equal(
    formatShiftDetails({
      location: 'EAST VICTORIA PARK WA',
      role: 'PI: Production Intermediate',
      breakText: '6:30 PM - 7:00 PM',
      hours: '6:30hrs + 0:30hrs Break'
    }),
    'Break 6:30 PM - 7:00 PM'
  );
  assert.equal(
    formatShiftDetails({
      location: 'EAST VICTORIA PARK WA',
      role: 'PI: Production Intermediate',
      breakText: '',
      hours: '4:00hrs'
    }),
    ''
  );
  assert.equal(formatShiftDetails({ location: '', role: '', breakText: '', hours: '' }), '');
});

test('builds the calendar event payload for the logged-in user', () => {
  const shifts = parseRosterText(SCREENSHOT_TEXT);
  assert.deepEqual(buildShiftEvent(shifts[1], 'Luke'), {
    date: '2026-12-05',
    event: {
      title: "Luke's job shift",
      startTime: '14:00',
      endTime: '21:00',
      time: 'Break 6:30 PM - 7:00 PM',
      author: 'Luke',
      for: 'Luke'
    }
  });
  assert.equal(buildShiftEvent(shifts[0], 'Charlotte').event.title, "Charlotte's job shift");
  assert.equal(buildShiftEvent(shifts[0], 'Charlotte').event.for, 'Charlotte');
  assert.equal(buildShiftEvent(shifts[0], '').event.title, "Us's job shift");
  assert.equal(buildShiftEvent(shifts[0], '').event.for, 'both');
});
