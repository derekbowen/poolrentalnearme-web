const glob = require('glob');
const path = require('path');

const extensionsFolder = path.join(__dirname, '../../');

exports.loadExtensionsTransactionProcesses = () => {
  const extensions = glob.sync('*/transactions/*', {
    cwd: extensionsFolder,
    ignore: ['common/transactions/*'],
  });

  return extensions.map((extension) => {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const process = require(path.join(extensionsFolder, extension));
    return {
      name: process.PROCESS_NAME,
      alias: process.PROCESS_ALIAS,
      process,
      unitTypes: process.UNIT_TYPES,
    };
  });
};
