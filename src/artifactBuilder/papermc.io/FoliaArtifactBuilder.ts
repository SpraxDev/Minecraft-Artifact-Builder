import AbstractPaperMcIoArtifactBuilder from './AbstractPaperMcIoArtifactBuilder.ts';

export default class FoliaArtifactBuilder extends AbstractPaperMcIoArtifactBuilder {
  getApiProjectName(): string {
    return 'folia';
  }
}
