import AbstractPaperMcIoArtifactBuilder from './AbstractPaperMcIoArtifactBuilder';

export default class VelocityArtifactBuilder extends AbstractPaperMcIoArtifactBuilder {
  getApiProjectName(): string {
    return 'velocity';
  }
}
