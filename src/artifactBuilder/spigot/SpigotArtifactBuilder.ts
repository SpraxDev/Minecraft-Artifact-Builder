import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import ArtifactBuilder from '../ArtifactBuilder';
import BuildContext from '../BuildContext';
import FileDownloader from '../FileDownloader';
import Jdk from '../jdk/Jdk';
import JdkProvider from '../jdk/JdkProvider';
import VersionInfo from './VersionInfo';

type SpigotBuildArgKeys = 'version' | 'remapped' | string;

export default class SpigotArtifactBuilder extends ArtifactBuilder {
  private static readonly BUILD_TOOLS_URL = 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar';

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
        versions.push(version.substring(0, version.length - 5));
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
