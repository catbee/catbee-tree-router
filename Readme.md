# Tree router for catbee

With this package on can do linke this

```javascript
let treeRouter = require('catbee-tree-router');

let signal = treeRouter.signal;

function redirect (target) {
  return signal('redirect', { target: target });
}

module.exports = (registry) => {
  let route = treeRouter.route(registry);

  route('/', {
    name: 'root',
    handler: signal('mainPage')
  }, [
    route('users', {
      handler: signal('usersPage')
    }, [
      route(':id', {
        handler: signal('userPage', { some: 'thing' })
      }, [
        route('edit', {
          handler: signal('userEditPage')
        })
      ])
    ]),
    route('orders', {
      handler: signal('ordersPage')
    }, [
      route(':id', {
        name: 'order',
        handler: signal('orderPage')
      })
    ]),
    route('old-users', {
      handler: redirect('/users')
    })
  ]);
};
```
