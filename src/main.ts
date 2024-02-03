#!/usr/bin/env node
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import Yargs from 'yargs/yargs';
import PodmanEnvironment from './artifactBuilder/env/PodmanEnvironment';
import SpigotArtifactBuilder from './artifactBuilder/spigot/SpigotArtifactBuilder';
import { APP_ROOT, getArtifactBuilderRegistry } from './constats';
import PodmanApi from './podman/PodmanApi';

const yargs = Yargs(process.argv.slice(2))
  .command('app', 'Start the main app / web interface')
  .command('builder <builder>',
    'Run the specified artifact builder and exit',
    (yargs) => {
      return yargs
        .positional('builder', {
          type: 'string',
          describe: 'The artifact builder to run',
          choices: getArtifactBuilderRegistry().getNames()
        })
        .option('builderArg', {
          type: 'array',
          describe: 'Build arguments passed to the artifact builder'
        });
    }
  )
  .locale('en')
  .strict();
const argv = yargs.parseSync();

if (argv._.length === 0) {
  yargs
    .getHelp()
    .then((helpText) => {
      console.log(helpText);
      process.exit(1);
    });
} else if (argv._[0] === 'app') {
  const podmanApi = new PodmanApi('/run/user/1000/podman/podman.sock');
  const podmanEnvironment = new PodmanEnvironment(podmanApi);

  process.once('SIGINT', () => {
    console.log('Received SIGINT, aborting running builders...');
    podmanEnvironment.abortRunningBuilders()
      .catch((error) => console.error('Error while aborting running builders:', error))
      .finally(() => process.exit(0));

    process.once('SIGINT', () => {
      console.error('Received second SIGINT, forcing exit');
      process.exit(100);
    });
  });

  (async () => {
    const prunedContainers = await podmanApi.deleteStoppedContainers({ label: ['dev.sprax.minecraft-artifact-builder'] });
    if (prunedContainers.length > 0) {
      console.log(`Pruned ${prunedContainers.length} old containers`);
    }

    await podmanApi.buildImage(Path.join(APP_ROOT, 'resources', 'Containerfile'), 'minecraft-artifact-builder:latest', { 'dev.sprax.minecraft-artifact-builder': '1' });

    const spigotArtifactBuilder = new SpigotArtifactBuilder();
    const versions = (await spigotArtifactBuilder.getKnownVersions()).filter((version) => version !== 'latest');
    let i = 0;
    for (const version of versions) {
      console.log(`Building ${++i}/${versions.length}: ${version}`);
      const alreadyBuilt = await spigotArtifactBuilder.artifactAlreadyInOutputDir({ outputDirectory: '/home/christian/Downloads/_minecraft-artifacts-builder/spigot/' }, new Map([['version', version]]));
      if (alreadyBuilt === true) {
        console.log('Skipping this version because it has already been built');
        continue;
      }

      try {
        await podmanEnvironment.runBuilderInOwnContainer('spigot', new Map([['version', version]]));
      } catch (err) {
        console.error('Error while building', version, err);
      }
    }
  })();
} else if (argv._[0] === 'builder') {
  const builderName = argv.builder;
  const builderArgs = argv.builderArg;

  if (typeof builderName !== 'string' || builderName.length === 0) {
    console.error('Invalid builder name:', builderName);
    process.exit(1);
  }
  if (builderArgs != null && !Array.isArray(builderArgs)) {
    console.error('Invalid builder arguments:', builderArgs);
    process.exit(1);
  }

  const parsedBuilderArgs = new Map<string, string>();
  if (builderArgs != null) {
    for (const builderArg of builderArgs) {
      const indexOfEquals = builderArg.toString().indexOf('=');

      let key = builderArg.toString();
      let value = '';
      if (indexOfEquals !== -1) {
        key = builderArg.toString().substring(0, indexOfEquals);
        value = builderArg.toString().substring(indexOfEquals + 1);
      }

      if (parsedBuilderArgs.has(key)) {
        console.error('Duplicate builder argument:', key);
        process.exit(1);
      }
      parsedBuilderArgs.set(key, value);
    }
  }

  console.log('Running artifact builder', builderName, 'with args', parsedBuilderArgs);
  const builder = getArtifactBuilderRegistry().get(builderName)!;

  const workspacePath = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'minecraft-artifact-builder-'));
  builder.build({ workspacePath, outputDirectory: '/artifact_out/' }, parsedBuilderArgs)
    .then(() => console.log('Successfully built artifact'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => {
      Fs.rmSync(workspacePath, { recursive: true, force: true });
    });
} else {
  console.error('Unknown command:', argv._[0]);
  process.exit(1);
}
