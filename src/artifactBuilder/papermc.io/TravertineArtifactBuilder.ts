import AbstractPaperMcIoArtifactBuilder from './AbstractPaperMcIoArtifactBuilder';

export default class TravertineArtifactBuilder extends AbstractPaperMcIoArtifactBuilder {
  getApiProjectName(): string {
    return 'travertine';
  }
}
