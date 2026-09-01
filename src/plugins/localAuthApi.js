const {attachAuthMiddleware} = require('../../scripts/local-auth-api.cjs');

module.exports = function localAuthApiPlugin() {
  return {
    name: 'local-auth-api',
    configureWebpack(config, isServer) {
      if (isServer) {
        return {};
      }
      const previous = config.devServer && config.devServer.setupMiddlewares;
      return {
        mergeStrategy: {'devServer.setupMiddlewares': 'replace'},
        devServer: {
          setupMiddlewares(middlewares, devServer) {
            if (devServer && devServer.app) {
              attachAuthMiddleware(devServer.app);
            }
            if (typeof previous === 'function') {
              return previous(middlewares, devServer);
            }
            return middlewares;
          },
        },
      };
    },
  };
};
