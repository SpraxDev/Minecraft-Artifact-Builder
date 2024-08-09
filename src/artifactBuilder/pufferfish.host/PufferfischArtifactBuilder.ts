import Fs from 'node:fs';
import Path from 'node:path';
import ArtifactBuilder from '../ArtifactBuilder';
import BuildContext from '../BuildContext';
import FileDownloader from '../FileDownloader';

export default class PufferfischArtifactBuilder extends ArtifactBuilder {
  private readonly API_BASE_URL = 'https://ci.pufferfish.host';

  async getKnownVersions(): Promise<string[]> {
    const versions = await this.fetchAllJenkinsJobs();
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

    const projectVersion = versionInput.substring(0, versionInput.lastIndexOf('-'));
    const projectBuildNumber = versionInput.substring(versionInput.lastIndexOf('-') + 1);

    const artifactDirPath = Path.join(context.outputDirectory, projectVersion, projectBuildNumber);
    if (Fs.existsSync(artifactDirPath)) {
      throw new Error(`Artifact directory already exists at ${artifactDirPath}`);
    }

    await Fs.promises.mkdir(artifactDirPath, { recursive: true });
    try {
      const buildInfoResponse = await fetch(`${this.API_BASE_URL}/job/${encodeURIComponent(projectVersion)}/${encodeURIComponent(projectBuildNumber)}/api/json`);
      if (!buildInfoResponse.ok) {
        throw new Error(`Failed to fetch build info: ${buildInfoResponse.status} ${buildInfoResponse.statusText}`);
      }

      const buildInfoData: any = await buildInfoResponse.json();
      if (typeof buildInfoData !== 'object') {
        throw new Error(`Failed to fetch build info: response is not an object`);
      }
      if (buildInfoData.result !== 'SUCCESS') {
        throw new Error(`Failed to fetch build info: build is marked as ${buildInfoData.result}`);
      }
      if (!Array.isArray(buildInfoData.artifacts)) {
        throw new Error(`Failed to fetch build info: 'artifacts' is not an array`);
      }
      if (buildInfoData.artifacts.length !== 1) {
        throw new Error(`Failed to fetch build info: 'artifacts' does not contain exactly one artifact`);
      }

      const buildInfoArtifactPath = buildInfoData.artifacts[0];
      if (typeof buildInfoArtifactPath.relativePath !== 'string') {
        throw new Error(`Failed to fetch build info: 'artifacts' contains artifact with non-string relative path`);
      }
      if (typeof buildInfoArtifactPath.fileName !== 'string') {
        throw new Error(`Failed to fetch build info: 'artifacts' contains artifact with non-string file name`);
      }

      await FileDownloader.downloadFile(`${this.API_BASE_URL}/job/${encodeURIComponent(projectVersion)}/${encodeURIComponent(projectBuildNumber)}/artifact/${buildInfoArtifactPath.relativePath}`, Path.join(artifactDirPath, buildInfoArtifactPath.fileName));
    } catch (err) {
      await Fs.promises.rm(artifactDirPath, { recursive: true });
      throw err;
    }
  }

  async artifactAlreadyInOutputDir(context: Pick<BuildContext, 'outputDirectory'>, args: Map<string, string>): Promise<boolean | null> {
    const version = args.get('version');
    if (version == null) {
      throw new Error('version argument is not provided');
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

  private async fetchAllJenkinsJobs(): Promise<string[]> {
    const response = await fetch(`${this.API_BASE_URL}/api/json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch jenkins jobs: ${response.status} ${response.statusText}`);
    }

    const jobs = (await response.json() as any)['jobs'];
    if (!Array.isArray(jobs)) {
      throw new Error(`Failed to fetch jenkins jobs: 'jobs' is not an array`);
    }

    return jobs.map(job => job.name);
  }

  private async fetchAllSuccessBuildsForVersion(version: string): Promise<string[]> {
    const response = await fetch(`${this.API_BASE_URL}/job/${encodeURIComponent(version)}/api/json?tree=builds[id,result,artifacts[*]]`);
    if (!response.ok) {
      throw new Error(`Failed to fetch builds for version ${version}: ${response.status} ${response.statusText}`);
    }

    const buildsData = (await response.json() as any)['builds'];
    if (!Array.isArray(buildsData)) {
      throw new Error(`Failed to fetch builds for version ${version}: 'builds' is not an array`);
    }

    const result: string[] = [];
    for (const buildData of buildsData) {
      if (typeof buildData !== 'object') {
        throw new Error(`Failed to fetch builds for version ${version}: 'builds' contains non-object`);
      }
      if (buildData.result === 'FAILURE' || buildData.result === 'ABORTED') {
        continue;
      }
      if (buildData.result !== 'SUCCESS') {
        throw new Error(`Failed to fetch builds for version ${version}: 'builds' contains build with unknown result: ${buildData.result}`);
      }
      if (typeof buildData.id !== 'string') {
        throw new Error(`Failed to fetch builds for version ${version}: 'builds' contains id\t with non-string build number`);
      }

      result.push(buildData.id);
    }
    return result;
  }
}
