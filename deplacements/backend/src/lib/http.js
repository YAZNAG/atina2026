/** Enveloppe un contrôleur async pour transmettre les erreurs à Express. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ok = (res, data, message) => res.json({ success: true, message, data });
const created = (res, data, message = 'Créé') => res.status(201).json({ success: true, message, data });

/** Pagination standard : ?page=1&limit=20 */
function pagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

const paginated = (res, items, total, { page, limit }) =>
  res.json({ success: true, data: items, meta: { total, page, limit, pages: Math.ceil(total / limit) } });

module.exports = { asyncHandler, ok, created, pagination, paginated };
