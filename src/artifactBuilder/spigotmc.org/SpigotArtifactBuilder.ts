import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import ArtifactBuilder from '../ArtifactBuilder.ts';
import type BuildContext from '../BuildContext.ts';
import FileDownloader from '../FileDownloader.ts';
import type Jdk from '../jdk/Jdk.ts';
import JdkProvider from '../jdk/JdkProvider.ts';
import type VersionInfo from './VersionInfo.ts';

type SpigotBuildArgKeys = 'version' | 'remapped' | string;

export default class SpigotArtifactBuilder extends ArtifactBuilder {
  private static readonly BUILD_TOOLS_URL = 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar';

  private static readonly KNOWN_BROKEN_VERSIONS = [
    '3316', // Could not find artifact org.yaml:snakeyaml:jar:1.30-SNAPSHOT
    '1082', // Could not find artifact net.md-5:bungeecord-chat:jar:1.10-SNAPSHOT
    '888',  // Could not find artifact org.spigotmc:minecraft-server:jar:1.10-SNAPSHOT
    '887', // Could not find artifact org.spigotmc:minecraft-server:jar:1.10-SNAPSHOT

    // ref no longer exists
    '3858',
    '3428',
    '3321',
    '3299',
    '2970',
    '2839',
    '2813',
    '2754',
    '2573',
    '2442',
    '2416',
    '2415',
    '2119',
    '2075',
    '2063',
    '2062',
    '2055',
    '1997',
    '1916',
    '1866',
    '1764',
    '1760',
    '1759',
    '1704',
    '1656',
    '1655',
    '1593',
    '1592',
    '1587',
    '1519',
    '1494',
    '1354',
    '1357',
    '1080',
    '1014',
    '944',
    '985',
    '943',
    '934',
    '860',
    '760',
    '757',
    '756',
    '755',
    '773',
    '772',
    '712',
    '674',
    '486',
    '469',
    '435',

    // java.io.FileNotFoundException: BuildData/info.json (No such file or directory)
    '334',
    '333',
    '332',
    '331',
    '330',
    '328',
    '327',
    '326',
    '325',
    '324',
    '323',
    '320',
    '319',
    '318',
    '317',
    '315',
    '312',
    '311',
    '309',
    '308',
    '307',
    '306',
    '305',
    '304',
    '303',
    '302',
    '301',
    '300',
    '299',
    '298',
    '297',
    '296',
    '295',
    '294',
    '293',
    '292',
    '291',
    '290',
    '289',
    '288',
    '287',
    '286',
    '285',
    '284',
    '282',
    '281',
    '278',
    '277',
    '273',
    '272',
    '271',
    '270',
    '269',
    '268',
    '264',
    '263',
    '262',
    '259',
    '258',
    '256',
    '255',
    '254',
    '253',

    // stack overflow?
    '340',
    '338',
    '336',
    '335',

    // patches don't apply cleanly
    '4464',
    '4282',
    '3186',
    '3185',
    '3184',
    '2399',
    '357',
    '356',
    '355',

    // Error compiling Spigot maven-module: There are test failures
    '1450',
    '1449',
    '1448',
    '1447',
    '1446',
    '1445',
    '1444',
    '1443',
    '1442',
    '1441',
    '1440',
    '1439',
    '1438',
    '1437',
    '1436',
    '1435',
    '1434',
    '1433',
    '1432',
    '1431',
    '1430',
    '1428',
    '1427',
    '1426',
    '1423',
    '1422',

    // When calling it with --version: Declared library junit-platform-commons-1.10.2.jar not found
    '4325'
  ];

