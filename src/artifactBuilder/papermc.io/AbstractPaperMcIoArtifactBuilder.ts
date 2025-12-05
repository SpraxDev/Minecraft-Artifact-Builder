import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import ArtifactBuilder from '../ArtifactBuilder.ts';
import type BuildContext from '../BuildContext.ts';
import FileDownloader from '../FileDownloader.ts';

export type ProjectBuild = {
  build: number;
  channel: string;
  downloads: { [key: string]: { name: string, sha256: string, url: string } };
};

export default abstract class AbstractPaperMcIoArtifactBuilder extends ArtifactBuilder {
  private readonly VERSION_INPUT_PATTERN = /^\d+(\.\d+){0,2}(-[a-z][a-z0-9]*)?-\d+$/i;
  protected readonly API_BASE_URL = 'https://fill.papermc.io';

  abstract getApiProjectName(): string;

  async getKnownVersions(): Promise<string[]> {
    const versions = await this.fetchProjectVersions();
    const buildsForVersions = new Map<string, ProjectBuild[]>();

    for (const version of versions) {
      buildsForVersions.set(version, await this.fetchAllBuildsForVersion(version));
    }

    return Array.from(buildsForVersions.entries())
      .map(([version, builds]) => builds.map(build => `${version}-${build.build}`))
      .reduce((acc, builds) => acc.concat(builds), [])
      .sort((a, b) => {
        const aVersion = a.substring(0, a.lastIndexOf('-'));
        const aBuild = a.substring(a.lastIndexOf('-') + 1);

        const bVersion = b.substring(0, b.lastIndexOf('-'));
        const bBuild = b.substring(b.lastIndexOf('-') + 1);

        if (aVersion !== bVersion) {
          return -1 * a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        }
        return -1 * (Number.parseInt(aBuild, 10) - Number.parseInt(bBuild, 10));
      });
  }

  async build(context: Readonly<BuildContext>, args: Map<string, string>): Promise<void> {
    const versionInput = args.get('version');
    if (versionInput == null) {
      throw new Error('version argument is not provided');
    }
    if (!this.VERSION_INPUT_PATTERN.test(versionInput)) {
      throw new Error(`versionInput argument is not in the correct format ({SemVer}-{BuildNumber}): ${versionInput}`);
    }

    const projectVersion = versionInput.substring(0, versionInput.lastIndexOf('-'));
    const projectBuildNumber = versionInput.substring(versionInput.lastIndexOf('-') + 1);

    const buildInfo = await this.fetchBuild(projectVersion, parseInt(projectBuildNumber, 10));
    if (buildInfo === null) {
      throw new Error(`Build ${projectBuildNumber} for version ${projectVersion} does not exist`);
    }

    const artifactPath = Path.join(context.outputDirectory, projectVersion, projectBuildNumber);
    if (Fs.existsSync(artifactPath)) {
      throw new Error(`Artifact already exists at ${artifactPath}`);
    }

    await Fs.promises.mkdir(artifactPath, { recursive: true });
    try {
      const buildInfoUrl = this.getBuildInfoUrl(projectVersion, parseInt(projectBuildNumber, 10));
      await FileDownloader.downloadFile(buildInfoUrl, Path.join(artifactPath, 'build-info.json'));

      for (const downloadKey in buildInfo.downloads) {
        const download = buildInfo.downloads[downloadKey];
        await FileDownloader.downloadFile(download.url, Path.join(artifactPath, download.name));
      }
    } catch (err) {
      await Fs.promises.rm(artifactPath, { recursive: true });
      throw err;
    }
  }

  async artifactAlreadyInOutputDir(context: Pick<BuildContext, 'outputDirectory'>, args: Map<string, string>): Promise<boolean | null> {
    const version = args.get('version');
    if (version == null) {
      throw new Error('version argument is not provided');
    }
    if (!this.VERSION_INPUT_PATTERN.test(version)) {
      throw new Error(`version argument is not in the correct format (x.y.z-b / x.y.z-SNAPSHOT-b): ${version}`);
    }

    const projectVersion = version.substring(0, version.lastIndexOf('-'));
    const projectBuildNumber = version.substring(version.lastIndexOf('-') + 1);

    const artifactPath = Path.join(context.outputDirectory, projectVersion, projectBuildNumber);
    return Fs.existsSync(artifactPath);
  }

  async artifactAlreadyInOutputDirBulk(context: Pick<BuildContext, 'outputDirectory'>, args: Map<string, string>[]): Promise<(boolean | null)[]> {
    const result: (boolean | null)[] = [];
    for (const arg of args) {
      result.push(await this.artifactAlreadyInOutputDir(context, arg));
    }
    return result;
  }

