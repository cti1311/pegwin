'use strict';
// Engagement domain model: preference keys/columns, paging, row mapping,
// empty analytics overview. Pure functions; no DB here.
const PREF_KEYS = ['push', 'email', 'upcomingReminders', 'eventUpdates',
  'ticketUpdates', 'savedActivity', 'communityActivity', 'communityEvents',
  'mentionsReplies', 'recommendedEvents', 'nearbyEvents'];
const PREF_COLS = { push: 'push', email: 'email', upcomingReminders: 'upcoming_reminders',
  eventUpdates: 'event_updates', ticketUpdates: 'ticket_updates',
  savedActivity: 'saved_activity', communityActivity: 'community_activity',
  communityEvents: 'community_events', mentionsReplies: 'mentions_replies',
  recommendedEvents: 'recommended_events', nearbyEvents: 'nearby_events' };
const SAVED_WHEN = ['all', 'upcoming', 'this_week', 'this_month'];
// Server-side notification type -> category preference key. A push/email
// send requires the master toggle (push/email) AND its category toggle.
const NOTIF_PREF = {
  ticket_purchase: 'ticketUpdates',
  ticket_cancel: 'ticketUpdates',
  refund: 'ticketUpdates',
  event_cancel: 'eventUpdates',
  event_reschedule: 'eventUpdates',
  event_update: 'eventUpdates',
  community_announcement: 'communityActivity',
  host_notice: 'eventUpdates'
};
const ANALYTICS_SCOPES = ['community', 'event'];
const ANALYTICS_RANGES = ['7_days', '30_days', '3_months', '12_months'];

function pg(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}
function toPrefs(r) {
  const o = {};
  PREF_KEYS.forEach((k) => { o[k] = r ? r[PREF_COLS[k]] !== 0 : true; });
  return o;
}
function nto(n) {
  return { id: n.id, type: n.type, title: n.title, body: n.body,
    refType: n.ref_type || undefined, refId: n.ref_id || undefined,
    readAt: n.read_at ? new Date(n.read_at).toISOString() : null,
    createdAt: new Date(n.created_at).toISOString() };
}
function emptyOverview() {
  return { members: { total: 0, new: 0, deltaPct: 0 }, eventsHosted: 0,
    funnel: { views: 0, saved: 0, purchases: 0, attendees: 0 },
    audience: { newMembers: 0, returningPct: 0, avgEventsPerAttendee: 0, topInterests: [] },
    engagement: { activePct: 0, posts: 0, comments: 0, discussions: 0 },
    revenue: { total: 0, deltaPct: 0, ticketsSold: 0, avgTicketValue: 0 }, insights: [] };
}

module.exports = { PREF_KEYS, PREF_COLS, SAVED_WHEN, ANALYTICS_SCOPES, ANALYTICS_RANGES, NOTIF_PREF, pg, toPrefs, nto, emptyOverview };
