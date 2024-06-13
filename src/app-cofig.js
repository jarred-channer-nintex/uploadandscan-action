module.exports = appConfig;

function appConfig() {
  return {
    hostName: "api.veracode.com",
    policyUri: "/appsec/v1/policies",
    applicationUri: "/appsec/v1/applications",
    findingsUri: "/appsec/v2/applications",
    teamsUri: "/api/authn/v2/teams",
    pollingInterval: 30000,
    moduleSelectionTimeout: 60000,
  };
}
