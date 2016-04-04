let chai = require('chai');
let sinon = require('sinon');
let sinonChai = require('sinon-chai');

let treeRouter = require('./tree-router');

chai.use(sinonChai);
let expect = chai.expect;

describe('RouteRegistry', () => {
  let registry,
    usersRoute,
    ordersRoute;

  beforeEach(() => {
    registry = new treeRouter.RouteRegistry();
    usersRoute = {
      name: 'users',
      toString: () => 'users route string'
    };
    ordersRoute = {
      name: 'orders'
    };
  });

  it('should add a route to the registry', () => {
    registry.addRoute(usersRoute);
    expect(registry.byName(usersRoute.name)).to.equal(usersRoute);
  });

  it('should throw when adding duplicate route name', () => {
    registry.addRoute(usersRoute);
    // can't check for actual error type, babel messes up class hierarchy
    expect(() => registry.addRoute(usersRoute)).to.throw();
  });

  describe('matching a route', () => {
    beforeEach(() => {
      usersRoute.matches = sinon.spy(() => false);
      ordersRoute.matches = sinon.spy(() => false);
      registry.addRoute(usersRoute);
      registry.addRoute(ordersRoute);
    });

    it('should test each route for matching', () => {
      registry.matchingRoute('/');
      expect(usersRoute.matches).to.be.calledWith('/');
      expect(ordersRoute.matches).to.be.calledWith('/');
    });

    it('should find matching route', () => {
      usersRoute.matches = sinon.spy(() => true);
      let found = registry.matchingRoute('/');
      expect(found).to.equal(usersRoute);
    });

    it('should return null if no route found', () => {
      let found = registry.matchingRoute('/');
      expect(found).to.equal(null);
    });
  });
});

describe('TreeRouterService', () => {
  let service,
    currentRoute,
    parentRoute,
    registry;

  beforeEach(() => {
    parentRoute = { path: () => 'parent path' };
    currentRoute = {
      parent: parentRoute,
      path: () => 'current path'
    };
    registry = { byName: sinon.spy(() => currentRoute) };
    service = new treeRouter.TreeRouterService(registry);
  });

  describe('parent route request', () => {
    it('should get parent route path', () => {
      let found = service.parent('child');
      expect(registry.byName).to.be.calledWith('child');
      expect(found).to.equal(parentRoute.path());
    });

    it('should return null for route without parent', () => {
      registry.byName = () => parentRoute;
      let found = service.parent('parent');
      expect(found).to.equal(null);
    });

    it('should return null if no route found', () => {
      registry.byName = () => null;
      let found = service.parent('child');
      expect(found).to.equal(null);
    });

    it('should replace params with provided arguments', () => {
      parentRoute.path = () => '/some/:id?foo=:bar';
      let found = service.parent('child', {
        id: '42',
        bar: 'foo'
      });
      expect(found).to.equal('/some/42?foo=foo');
    });
  });

  describe('named route request', () => {
    it('should find route by name', () => {
      let found = service.named('some');
      expect(registry.byName).to.be.calledWith('some');
      expect(found).to.equal(currentRoute.path());
    });

    it('should return null if no route found', () => {
      registry.byName = () => null;
      let found = service.named('child');
      expect(found).to.equal(null);
    });

    it('should replace params with provided arguments', () => {
      currentRoute.path = () => '/some/:id?foo=:bar';
      let found = service.named('child', {
        id: '42',
        bar: 'foo'
      });
      expect(found).to.equal('/some/42?foo=foo');
    });
  });
});

