import AbstractPaperMcIoArtifactBuilder from './AbstractPaperMcIoArtifactBuilder.ts';

export default class VelocityArtifactBuilder extends AbstractPaperMcIoArtifactBuilder {
  getApiProjectName(): string {
    return 'velocity';
  }
}
