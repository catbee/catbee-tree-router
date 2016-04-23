var router = require('./dist/tree-router');

module.exports = {
  route: router.route,
  signal: router.signal,
  register: router.register,
  registry: router.registry
};
