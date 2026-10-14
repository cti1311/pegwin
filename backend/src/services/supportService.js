'use strict';
// Support service: threads, messages, help articles, content pages, meta.
// Throws domain errors { status, code, message } (mapped by errorHandler);
// returns { status, body } on success. No HTTP here.
const { TOPICS, toThread, toMessage } = require('../models/supportModel');
const { fail } = require('../helpers/domainError');
const Dto = require('../dtos/supportDto');

module.exports = (repo, ctx) => {
  const uid = ctx.uid;

  return {
    topics() {
      return { status: 200, body: { data: TOPICS } };
    },
    async threads(userId) {
      const rows = await repo.threads(userId);
      return { status: 200, body: { data: rows.map(toThread) } };
    },
    async openThread(userId, topic) {
      topic = Dto.parseTopic(topic);
      const id = uid();
      await repo.insertThread({ id, userId, topic });
      return { status: 201, body: { id, topic, status: 'open' } };
    },
    async threadMessages(userId, conversationId, query) {
      const limit = Math.min(100, Math.max(1, parseInt((query || {}).limit, 10) || 20));
      const th = await repo.ownedThread(conversationId, userId);
      if (!th.length) fail(404, 'NOT_FOUND', 'Conversation not found.');
      const before = (query || {}).before;
      const rows = await repo.messages(conversationId, before, limit);
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map(toMessage);
      return { status: 200, body: { data, nextCursor: hasMore ? data[data.length - 1].createdAt : null } };
    },
    async sendThreadMessage(userId, conversationId, text) {
      text = Dto.parseThreadText(text);
      const th = await repo.ownedThread(conversationId, userId);
      if (!th.length) fail(404, 'NOT_FOUND', 'Conversation not found.');
      const id = uid();
      await repo.insertMessage({ id, conversationId, text });
      return { status: 201, body: { id, text } };
    },
    async articles(query) {
      const q = query || {};
      const rows = await repo.articles(q.search, q.category);
      return { status: 200, body: { data: rows } };
    },
    async article(articleId) {
      const row = await repo.article(articleId);
      if (!row) fail(404, 'NOT_FOUND', 'Article not found.');
      return { status: 200, body: row };
    },
    async contentPage(slug) {
      const row = await repo.contentPage(slug);
      if (!row) fail(404, 'NOT_FOUND', 'Page not found.');
      return { status: 200, body: row };
    },
    async meta(table) {
      const rows = await repo.metaList(table);
      return { status: 200, body: { data: rows.map((r) => r.name) } };
    },
    async metaCities(state) {
      const rows = await repo.metaList('meta_cities', state);
      return { status: 200, body: { data: rows.map((r) => r.name) } };
    }
  };
};
