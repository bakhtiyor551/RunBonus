export function requireSuperAdmin(req, res, next) {
  if (req.adminRole !== 'super_admin') {
    return res.status(403).json({
      error: 'Изменять настройки бонусов может только Super Admin',
    });
  }
  next();
}
