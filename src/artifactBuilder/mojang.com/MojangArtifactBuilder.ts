import Fs from 'node:fs';
import Path from 'node:path';
import ArtifactBuilder from '../ArtifactBuilder';
import BuildContext from '../BuildContext';
import FileDownloader from '../FileDownloader';
import { MojangVersionInfo } from './MojangVersionInfo';

export default class MojangArtifactBuilder extends ArtifactBuilder {
  async getKnownVersions(): Promise<string[]> {
    return (await this.fetchProjectVersions())
      .map(v => v.id);
  }

  async build(context: Readonly<BuildContext>, args: Map<string, string>): Promise<void> {
    const versionInput = args.get('version');
    if (versionInput == null) {
      throw new Error('version argument is not provided');
    }

    const artifactDirPath = Path.join(context.outputDirectory, versionInput);
    if (Fs.existsSync(artifactDirPath)) {
      throw new Error(`Artifact directory already exists at ${artifactDirPath}`);
    }

    await Fs.promises.mkdir(artifactDirPath, { recursive: true });
    try {
      const versionInfo = await this.findVersion(versionInput, await this.fetchProjectVersions());

      const versionInfoPath = Path.join(artifactDirPath, 'version-info.json');
      await FileDownloader.downloadFile(versionInfo.url, versionInfoPath);

      const parsedVersionInfo = JSON.parse(await Fs.promises.readFile(versionInfoPath, 'utf8'));
      if (typeof parsedVersionInfo?.downloads !== 'object') {
        throw new Error(`Failed to parse version-info.json: not an object`);
      }

      for (const downloadKey in parsedVersionInfo.downloads) {
        const download = parsedVersionInfo.downloads[downloadKey];
        if (typeof download !== 'object') {
          throw new Error(`Failed to parse version-info.json: downloads is not an object`);
        }
        if (typeof download.url !== 'string') {
          throw new Error(`Failed to parse version-info.json: downloads contains non-string url`);
        }

        await FileDownloader.downloadFile(download.url, Path.join(artifactDirPath, downloadKey + Path.extname(download.url)));
      }
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

    return Fs.existsSync(Path.join(context.outputDirectory, version));
  }

  async artifactAlreadyInOutputDirBulk(context: Pick<BuildContext, 'outputDirectory'>, args: Map<string, string>[]): Promise<(boolean | null)[]> {
    const result: (boolean | null)[] = [];
    for (const arg of args) {
      result.push(await this.artifactAlreadyInOutputDir(context, arg));
    }
    return result;
  }

  private async fetchProjectVersions(): Promise<MojangVersionInfo[]> {
    const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch version_manifest_v2: ${response.status} ${response.statusText}`);
    }

    const versions = (await response.json() as any)['versions'];
    if (!Array.isArray(versions)) {
      throw new Error(`Failed to fetch project info: 'versions' is not an array`);
    }
    for (const version of versions) {
      if (typeof version !== 'object') {
        throw new Error(`Failed to fetch version_manifest_v2: 'versions' contains non-object`);
      }
      if (typeof version.id !== 'string') {
        throw new Error(`Failed to fetch version_manifest_v2: 'versions' contains version with non-string id`);
      }
      if (typeof version.url !== 'string') {
        throw new Error(`Failed to fetch version_manifest_v2: 'versions' contains version with non-string url`);
      }
    }
    return versions;
  }

  private async findVersion(versionId: string, versions: MojangVersionInfo[]): Promise<MojangVersionInfo> {
    const version = versions.find(v => v.id === versionId);
    if (version == null) {
      throw new Error(`Unable to find version with id ${versionId}`);
    }
    return version;
  }
}