describe('Route', () => {
  let handler;

  beforeEach(() => {
    handler = {
      signal: 'handleRoute',
      args: {
        signalArgs: 'value'
      }
    };
  });

  it('should have a path of its url', () => {
    let route = new treeRouter.Route('/some', 'test', handler);
    expect(route.path()).to.equal('/some');
  });

  it('should have a path combined with parent route', () => {
    let route = new treeRouter.Route('/thing', 'bar', handler);
    route.parent = new treeRouter.Route('/some', 'foo', handler);
    expect(route.path()).to.equal('/some/thing');
  });

  it('should match its path', () => {
    let route = new treeRouter.Route('/some/:id', 'test', handler);
    expect(route.matches('/some/item')).to.equal(true);
  });

  it('should not match foreign path', () => {
    let route = new treeRouter.Route('/some/:id', 'test', handler);
    expect(route.matches('/some/other/item')).to.equal(false);
  });

  it('should have a provided name', () => {
    let route = new treeRouter.Route('/some', 'test', handler);
    expect(route.name).to.equal('test');
  });

  it('should use url as a name', () => {
    let route = new treeRouter.Route('/some', null, handler);
    expect(route.name).to.equal('/some');
  });

  it('should return a signal without args', () => {
    delete handler.args;
    let route = new treeRouter.Route('/some', null, handler);
    expect(route.handle('http://nowhere.com/some')).to.eql({
      signal: handler.signal,
      args: {
        routeName: '/some'
      }
    });
  });

  it('should include signal args', () => {
    let route = new treeRouter.Route('/some', null, handler);
    expect(route.handle('http://nowhere.com/some')).to.eql({
      signal: handler.signal,
      args: Object.assign({
        routeName: '/some'
      }, handler.args)
    });
  });

  it('should include url args', () => {
    let route = new treeRouter.Route('/some/:id', null, handler);
    expect(route.handle('http://nowhere.com/some/foo')).to.eql({
      signal: handler.signal,
      args: Object.assign({
        routeName: '/some/:id',
        id: 'foo'
      }, handler.args)
    });
  });

  it('should include query args', () => {
    let route = new treeRouter.Route('/some?id=:id', 'some', handler);
    expect(route.handle('http://nowhere.com/some?id=foo')).to.eql({
      signal: handler.signal,
      args: Object.assign({
        routeName: 'some',
        id: 'foo'
      }, handler.args)
    });
  });
});

describe('route factory', () => {
  let props, route, registry;

  beforeEach(() => {
    registry = { addRoute: sinon.spy() };
    route = treeRouter.route(registry);
    props = {
      name: 'foo',
      handler: {
        signal: 'test',
        args: {}
      }
    };
  });

  it('should create a route instance', () => {
    let result = route('/some', props);
    expect(result).to.eql(new treeRouter.Route('/some', props.name, props.handler));
  });

  it('should ignore trailing slash', () => {
    let result = route('/some/', props);
    expect(result).to.eql(new treeRouter.Route('/some', props.name, props.handler));
  });

  it('should set children\'s parent', () => {
    let child = { };
    let result = route('/some/', props, [ child ]);
    expect(child.parent).to.equal(result);
  });

  it('should add a route to the registry', () => {
    let result = route('/some', props);
    expect(registry.addRoute).to.be.calledWith(result);
  });
});

describe('signal factory', () => {
  it('should craete a signal descriptor', () => {
    let signal = treeRouter.signal('foo', { bar: 'baz' });
    expect(signal).to.eql({
      signal: 'foo',
      args: {
        bar: 'baz'
      }
    });
  });

  it('should create a signal descriptior with empty args', () => {
    let signal = treeRouter.signal('foo');
    expect(signal).to.eql({
      signal: 'foo',
      args: { }
    });
  });
});

describe('register function', () => {
  let locator;

  beforeEach(() => {
    locator = { registerInstance: sinon.spy() };
  });

  it('should register args provider', () => {
    treeRouter.register(locator);
    expect(locator.registerInstance).to.be.calledWith(
      'urlArgsProvider', new treeRouter.ArgsProvider(treeRouter.ROUTE_REGISTRY));
  });

  it('should register router service', () => {
    treeRouter.register(locator);
    expect(locator.registerInstance).to.be.calledWith(
      'treeRouter', new treeRouter.TreeRouterService(treeRouter.ROUTE_REGISTRY));
  });
});