  async getKnownVersions(): Promise<string[]> {
    const response = await fetch('https://hub.spigotmc.org/versions/');
    if (!response.ok) {
      throw new Error(`Failed to fetch known Spigot versions: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const matches = html.matchAll(/<a href="([^"]+)">/g);
    const versions: string[] = [];
    for (const match of matches) {
      const version = match[1];
      if (version.endsWith('json')) {
        const versionName = version.substring(0, version.length - 5);
        if (!SpigotArtifactBuilder.KNOWN_BROKEN_VERSIONS.includes(versionName)) {
          versions.push(versionName);
        }
      }
    }

    versions.sort((a, b) => {
      if (a === 'latest') {
        return -1;
      }
      if (b === 'latest') {
        return 1;
      }

      const aIsSemver = a.includes('.');
      const bIsSemver = b.includes('.');
      if (aIsSemver && bIsSemver) {
        return -1 * a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (aIsSemver) {
        return -1;
      }
      if (bIsSemver) {
        return 1;
      }

      return -1 * (Number.parseInt(a, 10) - Number.parseInt(b, 10));
    });

    return versions;
  }

  async build(context: Readonly<BuildContext>, args: Map<SpigotBuildArgKeys, string>): Promise<void> {
    const version = args.get('version');
    if (version == null) {
      throw new Error('version argument is not provided');
    }

    console.log('Fetching version info...');
    const versionInfo = await this.fetchVersionInfo(version);
    if (versionInfo == null) {
      throw new Error(`Spigot version '${version}' does not exist`);
    }

    console.log('Downloading BuildTools...');
    const buildToolsPath = Path.join(context.workspacePath, 'BuildTools.jar');
    await FileDownloader.downloadFile(SpigotArtifactBuilder.BUILD_TOOLS_URL, buildToolsPath);

    let javaVersion = 8;
    if (versionInfo.javaVersions) {
      javaVersion = JdkProvider.CLASS_VERSION_TO_JDK_VERSION[versionInfo.javaVersions.at(-1)!];
      for (let i = versionInfo.javaVersions.length - 1; i >= 0; i--) {
        const jdkVersion = JdkProvider.CLASS_VERSION_TO_JDK_VERSION[versionInfo.javaVersions[i]];
        if (JdkProvider.canProvide(jdkVersion)) {
          javaVersion = jdkVersion;
          break;
        }
      }
    }

    const jdk = await new JdkProvider().provide(javaVersion);
    const artifactDir = Path.join(context.workspacePath, 'minecraft-artifact-builder');

    console.log('Running BuildTools...');
    await this.runBuildTools(context, jdk, buildToolsPath, artifactDir, version, args.get('remapped') === 'true');

    const artifactPath = Path.join(artifactDir, 'artifact.jar');
    if (!Fs.existsSync(artifactPath)) {
      throw new Error('Built artifact not found at expected location');
    }

    await Fs.promises.copyFile(artifactPath, Path.join(context.outputDirectory, `${await this.extractSpigotVersionString(jdk, artifactPath)} [${version}].jar`));
  }

  async artifactAlreadyInOutputDirBulk(context: Pick<BuildContext, 'outputDirectory'>, args: Map<string, string>[]): Promise<(boolean | null)[]> {
    const versionsToCheck = args.map((arg) => {
      const version = arg.get('version');
      if (version == null) {
        throw new Error('version argument is not provided');
      }
      return version;
    });

    const filesInOutputDir = await Fs.promises.readdir(context.outputDirectory, { withFileTypes: true });
    return versionsToCheck.map((version) => {
      if (version == 'latest') {
        return null;
      }

      return filesInOutputDir.some((fileName) => fileName.isFile() && fileName.name.endsWith(` [${version}].jar`));
    });
  }

  private async fetchVersionInfo(version: string): Promise<VersionInfo | null> {
    const response = await fetch(`https://hub.spigotmc.org/versions/${encodeURIComponent(version)}.json`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch version info for ${version}: ${response.status} ${response.statusText}`);
    }

    const jsonBody = await response.json();
    if (!(jsonBody != null && typeof jsonBody === 'object' && !Array.isArray(jsonBody))) {
      throw new Error(`Failed to fetch version info for ${version}: response body is not an JSON object`);
    }

    const name = (jsonBody as any)['name'];
    if (typeof name !== 'string') {
      throw new Error(`Failed to fetch version info for ${version}: 'name' is not a string`);
    }

    let javaVersions: VersionInfo['javaVersions'];

    const jsonBodyJavaVersion = (jsonBody as any)['javaVersions'];
    if (jsonBodyJavaVersion != null) {
      if (!Array.isArray(jsonBodyJavaVersion)) {
        throw new Error(`Failed to fetch version info for ${version}: 'javaVersions' is not an array`);
      }
      if (jsonBodyJavaVersion.length == 0 || jsonBodyJavaVersion.some((value) => typeof value !== 'number')) {
        throw new Error(`Failed to fetch version info for ${version}: 'javaVersions' is not number array`);
      }

      javaVersions = jsonBodyJavaVersion;
    }

    return { name, javaVersions };
  }

  private runBuildTools(context: BuildContext, jdk: Jdk, buildToolsPath: string, artifactDir: string, version: string, remapped: boolean): Promise<void> {
    const buildToolsProcess = ChildProcess.spawn(
      Path.join(jdk.javaHomePath, 'bin', 'java'),
      [
        '-jar', buildToolsPath,
        '--nogui',
        '--output-dir', artifactDir,
        '--final-name', 'artifact.jar',
        '--rev', version,
        '--compile', 'SPIGOT',
        remapped ? '--remapped' : ''
      ],
      {
        cwd: context.workspacePath,
        stdio: ['ignore', 'inherit', 'inherit']
      }
    );

    return new Promise((resolve, reject) => {
      buildToolsProcess.on('error', reject);
      buildToolsProcess.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Spigot BuildTools exited with code ${code}`));
          return;
        }

        resolve();
      });
    });
  }

  private async extractSpigotVersionString(jdk: Jdk, spigotJar: string): Promise<string> {
    const process = ChildProcess.spawn(
      Path.join(jdk.javaHomePath, 'bin', 'java'),
      ['-jar', spigotJar, '--version'],
      {
        cwd: Os.tmpdir(),
        stdio: ['ignore', 'pipe', 'inherit']
      }
    );

    return new Promise((resolve, reject) => {
      process.on('error', reject);

      let stdout = '';
      process.stdout.on('data', (chunk) => stdout += chunk.toString());
      process.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to extract Spigot version string: ${code}`));
          return;
        }

        const version = stdout.trim().split('\n').at(-1);
        if (version == null || !version.includes('-Spigot-')) {
          reject(new Error(`Failed to extract Spigot version string: ${stdout}`));
          return;
        }
        resolve(version);
      });
    });
  }
}
