import AbstractPaperMcIoArtifactBuilder from './AbstractPaperMcIoArtifactBuilder.ts';

export default class TravertineArtifactBuilder extends AbstractPaperMcIoArtifactBuilder {
  getApiProjectName(): string {
    return 'travertine';
  }
}
