const lib = require('../dist').default;

lib({
    commandName: 'CR',
    currentVer: '1.0.0',
    packageName: '@baidu/tieba-cli-cr',
}).then(title => {
    console.log(title); // eslint-disable-line no-console
});
