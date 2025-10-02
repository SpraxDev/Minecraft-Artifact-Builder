import Fs from 'node:fs';
import Path from 'node:path';
import ArtifactBuilder from '../ArtifactBuilder.ts';
import type BuildContext from '../BuildContext.ts';
import FileDownloader from '../FileDownloader.ts';

export default class PurpurArtifactBuilder extends ArtifactBuilder {
  private readonly VERSION_INPUT_PATTERN = /^\d+(\.\d+){0,2}(-[a-z][a-z0-9]*)?-\d+$/i;
  private readonly API_BASE_URL = 'https://api.purpurmc.org';

  async getKnownVersions(): Promise<string[]> {
    const versions = await this.fetchProjectVersions();
    const buildsForVersions = new Map<string, string[]>();

    for (const version of versions) {
      buildsForVersions.set(version, await this.fetchAllSuccessBuildsForVersion(version));
    }

    return Array.from(buildsForVersions.entries())
      .map(([version, builds]) => builds.map(build => `${version}-${build}`))
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

    const artifactPath = Path.join(context.outputDirectory, projectVersion, projectBuildNumber);
    if (Fs.existsSync(artifactPath)) {
      throw new Error(`Artifact already exists at ${artifactPath}`);
    }

    await Fs.promises.mkdir(artifactPath, { recursive: true });
    try {
      const buildInfoUrl = `${this.API_BASE_URL}/v2/purpur/${encodeURIComponent(projectVersion)}/${projectBuildNumber}`;
      await FileDownloader.downloadFile(buildInfoUrl, Path.join(artifactPath, 'build-info.json'));
      await FileDownloader.downloadFile(`${buildInfoUrl}/download`, Path.join(artifactPath, `purpur-${projectVersion}-${projectBuildNumber}.jar`));
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

  private async fetchProjectVersions(): Promise<string[]> {
    const response = await fetch(`${this.API_BASE_URL}/v2/purpur`);
    if (!response.ok) {
      throw new Error(`Failed to fetch project info: ${response.status} ${response.statusText}`);
    }

    const versions = (await response.json() as any)['versions'];
    if (!Array.isArray(versions)) {
      throw new Error(`Failed to fetch project info: 'versions' is not an array`);
    }

    return versions;
  }

  private async fetchAllSuccessBuildsForVersion(version: string): Promise<string[]> {
    const response = await fetch(`${this.API_BASE_URL}/v2/purpur/${encodeURIComponent(version)}?detailed=true`);
    if (!response.ok) {
      throw new Error(`Failed to fetch builds for version ${version}: ${response.status} ${response.statusText}`);
    }

    const buildsData = (await response.json() as any)['builds']?.all;
    if (!Array.isArray(buildsData)) {
      throw new Error(`Failed to fetch builds for version ${version}: 'builds.all' is not an array`);
    }

    const result: string[] = [];
    for (const buildData of buildsData) {
      if (typeof buildData !== 'object') {
        throw new Error(`Failed to fetch builds for version ${version}: 'builds.all' contains non-object`);
      }
      if (buildData.result === 'FAILURE') {
        continue;
      }
      if (buildData.result !== 'SUCCESS') {
        throw new Error(`Failed to fetch builds for version ${version}: 'builds.all' contains build with unknown result: ${buildData.result}`);
      }
      if (typeof buildData.build !== 'string') {
        throw new Error(`Failed to fetch builds for version ${version}: 'builds.all' contains build with non-string build number`);
      }

      result.push(buildData.build);
    }
    return result;
  }
}
