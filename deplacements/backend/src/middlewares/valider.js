const { badRequest } = require('../lib/errors');

/** Valide req.body (ou query) avec un schéma zod et remplace par la valeur typée. */
const valider =
  (schema, source = 'body') =>
  (req, res, next) => {
    const r = schema.safeParse(req[source]);
    if (!r.success) {
      const details = r.error.issues.map((i) => ({ champ: i.path.join('.'), message: i.message }));
      return next(badRequest('Données invalides', details));
    }
    req[source] = r.data;
    next();
  };

module.exports = { valider };
