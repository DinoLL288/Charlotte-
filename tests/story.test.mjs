import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/js/format-time.js';
import {
  daysTogether,
  nextOccurrence,
  isStoryCalendarEvent,
  normalizeMoodMap,
  firstMoodPerMonth,
  buildStoryEntries,
  groupEntriesByMonth,
  buildShareText
} from '../assets/js/story.js';

// Friday 27 Nov 2026 — 32 days after 26 Oct 2026.
function now() {
  return new Date(2026, 10, 27, 12, 0, 0);
}

test('days together counts from 26 Oct 2026', () => {
  assert.equal(daysTogether(now()), 32);
  assert.equal(daysTogether(new Date(2026, 9, 26, 12, 0, 0)), 0);
  assert.equal(daysTogether(new Date(2027, 9, 26, 12, 0, 0)), 365);
});

test('next birthday and anniversary roll to next year', () => {
  assert.equal(nextOccurrence('03-09', now()).getFullYear(), 2027);
  assert.equal(nextOccurrence('03-09', now()).getMonth(), 2);
  assert.equal(nextOccurrence('10-26', now()).getFullYear(), 2027);
  assert.equal(nextOccurrence('03-09', new Date(2027, 2, 9, 12, 0, 0)).getFullYear(), 2027);
});

test('calendar curation keeps real plans and skips the rest', () => {
  assert.equal(isStoryCalendarEvent({ title: 'Charlotte kisses Luke' }), true);
  assert.equal(isStoryCalendarEvent({ title: 'TikTok: Dance🙃' }), true);
  assert.equal(isStoryCalendarEvent({ title: 'Love promise: Morning kiss (for Charlotte)' }), true);
  assert.equal(isStoryCalendarEvent({ title: 'WhatsApp video call', kind: 'whatsapp-call' }), false);
  assert.equal(isStoryCalendarEvent({ title: 'Quiet day', quietDay: true }), false);
  assert.equal(isStoryCalendarEvent({ title: 'Lukes Job' }), false);
  assert.equal(isStoryCalendarEvent({ title: "Luke's job shift" }), false);
  assert.equal(isStoryCalendarEvent({ title: 'Luke Job (Not training)' }), false);
  assert.equal(isStoryCalendarEvent({ title: 'Testing 1 2' }), false);
  assert.equal(isStoryCalendarEvent({ title: 'test 1 2' }), false);
  assert.equal(isStoryCalendarEvent({ title: 'Wash Hair' }), false);
  assert.equal(isStoryCalendarEvent({ title: 'Check eu.org domain approval' }), false);
  assert.equal(isStoryCalendarEvent({ title: '' }), false);
  assert.equal(isStoryCalendarEvent(null), false);
});

test('mood map normalises per-user and flat shapes', () => {
  const perUser = normalizeMoodMap({ entries: { Luke: { '2026-11-02': [{ mood: '😊', intensity: 3 }] } } });
  assert.equal(perUser.Luke['2026-11-02'][0].mood, '😊');
  const flat = normalizeMoodMap({ '2026-11-02': [{ mood: '🥰', intensity: 4 }] }, 'Charlotte');
  assert.equal(flat.Charlotte['2026-11-02'][0].mood, '🥰');
  assert.deepEqual(normalizeMoodMap(null), {});
  assert.deepEqual(normalizeMoodMap({ entries: {} }), {});
});

test('first mood per month takes the earliest entry that month', () => {
  const markers = firstMoodPerMonth({
    Luke: {
      '2026-11-10': [{ mood: '😊', intensity: 3 }],
      '2026-11-02': [{ mood: '🥰', intensity: 4 }]
    },
    Charlotte: { '2026-10-30': [{ mood: '🌙', intensity: 2 }] }
  });
  assert.equal(markers.length, 2);
  assert.equal(markers[0].dateKey, '2026-10-30');
  assert.equal(markers[0].person, 'Charlotte');
  assert.equal(markers[1].dateKey, '2026-11-02');
  assert.equal(markers[1].entry.mood, '🥰');
});

