/* eslint-disable import/prefer-default-export */
/* eslint-disable no-await-in-loop */
/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */

export const getAllExtensionReducers = async () => {
  const modules = import.meta.glob('./extensions/**/reducers.js', {
    import: 'default',
    eager: true,
  });

  let extensionReducers = {};
  for (const path in modules) {
    // import all reducers from each file and combine them into one object
    extensionReducers = {
      ...extensionReducers,
      ...(await modules[path]),
    };
  }

  return extensionReducers;
};

export const getAllExtensionRoutes = async () => {
  let extensionRoutes = [];
  // get all routes file path from extensions folder
  const modules = import.meta.glob('./extensions/**/routes.js', {
    import: 'default',
    eager: true,
  });

  for (const path in modules) {
    // get all routes from each file and concat them to extensionRoutes
    extensionRoutes = extensionRoutes.concat(await modules[path]);
  }

  return extensionRoutes;
};

export const getAllExtensionTranslationFile = async () => {
  const extensionTranslations = {};
  // default locale is en
  const modules = import.meta.glob(`./extensions/**/translations/en.json`, {
    import: 'default',
    eager: true,
  });

  for (const path in modules) {
    Object.assign(extensionTranslations, await modules[path]);
  }

  return extensionTranslations;
};

export const getAllExtensionTransactionFile = async () => {
  let extensionTransactions = [];
  const modules = import.meta.glob(`./extensions/**/transactions/*`, {
    eager: true,
  });

  for (const path in modules) {
    const importedModule = await modules[path];
    extensionTransactions = extensionTransactions.concat({
      name: importedModule.PROCESS_NAME,
      alias: importedModule.PROCESS_ALIAS,
      process: importedModule,
      unitType: importedModule.UNIT_TYPE,
    });
  }

  return extensionTransactions;
};

export const getAllExtensionTransactionStateData = async () => {
  const extensionTransactionStateData = {};
  const modules = import.meta.glob(`./extensions/**/stateData/TransactionPage/*`, {
    eager: true,
  });

  for (const path in modules) {
    const importedModule = await modules[path];
    const { processName, getStateData } = importedModule;
    Object.assign(extensionTransactionStateData, {
      [processName]: getStateData,
    });
  }

  return extensionTransactionStateData;
};

export const getAllExtensionInboxStateData = async () => {
  const extensionTransactionStateData = {};
  const modules = import.meta.glob(`./extensions/**/stateData/InboxPage/*`, {
    eager: true,
  });

  for (const path in modules) {
    const importedModule = await modules[path];
    const { processName, getStateData } = importedModule;
    Object.assign(extensionTransactionStateData, {
      [processName]: getStateData,
    });
  }

  return extensionTransactionStateData;
};
