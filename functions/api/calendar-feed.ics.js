import { roomRequest } from './_gallery-auth.js';

function escapeIcs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function foldLine(line) {
  const chunks = [];
  while (line.length > 70) { chunks.push(line.slice(0, 70)); line = ' ' + line.slice(70); }
  chunks.push(line);
  return chunks.join('\r\n');
}
function decodeContent(content) {
  const bytes = Uint8Array.from(atob(String(content || '').replace(/\s/g, '')), char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
async function readRepoFile(env, path, fallback) {
  const repo = env.GITHUB_REPO, token = env.GITHUB_TOKEN, branch = env.GITHUB_BRANCH || 'main';
  if (!repo) return fallback;
  const headers = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'project-lover-boy-calendar-feed' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, { headers });
  if (response.status === 404) return fallback;
  if (!response.ok) throw new Error('Calendar source unavailable');
  const file = await response.json();
  return JSON.parse(decodeContent(file.content));
}
const toDate = value => String(value || '').replace(/-/g, '');
function addAllDay(lines, uid, date, title, description = '') {
  addAllDayRange(lines, uid, date, date, title, description);
}
function addAllDayRange(lines, uid, firstDate, lastDate, title, description = '') {
  const end = new Date(lastDate + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 1);
  lines.push('BEGIN:VEVENT', `UID:${uid}@project-lover-boy`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, `DTSTART;VALUE=DATE:${toDate(firstDate)}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, '')}`, `SUMMARY:${escapeIcs(title)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
  lines.push('END:VEVENT');
}

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response('Not found', { status: 404 });
  try {
    const verified = await roomRequest(env, { action: 'verify-calendar-feed-link', token });
    if (!verified.ok || !(await verified.json()).ok) return new Response('Not found', { status: 404 });
    const [calendar, apart] = await Promise.all([
      readRepoFile(env, 'calendar/events.json', { events: {} }),
      readRepoFile(env, 'apart/apart.json', { entries: [] })
    ]);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Project Lover Boy//Shared Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Us'];
    for (const [date, items] of Object.entries(calendar.events || {})) {
      for (const event of Array.isArray(items) ? items : []) {
        const title = event.kind === 'whatsapp-call' ? `WhatsApp ${event.callType || ''} call`.trim() : event.title || 'Our event';
        const details = [event.time, event.kind === 'whatsapp-call' && event.durationMinutes ? `Duration: ${event.durationMinutes} minutes` : '', event.kind === 'whatsapp-call' && event.initiatedBy ? `Started by: ${event.initiatedBy}` : '', event.note].filter(Boolean).join(' · ');
        const uid = escapeIcs(event.id || `${date}-${title}`);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(event.startTime || '')) {
          const [hour, minute] = event.startTime.split(':').map(Number);
          const endMinutes = hour * 60 + minute + 60;
          const endDate = new Date(date + 'T00:00:00Z'); endDate.setUTCMinutes(endMinutes);
          const endLocal = endDate.toISOString().slice(0, 10).replace(/-/g, '') + 'T' + endDate.toISOString().slice(11, 16).replace(':', '') + '00';
          const startLocal = date.replace(/-/g, '') + 'T' + event.startTime.replace(':', '') + '00';
          const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
          lines.push('BEGIN:VEVENT', `UID:${uid}@project-lover-boy`, `DTSTAMP:${stamp}`, `DTSTART:${startLocal}`, `DTEND:${endLocal}`, `SUMMARY:${escapeIcs(title)}`);
          if (details) lines.push(`DESCRIPTION:${escapeIcs(details)}`);
          lines.push('END:VEVENT');
        } else addAllDay(lines, uid, date, title, details);
      }
    }
    for (const entry of apart.entries || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(entry.until || '')) continue;
      if (entry.until < entry.from) continue;
      addAllDayRange(lines, `quiet-${entry.id}`, entry.from, entry.until, `🌙 ${entry.author || 'Us'} · quiet days`, entry.note || '');
    }
    const yearNow = new Date().getUTCFullYear();
    for (const special of [
      { id: 'charlotte-birthday', title: '🎂 Charlotte’s birthday', month: '03', day: '09' },
      { id: 'luke-birthday', title: '🎂 Luke’s birthday', month: '07', day: '21' },
      { id: 'anniversary', title: '💛 Our anniversary', month: '10', day: '26' }
    ]) {
      for (let year = yearNow - 1; year <= yearNow + 5; year++) addAllDay(lines, special.id, `${year}-${special.month}-${special.day}`, special.title);
    }
    lines.push('END:VCALENDAR');
    return new Response(lines.map(foldLine).join('\r\n') + '\r\n', {
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, no-store', 'content-disposition': 'inline; filename="our-calendar.ics"', 'x-content-type-options': 'nosniff' }
    });
  } catch {
    return new Response('Calendar feed temporarily unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