  async fetchProjectVersions(): Promise<string[]> {
    const response = await this.doFetch(`${this.API_BASE_URL}/v3/projects/${encodeURIComponent(this.getApiProjectName())}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch project info for project ${this.getApiProjectName()}: ${response.status} ${response.statusText}`);
    }

    const versionsFromApi = (await response.json() as any)['versions'];
    if (typeof versionsFromApi !== 'object') {
      throw new Error(`Failed to fetch project info for project ${this.getApiProjectName()}: 'versions' is not an object`);
    }

    const versions: string[] = [];
    for (const versionGroup in versionsFromApi) {
      const versionsInGroup = versionsFromApi[versionGroup];
      if (!Array.isArray(versionsInGroup)) {
        throw new Error(`Failed to fetch project info for project ${this.getApiProjectName()}: 'versions' group '${versionGroup}' is not an array`);
      }

      for (const version of (versionsInGroup as any[])) {
        if (typeof version !== 'string') {
          throw new Error(`Failed to fetch project info for project ${this.getApiProjectName()}: 'versions' group '${versionGroup}' contains non-string`);
        }
        versions.push(version);
      }
    }

    return versions;
  }

  protected async fetchBuild(version: string, build: number): Promise<ProjectBuild | null> {
    const response = await this.doFetch(this.getBuildInfoUrl(version, build));
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch build info for version ${version} of project ${this.getApiProjectName()}: ${response.status} ${response.statusText}`);
    }

    return this.parseProjectBuild(await response.json() as any);
  }

  protected async fetchAllBuildsForVersion(version: string): Promise<ProjectBuild[]> {
    const response = await this.doFetch(`${this.API_BASE_URL}/v3/projects/${encodeURIComponent(this.getApiProjectName())}/versions/${encodeURIComponent(version)}/builds`);
    if (!response.ok) {
      throw new Error(`Failed to fetch builds for version ${version} of project ${this.getApiProjectName()}: ${response.status} ${response.statusText}`);
    }

    const buildsData = (await response.json() as any);
    if (!Array.isArray(buildsData)) {
      throw new Error(`Failed to fetch builds for version ${version} of project ${this.getApiProjectName()}: 'builds' is not an array`);
    }

    const result: ProjectBuild[] = [];
    for (const buildData of buildsData) {
      if (typeof buildData !== 'object' || buildData == null) {
        throw new Error(`Failed to fetch builds for version ${version} of project ${this.getApiProjectName()}: 'builds' contains non-object`);
      }
      result.push(this.parseProjectBuild(buildData));
    }

    return result;
  }

  protected getBuildInfoUrl(version: string, build: number): string {
    return `${this.API_BASE_URL}/v3/projects/${encodeURIComponent(this.getApiProjectName())}/versions/${encodeURIComponent(version)}/builds/${build}`;
  }

  protected doFetch(url: string): Promise<Response> {
    const userAgent = `SpraxDev/Minecraft-Artifact-Builder (${Os.type()}; ${process.arch}; ${process.platform}) (+https://github.com/SpraxDev/Minecraft-Artifact-Builder)`;
    return fetch(url, {
      headers: {
        'User-Agent': userAgent,
      },
    });
  }

  private parseProjectBuild(apiData: any): ProjectBuild {
    const build = apiData['id'];
    if (typeof build !== 'number') {
      throw new Error(`Error parsing project build: 'build' is not a number`);
    }

    const channel = apiData['channel'];
    if (typeof channel !== 'string') {
      throw new Error(`Error parsing project build: 'channel' is not a string`);
    }

    const downloads = apiData['downloads'];
    for (const downloadKey in downloads) {
      const download = downloads[downloadKey];
      if (typeof download !== 'object' || download == null) {
        throw new Error(`Error parsing project build: 'downloads' contains non-object`);
      }
      if (typeof download['name'] !== 'string') {
        throw new Error(`Error parsing project build: 'downloads' contains non-string name`);
      }
      if (typeof download['url'] !== 'string') {
        throw new Error(`Error parsing project build: 'downloads' contains non-string url`);
      }
      if (typeof download['checksums'] !== 'object') {
        throw new Error(`Error parsing project build: 'downloads' contains non-object checksums`);
      }
      if (typeof download['checksums']['sha256'] !== 'string') {
        throw new Error(`Error parsing project build: 'downloads' contains non-string sha256`);
      }
    }

    return {
      build,
      channel,
      downloads: {
        ...Object.fromEntries(Object.entries(downloads).map(([key, download]) => [
          key,
          {
            name: (download as any)['name'],
            sha256: (download as any)['checksums']['sha256'],
            url: (download as any)['url'],
          },
        ])),
      }
    };
  }
}