test('builder merges every source and sorts oldest first', () => {
  const entries = buildStoryEntries({
    moments: [{ id: 'm1', date: '2026-11-10', title: 'Our First Hand hold', body: 'Held hands', author: 'Luke' }],
    calendarEvents: {
      '2026-11-30': [{ id: 'e1', title: 'Charlotte kisses Luke', author: 'Luke' }],
      '2026-11-03': [{ id: 'e2', title: 'WhatsApp video call', kind: 'whatsapp-call' }],
      '2026-11-04': [{ id: 'e3', title: 'Love promise: Morning kiss (for Charlotte)', startTime: '07:30' }]
    },
    moodsByPerson: { Luke: { '2026-11-02': [{ mood: '🥰', intensity: 4 }] } },
    photos: [{ id: 'p1', name: 'us.jpg', caption: 'Us at the park', uploadedAt: '2026-11-15T10:00:00.000Z', uploadedBy: 'Luke', url: 'https://example.test/thumb.jpg' }],
    now: now()
  });
  const kinds = entries.map((entry) => entry.kind);
  assert.ok(kinds.includes('moment'));
  assert.ok(kinds.includes('event'));
  assert.ok(kinds.includes('mood'));
  assert.ok(kinds.includes('photo'));
  assert.ok(kinds.includes('milestone'));
  // The WhatsApp call was skipped.
  assert.equal(entries.some((entry) => entry.title === 'WhatsApp video call'), false);
  // Sorted oldest first.
  const keys = entries.map((entry) => entry.dateKey);
  assert.deepEqual(keys, [...keys].sort());
  // The kiss plan keeps its time, and 26 Oct appears exactly once:
  // no moment marks that day here, so the together-since milestone fills in.
  const kiss = entries.find((entry) => entry.title === 'Charlotte kisses Luke');
  assert.equal(kiss.dateKey, '2026-11-30');
  const promise = entries.find((entry) => entry.title.startsWith('Love promise'));
  assert.equal(promise.time, '07:30');
  assert.equal(entries.filter((entry) => entry.dateKey === '2026-10-26').length, 1);
});

test('empty data gives only the fixed milestones, nothing invented', () => {
  const entries = buildStoryEntries({ moments: [], calendarEvents: {}, moodsByPerson: {}, photos: [], now: now() });
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map((entry) => entry.kind), ['milestone', 'milestone', 'milestone']);
  assert.deepEqual(entries.map((entry) => entry.title), [
    'We started dating',
    'Charlotte’s birthday',
    'Our anniversary'
  ]);
  assert.equal(entries[0].dateKey, '2026-10-26');
  assert.equal(entries[1].dateKey, '2027-03-09');
  assert.equal(entries[1].comingUp, true);
  assert.equal(entries[2].dateKey, '2027-10-26');
});

test('builder skips entries with bad dates and keeps the rest', () => {
  const entries = buildStoryEntries({
    moments: [{ id: 'bad', date: 'not-a-date', title: 'Bad moment' }],
    calendarEvents: { 'garbage': [{ title: 'Bad event' }] },
    moodsByPerson: {},
    photos: [{ id: 'bad-photo', uploadedAt: 'not-a-date', url: 'https://example.test/x.jpg' }],
    now: now()
  });
  assert.equal(entries.some((entry) => entry.title === 'Bad moment'), false);
  assert.equal(entries.some((entry) => entry.title === 'Bad event'), false);
  assert.equal(entries.length, 3);
});

test('month groups are oldest first with en-AU labels', () => {
  const entries = buildStoryEntries({
    moments: [
      { id: 'm1', date: '2026-11-10', title: 'Hand hold' },
      { id: 'm2', date: '2026-10-26', title: 'We started Dating' }
    ],
    calendarEvents: {},
    moodsByPerson: {},
    photos: [],
    now: now()
  });
  const groups = groupEntriesByMonth(entries);
  assert.deepEqual(groups.map((group) => group.label), ['October 2026', 'November 2026', 'March 2027', 'October 2027']);
  assert.equal(groups[0].entries.length, 1);
  assert.deepEqual(groupEntriesByMonth([]), []);
});

test('share text names the day count and the moment count', () => {
  assert.equal(
    buildShareText({ now: now(), momentCount: 0 }),
    'Luke & Charlotte — together since 26 Oct 2026, 32 days and counting 💛'
  );
  assert.equal(
    buildShareText({ now: now(), momentCount: 5 }),
    'Luke & Charlotte — together since 26 Oct 2026, 32 days and counting 💛 · 5 moments in our story'
  );
  assert.equal(
    buildShareText({ now: new Date(2026, 9, 27, 12, 0, 0), momentCount: 1 }),
    'Luke & Charlotte — together since 26 Oct 2026, 1 day and counting 💛 · 1 moment in our story'
  );
});
