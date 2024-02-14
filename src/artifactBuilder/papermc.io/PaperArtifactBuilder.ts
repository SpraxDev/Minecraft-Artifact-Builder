import AbstractPaperMcIoArtifactBuilder from './AbstractPaperMcIoArtifactBuilder';

export default class PaperArtifactBuilder extends AbstractPaperMcIoArtifactBuilder {
  getApiProjectName(): string {
    return 'paper';
  }
}
