import AbstractPaperMcIoArtifactBuilder from './AbstractPaperMcIoArtifactBuilder';

export default class FoliaArtifactBuilder extends AbstractPaperMcIoArtifactBuilder {
  getApiProjectName(): string {
    return 'folia';
  }
}
