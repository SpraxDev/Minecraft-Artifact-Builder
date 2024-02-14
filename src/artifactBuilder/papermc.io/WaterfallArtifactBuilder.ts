import AbstractPaperMcIoArtifactBuilder from './AbstractPaperMcIoArtifactBuilder';

export default class WaterfallArtifactBuilder extends AbstractPaperMcIoArtifactBuilder {
  getApiProjectName(): string {
    return 'waterfall';
  }
}
