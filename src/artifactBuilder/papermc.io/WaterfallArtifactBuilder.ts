import AbstractPaperMcIoArtifactBuilder from './AbstractPaperMcIoArtifactBuilder.ts';

export default class WaterfallArtifactBuilder extends AbstractPaperMcIoArtifactBuilder {
  getApiProjectName(): string {
    return 'waterfall';
  }
}
