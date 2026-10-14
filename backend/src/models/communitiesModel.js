'use strict';
// Communities domain model: pure constants, validation, paging, JSON helper.
// No database access here; see repository.js (queries) and service.js (flows).
const EDITABLE = { name: 'name', description: 'description', category: 'category', avatarUrl: 'avatar_url' };
const SETTINGS = {
  visibility: ['visibility', 'show_in_search', 'allow_recommendations', 'show_on_host_profile', 'join_policy', 'allow_member_invites'],
  'member-permissions': ['can_create_posts', 'can_comment', 'can_create_polls', 'can_create_events', 'can_submit_event_request', 'can_create_groups', 'can_invite_members', 'can_view_directory', 'require_approval_before_publishing', 'allow_external_links'],
  'moderation-settings': ['auto_spam_detection', 'hold_flagged_for_review', 'admins_can_moderate', 'moderators_can_moderate', 'require_post_approval', 'require_member_approval', 'guidelines', 'prohibited_content'],
  'notification-settings': ['community_activity', 'community_events'],
  'approval-settings': ['require_approval', 'admins_can_approve', 'show_on_host_profile']
};
const REPORT_ACTIONS = ['remove_content', 'warn', 'block', 'dismiss'];
const EXPORT_TYPES = ['members', 'content', 'events', 'full'];
const TEAM_ROLES = ['admin', 'moderator'];

function pg(query) {
  const q = query || {};
  return {
    p: Math.max(1, parseInt(q.page, 10) || 1),
    l: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20))
  };
}
const J = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
const now = () => new Date().toISOString();

function validateCreate(b) {
  if (!b.name || b.name.length > 100) return 'name 1-100 required';
  if (b.interests && (!Array.isArray(b.interests) || b.interests.length > 5)) return 'interests<=5';
  if (b.discoveryRadiusKm !== undefined && (b.discoveryRadiusKm < 5 || b.discoveryRadiusKm > 100)) return 'radius 5-100';
  return null;
}

module.exports = { EDITABLE, SETTINGS, REPORT_ACTIONS, EXPORT_TYPES, TEAM_ROLES, pg, J, now, validateCreate };
