'use strict';
// Support domain model: pure constants and row mapping. No DB here.
const TOPICS = ['Event & Tickets', 'Payments & Refunds', 'Account & Profile', 'Community Issues', 'Something Else'];

function toThread(t) {
  return { id: t.id, topic: t.topic, status: t.status, updatedAt: new Date(t.updated_at).toISOString() };
}
function toMessage(m) {
  return { id: m.id, sender: m.sender, text: m.text, createdAt: new Date(m.created_at).toISOString() };
}

module.exports = { TOPICS, toThread, toMessage };
