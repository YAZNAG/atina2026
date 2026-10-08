const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { asyncHandler, ok } = require('../../lib/http');
const { autoriser } = require('../../middlewares/auth');

router.use(autoriser('notification:lire'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [items, nonLues] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id, ...(req.query.nonLues === '1' && { lu: false }) },
        orderBy: { createdAt: 'desc' },
        take: Math.min(200, Number(req.query.limit) || 50),
      }),
      prisma.notification.count({ where: { userId: req.user.id, lu: false } }),
    ]);
    ok(res, { items, nonLues });
  })
);

router.post(
  '/:id/lue',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { id: Number(req.params.id), userId: req.user.id }, data: { lu: true } });
    ok(res, null);
  })
);

router.post(
  '/tout-lire',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user.id, lu: false }, data: { lu: true } });
    ok(res, null);
  })
);

module.exports = router;
