const { queryRef, executeQuery, validateArgsWithOptions, validateArgs, makeMemoryCacheProvider } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'catalog',
  service: 'unshelvd',
  location: 'us-central1'
};
exports.connectorConfig = connectorConfig;
const dataConnectSettings = {
  cacheSettings: {
    cacheProvider: makeMemoryCacheProvider()
  }
};
exports.dataConnectSettings = dataConnectSettings;

const listCatalogEntriesRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListCatalogEntries', inputVars);
}
listCatalogEntriesRef.operationName = 'ListCatalogEntries';
exports.listCatalogEntriesRef = listCatalogEntriesRef;

exports.listCatalogEntries = function listCatalogEntries(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, false);
  return executeQuery(listCatalogEntriesRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const searchCatalogByTitleRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'SearchCatalogByTitle', inputVars);
}
searchCatalogByTitleRef.operationName = 'SearchCatalogByTitle';
exports.searchCatalogByTitleRef = searchCatalogByTitleRef;

exports.searchCatalogByTitle = function searchCatalogByTitle(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(searchCatalogByTitleRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const searchCatalogRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'SearchCatalog', inputVars);
}
searchCatalogRef.operationName = 'SearchCatalog';
exports.searchCatalogRef = searchCatalogRef;

exports.searchCatalog = function searchCatalog(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(searchCatalogRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const listWorksRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListWorks', inputVars);
}
listWorksRef.operationName = 'ListWorks';
exports.listWorksRef = listWorksRef;

exports.listWorks = function listWorks(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, false);
  return executeQuery(listWorksRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;
