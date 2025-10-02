import AbstractPaperMcIoArtifactBuilder, { type ProjectBuild } from './AbstractPaperMcIoArtifactBuilder.ts';

export default class PaperArtifactBuilder extends AbstractPaperMcIoArtifactBuilder {
  private static readonly KNOWN_BROKEN_VERSIONS = [
    // API returns status 500
    '1.21.6-1',

    // API returns status 404
    '1.21.9-rc1',
  ];

  getApiProjectName(): string {
    return 'paper';
  }

  async getKnownVersions(): Promise<string[]> {
    return (await super.getKnownVersions())
      .filter(v => !PaperArtifactBuilder.KNOWN_BROKEN_VERSIONS.includes(v));
  }

  protected async fetchAllBuildsForVersion(version: string): Promise<ProjectBuild[]> {
    if (PaperArtifactBuilder.KNOWN_BROKEN_VERSIONS.includes(version)) {
      return [];
    }

    return super.fetchAllBuildsForVersion(version);
  }
}
