import Path from 'node:path';
import ArtifactBuilderRegistry from './artifactBuilder/ArtifactBuilderRegistry';

let artifactBuilderRegistry: ArtifactBuilderRegistry;

export const APP_ROOT = Path.resolve(__dirname, '..');
export const IS_PRODUCTION = process.env.NODE_ENV?.toLowerCase() === 'production';

export function getArtifactBuilderRegistry(): ArtifactBuilderRegistry {
  if (artifactBuilderRegistry == null) {
    artifactBuilderRegistry = new ArtifactBuilderRegistry();
  }
  return artifactBuilderRegistry;
}
