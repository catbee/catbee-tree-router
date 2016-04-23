let routeHelper = require('catbee/lib/helpers/routeHelper');
let URI = require('catberry-uri').URI;


/**
 * Base class for all tree router related  error types
 */
class TreeRouterError extends Error {
  constructor (msg, name) {
    super();
    this.name = name;
    this.message = msg;
  }
}


/**
 * Thrown when trying to add a route with already existing name to the registry
 */
class DuplicatedRouteError extends TreeRouterError {
  constructor (route) {
    super(`Route name of ${route} is duplicated, every route must provide its own unique name`,
         'DuplicatedRouteError');
  }
}


/**
 * Registry stores all application routes and manages access to them
 */
class RouteRegistry {
  constructor () {
    this._routes = Object.create(null);
  }

  /**
   * Returns a route matching provided path or null if none found
   * @param {String} path
   * @returns {Route} matching route
   */
  matchingRoute (path) {
    /* eslint-disable guard-for-in */
    for (let routeName in this._routes) {
      let currentRoute = this._routes[routeName];
      if (currentRoute.matches(path)) {
        return currentRoute;
      }
    }
    /* eslint-enable guard-for-in */
    return null;
  }

  /**
   * Adds a route to the registry or throws if route name is already occupied
   * @param {Route} route
   * @throws {DuplicatedRouteError}
   */
  addRoute (route) {
    if (route.name in this._routes) {
      throw new DuplicatedRouteError(route);
    }
    this._routes[route.name] = route;
  }

  /**
   * Returns a route object with specified name
   * @param {String} name
   * @returns {Route}
   */
  byName (name) {
    return this._routes[name];
  }
}


/**
 * Args provider overring default catbee URLArgsProvider.
 * Hooks up tree router to the framework
 */
class ArgsProvider {
  /**
   * Creates an args provider using supplied registry
   * @param {RouteRegistry} routeRegistry
   */
  constructor (routeRegistry) {
    this._routeRegistry = routeRegistry;
  }

  /**
   * implementation of catbee args provider interface
   * @param {URI} location
   * @returns {Object} signal and args
   */
  getArgsAndSignalByUri (location) {
    let route = this._routeRegistry.matchingRoute(location.path);
    return route ? route.handle(location) : {};
  }
}


/**
 * Service for getting route information in actions
 */
class TreeRouterService {
  /**
   * Creates router service using supplied registry
   * @param {RouteRegistry} routeRegistry
   */
  constructor (routeRegistry) {
    this._routeRegistry = routeRegistry;
  }

  /**
   * Returns path of a parent route substituting path and query params for provided args
   * @param {String} name of a current route
   * @param {Object} args used for path and query params substitution
   * @returns {String} path of a  parent route
   */
  parent (name, args) {
    let current = this._routeRegistry.byName(name);
    let parent = current ? current.parent : null;
    return parent ? this._replaceParams(parent.path(), args) : null;
  }

  /**
   * Returns path of a named route substituting path and query params for provided args
   * @param {String} name of a route to get
   * @param {Object} args used for path and query params substitution
   * @returns {String} path of a named route
   */
  named (name, args) {
    let found = this._routeRegistry.byName(name);
    if (!found) {
      return null;
    }
    return this._replaceParams(found.path(), args);
  }

  _replaceParams (path, args) {
    return Object.keys(args || {}).reduce(
      (acc, curr) => acc.replace(':' + curr, args[curr]), path);
  }
}


/**
 * Route item, encapsulates tree hiearachy, stores handlers for each route
 */
class Route {
  /**
   * Creates new route instance
   * @param {String} url - route url, will be used instead of name if latter is falsy
   * @param {String} name - route name, can be used to identify route
   * @param {Object} handler - route handler (signal + args)
   */
  constructor (url, name, handler) {
    this._url = url.startsWith('/') ? url : '/' + url;
    this._name = name;
    this._handler = handler;
    this._parent = null;
  }

  _compiledPath () {
    return routeHelper.compileRoute(new URI(this.path()));
  }

  /**
   * Returns true if route can handle specified path
   * @param {String} path
   * @returns {Boolean}
   */
  matches (path) {
    let compiled = this._compiledPath();
    return compiled.expression.test(path);
  }

  /**
   * Returns signal and args that handles current route
   * @param {String} uri of a handled request
   * @returns {Object} handler object (signal + args)
   */
  handle (uri) {
    let compiled = this._compiledPath();
    let uriArgs = compiled.map(new URI(uri));
    let args = Object.assign({ routeName: this.name }, uriArgs, this._handler.args);
    return {
      signal: this._handler.signal,
      args: args
    };
  }

  /**
   * Returs full path of a current route concatenating all parents' paths
   * @returns {String} full path
   */
  path () {
    if (!this.parent) {
      return this._url;
    }
    let parentPath = this.parent.path();
    parentPath = parentPath.endsWith('/') ? parentPath.substr(0, parentPath.length - 1) : parentPath;
    return parentPath + this._url;
  }

  get name () {
    return this._name || this._url;
  }

  get parent () {
    return this._parent;
  }

  set parent (parent) {
    if (this._parent) {
      return;
    }
    this._parent = parent;
  }

  toString () {
    return `Route (name=${this.name}, path=${this.path()}, handler=${this._handler.signal})`;
  }
}


/**
 * Creates new route factory function for specified registry
 * @param {RouteRegistry} routeRegistry to create factory against
 * @returns {Function} route factory
 */
function routeFactory (routeRegistry) {
  return (url, props, children = []) => {
    let current = new Route(routeHelper.removeEndSlash(url), props.name, props.handler);
    for (let child of children) {
      child.parent = current;
    }
    routeRegistry.addRoute(current);
    return current;
  };
}


/**
 * Creates new instance of a route registry
 * @returns {RouteRegistry} instance
 */
function registry () {
  return new RouteRegistry();
}


/**
 * Creates simple handler object for specified signal and args
 * @param {String} name of a signal
 * @param {Object} args of a signal
 * @returns {Object} route handler
 */
function signal (name, args) {
  return {
    signal: name,
    args: args || {}
  };
}


/**
 * Registers a tree router withing catbee context usign provided route registry
 * @param {ServiceLocator} locator catbee service locator
 * @param {RouteRegistry} routeRegistry
 */
function register (locator, routeRegistry) {
  locator.registerInstance('urlArgsProvider', new ArgsProvider(routeRegistry));
  locator.registerInstance('treeRouter', new TreeRouterService(routeRegistry));
}


module.exports = {
  route: routeFactory,
  signal,
  register,
  registry,
  RouteRegistry,
  Route,
  DuplicatedRouteError,
  TreeRouterService,
  ArgsProvider
};
