const core = require('@actions/core');
const { 
  getVeracodeApplicationForPolicyScan,
  getVeracodeApplicationFindings
} = require('./services/application-service.js');
const { downloadJar } = require('./api/java-wrapper.js');
const { 
  createBuild, uploadFile, beginPreScan, checkPrescanSuccess, 
  getModules, beginScan, checkScanSuccess
} = require('./services/scan-service.js');
const appConfig = require('./app-cofig.js');

const vid = core.getInput('vid', { required: true });
const vkey = core.getInput('vkey', { required: true });
const appname = core.getInput('appname', { required: true });
const version = core.getInput('version', { required: true });
const filepath = core.getInput('filepath', { required: true });
const createprofile = core.getInput('createprofile', { required: true });
const include = core.getInput('include', { required: false });
const policy = core.getInput('policy', { required: false });
const scantimeout = core.getInput('scantimeout', { required: false });

function checkParameters() {
  if (createprofile.toLowerCase() !== 'true' && createprofile.toLowerCase() !== 'false') {
    core.setFailed('createprofile must be set to true or false');
    return false;
  }
  if (isNaN(scantimeout)) {
    core.setFailed('scantimeout must be a number');
    return false;
  }
  if (vid === '' || vkey === '' || appname === '' || version === '' || filepath === '') {
    core.setFailed('vid, vkey, appname, version, and filepath are required');
    return false;
  }
  return true;
}

async function run() {
  if (!checkParameters())
    return;

  const veracodeApp = await getVeracodeApplicationForPolicyScan(vid, vkey, appname, policy, createprofile);
  if (veracodeApp.appId === -1) {
    core.setFailed('Veracode Profile Not Found');
    return;
  }
  core.info(`Veracode App Id: ${veracodeApp.appId}`);

  const jarName = await downloadJar();

  const buildId = await createBuild(vid, vkey, jarName, veracodeApp.appId, version);
  core.info(`Veracode Policy Scan Created, Build Id: ${buildId}`);

  const uploaded = await uploadFile(vid, vkey, jarName, veracodeApp.appId, filepath);
  core.info(`Artifact(s) uploaded: ${uploaded}`);

  // return and exit the app if the duration of the run is more than scantimeout
  let endTime = new Date();
  if (scantimeout !== '') {
    const startTime = new Date();
    endTime = new Date(startTime.getTime() + scantimeout * 1000 * 60);
  }
  
  if (include === '') {
    const autoScan = true;
    const prescan = await beginPreScan(vid, vkey, jarName, veracodeApp.appId, autoScan);
    core.info(`Pre-Scan Submitted: ${prescan}`);
  } else {
    const autoScan = false;
    const prescan = await beginPreScan(vid, vkey, jarName, veracodeApp.appId, autoScan);
    core.info(`Pre-Scan Submitted: ${prescan}`);
    while (true) {
      await sleep(appConfig().pollingInterval);
      core.info('Checking for Pre-Scan Results...');
      if (await checkPrescanSuccess(vid, vkey, jarName, veracodeApp.appId)) {
        core.info('Pre-Scan Success!');
        break;
      }
      if (scantimeout !== '' && endTime < new Date()) {
        core.setFailed(`Veracode Policy Scan Exited: Scan Timeout Exceeded`);
        return;
      }
    }

    const moduleIds = await getModules(vid, vkey, jarName, veracodeApp.appId, include);
    core.info(`Modules to Scan: ${moduleIds.toString()}`);
    const scan = await beginScan(vid, vkey, jarName, veracodeApp.appId, moduleIds.toString());
    core.info(`Scan Submitted: ${scan}`);
  }

  if (scantimeout === '')
    return;
  core.info('Waiting for Scan Results...');
  while (true) {
    await sleep(appConfig().pollingInterval);
    core.info('Checking Scan Results...');
    const scanStatus = await checkScanSuccess(vid, vkey, jarName, veracodeApp.appId, buildId);
    if (scanStatus.scanCompleted) {
      core.info('Results Ready!');
      if (scanStatus.passFail === 'Did Not Pass') {
        core.setFailed('Veracode Policy Scan Failed');
      } 
      break;
    }
    if (endTime < new Date()) {
      core.setFailed(`Veracode Policy Scan Exited: Scan Timeout Exceeded`);
      return;
    }
  }
  await getVeracodeApplicationFindings(vid, vkey, veracodeApp, buildId);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

run()